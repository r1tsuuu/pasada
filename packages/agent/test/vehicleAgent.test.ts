import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { PROGRAM, STATIONS, VEHICLES, perFillCapStroops } from '@pasada/shared';
import type { Tranche } from '@pasada/shared';
import { FakeChain } from '../src/fakeChain';
import { PasadaStore } from '../src/store';
import { VehicleAgent } from '../src/vehicleAgent';
import { deviceHashFromUid } from '../src/deviceHash';
import type { StationRuntime, VehicleRuntime } from '../src/runtime';

async function setup() {
  const chain = new FakeChain();
  const store = new PasadaStore();
  const owner = Keypair.random();
  const vehicles: VehicleRuntime[] = VEHICLES.map((v) => {
    const kp = Keypair.random();
    return { ...v, deviceHash: deviceHashFromUid(v.tagUid), agentPublicKey: kp.publicKey(), agentSecret: kp.secret() };
  });
  const stations: StationRuntime[] = STATIONS.map((s) => {
    const kp = Keypair.random();
    return { ...s, publicKey: kp.publicKey(), secret: s.accredited ? kp.secret() : undefined };
  });
  for (const v of vehicles) {
    await chain.registerDevice({ ownerSecret: owner.secret(), deviceHash: v.deviceHash, agent: v.agentPublicKey });
    await chain.registerAgent({ ownerSecret: owner.secret(), deviceHash: v.deviceHash, agent: v.agentPublicKey, maxAmount: perFillCapStroops(v), expiresAt: PROGRAM.programEndsAt });
    await chain.fundEscrow({ ownerSecret: owner.secret(), deviceHash: v.deviceHash, amount: v.initialEscrowStroops });
  }
  const ensureTopUp = vi.fn(async (vehicle: VehicleRuntime): Promise<Tranche> => ({
    id: 't1', createdAt: '', updatedAt: '', vehicleId: vehicle.id, status: 'REQUESTED', amountStroops: 130_000_000n,
    rationale: '', paymentIntentId: 'pi_1', veloObjectId: 'pi_1', checkoutUrl: 'https://example/checkout',
    plan: { dailyLiters: 60, days: 2, requestLiters: 120, targetStroops: 120_000_000n, balanceStroops: 30_000_000n, heldStroops: 40_000_000n, amountStroops: 130_000_000n },
  }));
  const onPaid = vi.fn();
  const clock = () => new Date('2026-11-07T02:00:00Z');
  const agent = new VehicleAgent({ chain, store, program: PROGRAM, vehicles, stations, ensureTopUp, onPaid, clock });
  return { chain, store, agent, ensureTopUp, onPaid, vehicles, stations, owner };
}

describe('VehicleAgent', () => {
  it('S1: checks Noir, pays the station and records the tx', async () => {
    const { agent, chain, onPaid, stations } = await setup();
    const checkSpy = vi.spyOn(chain, 'checkPayment');
    const paySpy = vi.spyOn(chain, 'authorizePayment');
    const d = await agent.handleFill({ vehicleId: 'J1', stationId: 'S1', liters: 40 });
    expect(d.outcome).toBe('APPROVED');
    expect(d.approvedLiters).toBe(40);
    expect(d.amountStroops).toBe(40_000_000n);
    expect(d.authorizeTxHash).toMatch(/^[0-9a-f]{64}$/);
    expect(checkSpy).toHaveBeenCalledBefore(paySpy);
    expect(onPaid).toHaveBeenCalledWith('S1');
    expect(await chain.getPendingBalance(stations[0].publicKey)).toBe(40_000_000n);
    expect(d.explanation).toContain('₱480 (4 XLM)');
  });

  it('S2: caps an overfill at the tank size', async () => {
    const { agent } = await setup();
    const d = await agent.handleFill({ vehicleId: 'J2', stationId: 'S2', liters: 80 });
    expect(d.outcome).toBe('APPROVED_CAPPED');
    expect(d.approvedLiters).toBe(50);
    expect(d.reasons).toEqual(['OVER_TANK_CAPACITY']);
  });

  it('S3: holds a second fill within the hour for review, without a chain call', async () => {
    const { agent, chain, store } = await setup();
    await agent.handleFill({ vehicleId: 'J1', stationId: 'S1', liters: 40 });
    const paySpy = vi.spyOn(chain, 'authorizePayment');
    const d = await agent.handleFill({ vehicleId: 'J1', stationId: 'S1', liters: 30 });
    expect(d.outcome).toBe('HELD');
    expect(d.reasons).toEqual(['TOO_SOON']);
    expect(paySpy).not.toHaveBeenCalled();
    expect(store.getHeld(d.heldFillId!)?.status).toBe('NEEDS_REVIEW');

    const released = await agent.releaseHeld(d.heldFillId!);
    expect(released?.outcome).toBe('APPROVED');
    expect(released?.reasons).toContain('RELEASED_BY_PROGRAM');
    expect(store.getHeld(d.heldFillId!)?.status).toBe('RELEASED');
  });

  it('S4: refuses an unaccredited station before touching the chain', async () => {
    const { agent, chain } = await setup();
    const checkSpy = vi.spyOn(chain, 'checkPayment');
    const d = await agent.handleFill({ vehicleId: 'J2', stationId: 'S3', liters: 20 });
    expect(d.outcome).toBe('REFUSED');
    expect(d.reasons).toEqual(['UNACCREDITED_STATION']);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('S5: holds for funds, requests a top-up once, then pays when funds arrive', async () => {
    const { agent, chain, store, ensureTopUp, owner, vehicles } = await setup();
    const d = await agent.handleFill({ vehicleId: 'J3', stationId: 'S1', liters: 40 });
    expect(d.outcome).toBe('HELD');
    expect(d.reasons).toEqual(['AWAITING_FUNDS']);
    expect(ensureTopUp).toHaveBeenCalledTimes(1);
    expect(d.trancheId).toBe('t1');
    expect(store.getHeld(d.heldFillId!)?.status).toBe('AWAITING_FUNDS');
    expect(d.explanation).toContain('₱1,560 (13 XLM)');

    const j3 = vehicles.find((v) => v.id === 'J3')!;
    await chain.fundEscrow({ ownerSecret: owner.secret(), deviceHash: j3.deviceHash, amount: 130_000_000n });
    const released = await agent.processAwaitingFunds('J3');
    expect(released).toHaveLength(1);
    expect(released[0].outcome).toBe('APPROVED');
    expect(released[0].releasedFromHeldFillId).toBe(d.heldFillId);
    expect(await chain.getEscrowBalance(j3.deviceHash)).toBe(120_000_000n);
  });

  it('requests a top-up after a payment leaves the escrow low', async () => {
    const { agent, ensureTopUp } = await setup();
    // J1 starts at 12 XLM; 60 L (6 XLM) leaves 6 XLM, not below the 6 XLM threshold
    await agent.handleFill({ vehicleId: 'J1', stationId: 'S1', liters: 60 });
    expect(ensureTopUp).not.toHaveBeenCalled();
  });

  it('turns a contract error into a FAILED decision instead of throwing', async () => {
    const { agent, chain } = await setup();
    chain.failNext = 'DuplicateAuth';
    const d = await agent.handleFill({ vehicleId: 'J1', stationId: 'S1', liters: 10 });
    expect(d.outcome).toBe('FAILED');
    expect(d.errorName).toBe('DuplicateAuth');
    expect(d.reasons).toEqual(['CHAIN_ERROR']);
  });
});
