// Records DEMO_PLAN.md scene by scene against the running demo-mode app (`npm run demo`).
// Every scene lasts at least as long as its narration clip (out/audio/durations.json): the hold at the
// end of a scene is lengthened to fit. Testnet waits are noted as `cuts` for the video build to trim.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium, type Locator, type Page } from 'playwright';
import { planScenes } from './demo-lib';

const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:5173';
const API = process.env.DEMO_API_URL ?? 'http://localhost:8080';
const SIZE = { width: 1920, height: 1080 };
const TAIL_SECONDS = 0.5; // breath after each clip before the next scene
const TX_TIMEOUT = 120_000;

interface SceneLog { id: number; start: number; end: number; cuts: [number, number][]; marks: { t: number; kind: string }[]; targetSeconds: number }

const clips: { id: number; seconds: number }[] = existsSync('out/audio/durations.json') ? JSON.parse(readFileSync('out/audio/durations.json', 'utf8')) : [];
const plan = planScenes();
const log: SceneLog[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state = await fetch(`${API}/api/state`).then((r) => r.json()).catch(() => null);
const config = await fetch(`${API}/api/config`).then((r) => r.json()).catch(() => null);
if (!config?.demo) throw new Error(`No demo-mode server at ${API}. Start it with: npm run demo`);
const j3 = state.vehicles.find((v: { id: string }) => v.id === 'J3');
if (j3?.escrow?.xlm !== '3' || state.tranches.length) throw new Error('Demo state is spent. Restart `npm run demo` to reset it, then record again.');

rmSync('out/scenes.json', { force: true });
rmSync('out/video', { recursive: true, force: true });
mkdirSync('out/video', { recursive: true });
const browser = await chromium.launch({ slowMo: 25 });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'out/video', size: SIZE } });

// Visible cursor with a click ripple, and a larger page so text reads at 1080p.
// A string, not a function: tsx rewrites functions with a helper that doesn't exist in the browser.
await context.addInitScript({ content: `(() => {
  const boot = () => {
    const style = document.createElement('style');
    style.textContent = 'input::-webkit-inner-spin-button{display:none}'
      + (location.port === '5173' ? '#root{zoom:1.2}' : '')
      + (location.port === '8080' ? 'body{zoom:1.7}' : '');
    document.head.append(style);
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;left:-50px;top:-50px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(232,60,60,.9);border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none';
    document.documentElement.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(232,60,60,.9);z-index:2147483646;pointer-events:none';
      document.documentElement.append(ring);
      ring.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(5)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => ring.remove();
    }, true);
  };
  // Live camera moves: scaling the page itself keeps text sharp, unlike zooming the video afterwards.
  window.__spot = (b, zmax) => {
    const body = document.body;
    const r = body.getBoundingClientRect();
    const z = Math.max(1, Math.min(zmax, 1700 / b.width, 760 / b.height));
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const ax = clamp(960 - z * (b.x + b.width / 2), 1920 - 1920 * z, 0);
    const ay = clamp(470 - z * (b.y + b.height / 2), 1080 - 1080 * z, 0);
    body.style.transformOrigin = '0 0';
    body.style.transition = 'transform .65s cubic-bezier(.22,1,.36,1)';
    body.style.transform = 'translate(' + (ax - (1 - z) * r.x) + 'px,' + (ay - (1 - z) * r.y) + 'px) scale(' + z + ')';
    const ring = document.createElement('div');
    ring.className = '__ring';
    ring.style.cssText = 'position:fixed;left:' + (ax + z * b.x - 8) + 'px;top:' + (ay + z * b.y - 8) + 'px;width:' + (z * b.width + 16) + 'px;height:' + (z * b.height + 16) + 'px;border:4px solid #f4c430;border-radius:18px;box-shadow:0 0 28px rgba(244,196,48,.65);z-index:2147483645;pointer-events:none';
    document.documentElement.append(ring);
    ring.animate([{ opacity: 0 }, { opacity: 0, offset: .3 }, { opacity: 1, offset: .5 }, { opacity: 0 }], { duration: 1700, easing: 'ease-out' }).onfinish = () => ring.remove();
  };
  window.__unspot = () => { document.body.style.transform = 'none'; document.querySelectorAll('.__ring').forEach((r) => r.remove()); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
})();` });

const t0 = Date.now();
const page = await context.newPage();
const now = () => (Date.now() - t0) / 1000;
let cursor = { x: 960, y: 540 };

let current: SceneLog | null = null;
const mark = (kind: string) => current?.marks.push({ t: now(), kind });

/** Pushes the camera in on an element and flashes a highlight around it. */
async function spotlight(el: Locator, zoom = 1.5) {
  const box = await el.boundingBox();
  if (!box) return;
  mark('zoom');
  await page.evaluate(`__spot(${JSON.stringify(box)}, ${zoom})`);
  await sleep(750);
}
const unspot = () => page.evaluate('window.__unspot && __unspot()');

async function moveTo(el: Locator) {
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error('element has no box');
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.move(target.x, target.y, { steps: 16 });
  cursor = target;
  await sleep(120);
}
async function click(el: Locator) {
  await moveTo(el);
  mark('click');
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(200);
}
async function typeLiters(value: string) {
  const input = page.locator('#liters');
  await click(input);
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(value, { delay: 130 });
  await sleep(120);
}
async function scrollTo(el: Locator, block: 'start' | 'center' = 'center') {
  await el.evaluate((node, b) => node.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await sleep(1100);
}
const scrollTop = async () => { await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await sleep(1100); };

/** Waits on Testnet. Keeps the first `keep` seconds on film and marks the rest to be trimmed. */
async function chainWait(scene: SceneLog, wait: Promise<unknown>, keep = 1.5) {
  const start = now();
  await wait;
  const end = now();
  if (end - start > keep + 0.6) scene.cuts.push([start + keep, end - 0.3]);
}

async function scene(id: number, run: (s: SceneLog) => Promise<void>) {
  const clip = clips.find((c) => c.id === id);
  const planned = plan.find((p) => p.id === id)!;
  const targetSeconds = clip ? clip.seconds + TAIL_SECONDS : planned.plannedSeconds;
  const s: SceneLog = { id, start: now(), end: 0, cuts: [], marks: [], targetSeconds };
  current = s;
  console.log(`scene ${id} at ${s.start.toFixed(1)} s`);
  await run(s);
  const cut = s.cuts.reduce((sum, [a, b]) => sum + (b - a), 0);
  const kept = now() - s.start - cut;
  if (kept < targetSeconds) await sleep((targetSeconds - kept) * 1000); // the deliberate pause
  s.end = now();
  log.push(s);
}

const feed = page.locator('section[aria-labelledby="feed-title"]');
const pump = page.locator('section[aria-labelledby="pump-title"]');
const program = page.locator('section[aria-labelledby="program-title"]');
const newest = feed.locator('article').first();
const tapButton = page.getByRole('button', { name: 'Tap jeepney card' });
const station = (name: string) => pump.locator('label', { hasText: name });
const card = (plate: string) => pump.getByRole('button', { name: new RegExp(plate) });
const appears = (el: Locator) => el.waitFor({ state: 'visible', timeout: TX_TIMEOUT });
const topUpCard = (inside: Locator) => inside.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');

await page.goto(WEB);
await newest.waitFor();
await page.getByText('Demo mode · Stellar Testnet').waitFor();
await program.getByText('₱360').first().waitFor({ timeout: 30_000 });
const lead = now();
await page.mouse.move(cursor.x, cursor.y);
await sleep(500);

await scene(1, async () => {});

await scene(2, async (s) => {
  await moveTo(station('Bituin Fuels'));
  await moveTo(card('NVE 1234'));
  await typeLiters('40');
  await click(tapButton);
  const decided = feed.locator('article', { hasText: 'NVE 1234' }).filter({ hasNotText: 'Sample' }).first().waitFor({ timeout: TX_TIMEOUT });
  // Lifts the agent's steps clear of the caption. (The tap button is renamed while busy, so don't target it.)
  await page.evaluate(() => scrollBy({ top: 320, behavior: 'smooth' }));
  await sleep(700);
  await chainWait(s, decided, 2.6);
  await page.evaluate(() => scrollTo({ top: 0 }));
});

await scene(3, async () => {
  mark('paid');
  await spotlight(newest, 1.5);
  await sleep(1600);
  await unspot();
  await sleep(350);
  await click(newest.getByRole('button', { name: /Rules checked/ }));
  await sleep(250);
  await spotlight(newest, 1.3);
});

await scene(4, async (s) => {
  await unspot();
  const link = newest.getByRole('link', { name: /Payment tx/ });
  const href = (await link.getAttribute('href'))!;
  const hash = href.split('/').pop();
  await chainWait(s, (async () => {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`https://api.stellar.expert/explorer/testnet/tx/${hash}`).catch(() => null);
      if (res?.ok) return;
      await sleep(2000);
    }
    throw new Error('Stellar Expert never indexed the payment');
  })(), 0.2);
  await link.evaluate((a) => a.removeAttribute('target'));
  await click(link);
  // Stellar Expert shows a spinner for a while: trim it and wait for the real transaction to render.
  const call = page.getByText('invoked contract').first();
  await chainWait(s, call.waitFor({ state: 'visible', timeout: 60_000 }), 0);
  await sleep(500);
  await spotlight(call, 1.6);
  await sleep(1900);
  await page.goBack();
  const claimed = newest.getByRole('link', { name: /Station claim tx/ });
  await chainWait(s, appears(claimed), 0);
  await page.mouse.move(cursor.x, cursor.y);
  mark('paid');
  await spotlight(newest, 1.5);
});

await scene(5, async (s) => {
  await unspot();
  await click(station('Kanto Fuel Depot'));
  await click(card('TXR 5678'));
  await typeLiters('20');
  await click(tapButton);
  const refused = feed.locator('article', { hasText: 'Refused' }).filter({ hasNotText: 'Sample' }).first();
  await chainWait(s, appears(refused), 0.3);
  mark('refused');
  await spotlight(refused, 1.6);
});

await scene(6, async (s) => {
  await unspot();
  await click(station('Bituin Fuels'));
  await click(card('PUJ 9012'));
  await typeLiters('40');
  await click(tapButton);
  const held = feed.locator('article', { hasText: 'PUJ 9012' }).filter({ hasText: 'Held' }).first();
  await chainWait(s, appears(held), 1.2);
  mark('held');
  await spotlight(held, 1.5);
  await sleep(1100);
  await unspot();
  await appears(program.getByRole('link', { name: 'Open demo checkout' }));
  await scrollTo(program.getByRole('heading', { name: 'Top-up requests' }), 'start');
  await spotlight(topUpCard(program.getByRole('link', { name: 'Open demo checkout' })), 1.5);
});

await scene(7, async (s) => {
  await unspot();
  const link = program.getByRole('link', { name: 'Open demo checkout' });
  await link.evaluate((a) => a.removeAttribute('target'));
  await click(link);
  await page.getByRole('button', { name: 'Pay as treasurer' }).waitFor();
  await sleep(2600);
  await click(page.getByRole('button', { name: 'Pay as treasurer' }));
  // The page reloads here and shows an empty dashboard until /api/state answers, so trim that too.
  await chainWait(s, appears(program.getByText('₱1,560 (13 XLM)', { exact: true })), 0.2);
  await page.mouse.move(cursor.x, cursor.y);
  await scrollTo(program.getByRole('heading', { name: 'Top-up requests' }), 'start');
});

await scene(8, async (s) => {
  const funded = program.getByText('Funded', { exact: true });
  await chainWait(s, appears(funded), 0.2);
  mark('funded');
  await spotlight(topUpCard(funded), 1.5);
  await sleep(1500);
  await unspot();
  await page.evaluate(() => scrollTo({ top: 0 }));
  const paid = feed.locator('article', { hasText: 'Funds arrived' }).first();
  await chainWait(s, Promise.all([appears(paid), appears(card('PUJ 9012').filter({ hasText: '₱1,440' }))]), 0.1);
  mark('paid');
  await spotlight(paid, 1.5);
});

await scene(9, async (s) => {
  const paid = feed.locator('article', { hasText: 'Funds arrived' }).first();
  await chainWait(s, appears(paid.getByRole('link', { name: /Station claim tx/ })), 0.1);
  await moveTo(paid.getByRole('link', { name: /Payment tx/ }));
  await sleep(500);
  await moveTo(paid.getByRole('link', { name: /Station claim tx/ }));
});

await page.mouse.move(cursor.x, cursor.y);
const video = page.video()!;
await context.close();
await browser.close();
copyFileSync(await video.path(), 'out/video/demo.webm');
writeFileSync('out/scenes.json', JSON.stringify({ video: 'out/video/demo.webm', leadSeconds: lead, scenes: log }, null, 2));
console.log('Recorded. Timestamps in out/scenes.json');
