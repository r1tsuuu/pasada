// DEMO_MODE only: stands in for Velo's hosted checkout. The treasurer's payment is a real Stellar
// Testnet payment, signed here with a test key so there is no wallet popup. Velo itself is not called.
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { FakeVelo } from './client';

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

export class DemoVelo extends FakeVelo {
  private readonly horizon = new Horizon.Server(HORIZON_TESTNET);
  private readonly treasurer: Keypair;

  constructor(treasurerSecret: string, private readonly receiver: string) {
    super();
    this.treasurer = Keypair.fromSecret(treasurerSecret);
  }

  override async pay(intentId: string) {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== 'created') return intent;
    intent.status = 'pending';
    try {
      const account = await this.horizon.loadAccount(this.treasurer.publicKey());
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.payment({ destination: this.receiver, asset: Asset.native(), amount: intent.amount }))
        .setTimeout(60)
        .build();
      tx.sign(this.treasurer);
      const { hash } = await this.horizon.submitTransaction(tx);
      intent.txHash = hash;
      intent.payerAddress = this.treasurer.publicKey();
      intent.status = 'paid';
    } catch (err) {
      intent.status = 'created';
      throw err;
    }
    return intent;
  }
}
