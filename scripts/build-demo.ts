// Builds out/demo.mp4: title, animated problem and how-it-works cards, the recorded scenes with captions,
// labels and stamps, a results card, an end card, then music, UI sounds and narration on one timeline.
// This ffmpeg has no drawtext/subtitles filters, so all text is rendered to images and overlaid.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { CARD_NARRATION, planScenes } from './demo-lib';

const W = 1920;
const H = 1080;
const FPS = 30;
const TITLE_SECONDS = 3;
const END_SECONDS = 4.5;
const XFADE = 0.35;
const NARRATION_DELAY = 0.12;
const TAIL = 0.5;
const TARGET_LUFS = -16;
const REPO = 'github.com/r1tsuuu/pasada';
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800&family=Inter:wght@500&display=swap" rel="stylesheet">`;
const YELLOW = '#f4c430';

const LABELS: Record<number, string> = {
  2: 'The driver taps', 3: 'The agent decides and pays', 4: 'Proof on Stellar Testnet', 5: 'The agent refuses',
  6: 'The agent asks for money', 7: 'The treasurer pays', 8: 'The held fill pays itself', 9: 'Every peso, on the record',
};
// The transition INTO each scene.
const TRANSITIONS: Record<number, string> = { 2: 'circleopen', 3: 'smoothleft', 4: 'slideleft', 5: 'slideright', 6: 'smoothleft', 7: 'slideleft', 8: 'slideright', 9: 'smoothup' };
// Big stamps on the key moments, matched to the marks the recorder logged.
const STAMPS: Record<number, { mark: string; text: string; color: string }[]> = {
  3: [{ mark: 'paid', text: 'PAID ₱480', color: '#178a4c' }],
  4: [{ mark: 'paid', text: 'STATION PAID', color: '#178a4c' }],
  5: [{ mark: 'refused', text: 'REFUSED', color: '#c8322b' }],
  6: [{ mark: 'held', text: 'HELD', color: '#2456c8' }],
  8: [{ mark: 'funded', text: 'ESCROW FUNDED', color: '#b87400' }, { mark: 'paid', text: 'PAID ₱480', color: '#178a4c' }],
};

interface Mark { t: number; kind: string }
interface Scene { id: number; start: number; end: number; cuts: [number, number][]; marks: Mark[] }
const { video, scenes } = JSON.parse(readFileSync('out/scenes.json', 'utf8')) as { video: string; scenes: Scene[] };
const sceneClips = new Map((JSON.parse(readFileSync('out/audio/durations.json', 'utf8')) as { id: number; seconds: number }[]).map((c) => [c.id, c.seconds]));
const cardClips = new Map((JSON.parse(readFileSync('out/audio/cards.json', 'utf8')) as { id: string; seconds: number }[]).map((c) => [c.id, c.seconds]));
const narration = new Map(planScenes().map((s) => [s.id, s.narration]));
const frames = (s: number) => Math.ceil(s * FPS) / FPS;

rmSync('out/build', { recursive: true, force: true });
for (const d of ['title', 'end', 'problem', 'how', 'result']) mkdirSync(`out/build/${d}`, { recursive: true });

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const logo = (size: number) => `<div class="pop" style="background:${YELLOW};color:#1c2540;font:800 ${size}px 'Barlow Condensed',sans-serif;padding:8px 40px;border-radius:14px;letter-spacing:2px">Pasada</div>`;
const card = (body: string, road = true) => `<!doctype html>${FONT}<style>
  body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#1c2540;color:#fff;font-family:Inter,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative}
  .road{position:absolute;left:0;right:0;bottom:120px;height:6px;background:repeating-linear-gradient(90deg,${YELLOW} 0 90px,transparent 90px 170px);${road ? '' : 'display:none'}}
  .glow{position:absolute;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(circle,rgba(244,196,48,.16),transparent 62%)}
  body>*:not(.glow):not(.road){position:relative}
  .head{font:800 92px 'Barlow Condensed',sans-serif;margin:0;letter-spacing:.5px}
  .tile{background:#26315a;border:2px solid #3a4778;border-radius:20px;padding:30px 28px;box-sizing:border-box}
  .tag{font:800 30px 'Barlow Condensed',sans-serif;color:${YELLOW};letter-spacing:3px}
  .big{font:800 58px/1.08 'Barlow Condensed',sans-serif;margin-top:12px}
  .small{font-size:25px;color:#c8cfdf;margin-top:10px;line-height:1.3}
  .row{display:flex;gap:26px;align-items:stretch;justify-content:center}
  .arrow{align-self:center;width:64px;height:8px;background:${YELLOW};border-radius:4px;transform-origin:left}
</style><div class="glow"></div><div class="road"></div>${body}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });

/** Steps the animation frame by frame, so motion is smooth whatever the machine's speed. */
async function animate(html: string, dir: string, seconds: number) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(`(() => {
    const at = (el, fallback) => Number(el.dataset.at ?? fallback);
    const ease = 'cubic-bezier(.22,1,.36,1)';
    document.querySelectorAll('.pop').forEach((el) => el.animate([{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 650, delay: at(el, 0), easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'both' }));
    document.querySelectorAll('.rise').forEach((el, i) => el.animate([{ transform: 'translateY(46px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: at(el, 380 + i * 230), easing: ease, fill: 'both' }));
    document.querySelectorAll('.arrow').forEach((el) => el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 350, delay: at(el, 0), easing: ease, fill: 'both' }));
    document.querySelector('.road').animate([{ backgroundPosition: '0 0' }, { backgroundPosition: '-1360px 0' }], { duration: ${seconds * 1000}, fill: 'both' });
    document.querySelector('.glow').animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.15)' }], { duration: ${seconds * 1000}, fill: 'both' });
    document.getAnimations().forEach((a) => a.pause());
    window.__seek = (ms) => {
      document.getAnimations().forEach((a) => { a.currentTime = ms; });
      document.querySelectorAll('.count').forEach((el) => {
        const p = Math.min(1, Math.max(0, (ms - at(el, 0)) / 600));
        el.textContent = String(Math.round(Number(el.dataset.to) * (1 - (1 - p) ** 3)));
      });
    };
  })()`);
  const total = Math.round(seconds * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate(`__seek(${(f * 1000) / FPS})`);
    await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 94 });
  }
}

async function overlay(html: string, path: string) {
  await page.setContent(`<!doctype html>${FONT}<body style="margin:0;width:${W}px;height:${H}px;background:transparent;font-family:Inter,sans-serif;position:relative">${html}</body>`, { waitUntil: 'networkidle' });
  await page.screenshot({ path, omitBackground: true });
}
const caption = (text: string) => `<div style="position:absolute;left:0;right:0;bottom:22px;display:flex;justify-content:center"><div style="max-width:1640px;background:rgba(17,24,39,.88);color:#fff;font-size:34px;line-height:1.3;padding:12px 26px;border-radius:12px;text-align:center">${escapeHtml(text)}</div></div>`;

const problemSeconds = frames(sceneClips.get(1)! + TAIL);
const howSeconds = frames(cardClips.get('how')! + TAIL);
const resultSeconds = frames(cardClips.get('result')! + TAIL + 0.5);

await animate(card(`${logo(170)}<p class="rise" style="font-size:54px;margin:44px 0 0">Fuel aid that only buys fuel</p>`), 'out/build/title', TITLE_SECONDS);

const failure = (at: number, tag: string, text: string) => `<div class="tile pop" data-at="${at}" style="width:500px"><div class="tag">${tag}</div><div class="big">${text}</div></div>`;
await animate(card(`<div style="margin-top:-90px">
  <p class="head rise" data-at="100">Jeepney fuel aid keeps leaking</p>
  <p class="rise" data-at="700" style="font-size:36px;color:#c8cfdf;margin:18px 0 52px">₱651M paid out as cash in March 2026. About 142,000 vehicles in the program.</p>
  <div class="row">${failure(2300, 'SPEED', 'Stations get paid late')}${failure(3900, 'PURPOSE', 'Cash gets spent elsewhere')}${failure(5400, 'ACCESS', 'Drivers queue to claim it')}</div>
  <p class="rise" data-at="1000" style="font-size:20px;color:#8f9abb;margin:34px 0 0">Sources: Daily Tribune, PTV (2026)</p>
</div>`, false), 'out/build/problem', problemSeconds);

const node = (at: number, tag: string, text: string) => `<div class="tile pop" data-at="${at}" style="width:360px"><div class="tag">${tag}</div><div class="big" style="font-size:46px">${text}</div></div>`;
await animate(card(`<div style="margin-top:-90px">
  <p class="head rise" data-at="100">The rules live inside the money</p>
  <div class="row" style="margin-top:60px">
    ${node(1100, 'PROGRAM', 'Funds it and sets the limits')}<div class="arrow" data-at="1900"></div>
    ${node(2300, 'NOIR ESCROW', 'One for every jeepney')}<div class="arrow" data-at="3100"></div>
    ${node(3500, 'AI AGENT', 'Decides and pays')}<div class="arrow" data-at="4200"></div>
    ${node(4600, 'STATION', 'Claims it automatically')}
  </div>
  <p class="rise" data-at="5100" style="font-size:32px;color:${YELLOW};margin:46px 0 0">Running low? The agent requests its own top-up through Velo.</p>
</div>`, false), 'out/build/how', howSeconds);

const stat = (at: number, to: number, text: string, hero = false) => `<div class="tile pop" data-at="${at}" style="width:${hero ? 1180 : 400}px;${hero ? `background:${YELLOW};border-color:${YELLOW};color:#1c2540` : ''}"><div class="count" data-at="${at}" data-to="${to}" style="font:800 ${hero ? 130 : 110}px/1 'Barlow Condensed',sans-serif;${hero ? '' : `color:${YELLOW}`}">0</div><div style="font-size:${hero ? 40 : 28}px;margin-top:10px">${text}</div></div>`;
await animate(card(`<div style="margin-top:-90px">
  <p class="head rise" data-at="100" style="font-size:78px">One run on Stellar Testnet</p>
  <div class="row" style="margin-top:36px">${stat(900, 2, 'fills paid by the agent')}${stat(1900, 1, 'fill refused')}${stat(2700, 1, 'top-up requested')}${stat(3600, 5, 'Noir transactions')}</div>
  <div class="row" style="margin-top:26px">${stat(5000, 0, 'times a driver pressed pay', true)}</div>
</div>`, false), 'out/build/result', resultSeconds);

await animate(card(`${logo(110)}
  <p class="rise" style="font-size:42px;margin:44px 0 0">Team Pasada: Christian Angelo Naguio, Neil Aldous Biason</p>
  <p class="rise" style="font-size:46px;margin:26px 0 0;color:${YELLOW}">${REPO}</p>
  <p class="rise" style="font-size:26px;margin:56px 0 0;color:#c8cfdf;max-width:1400px;line-height:1.45">Recorded in demo mode: real Noir transactions on Stellar Testnet, signed with test keys, with waits trimmed.<br>A demo checkout stood in for Velo. Live Velo proof links are in the README.</p>`), 'out/build/end', END_SECONDS);

for (const s of scenes) {
  await overlay(caption(narration.get(s.id)!), `out/build/cap-${s.id}.png`);
  if (LABELS[s.id]) await overlay(`<div style="position:absolute;left:0;top:96px;display:flex;align-items:center;background:${YELLOW};color:#1c2540;font:800 38px 'Barlow Condensed',sans-serif;padding:8px 26px 8px 22px;border-radius:0 12px 12px 0;box-shadow:0 6px 18px rgba(0,0,0,.28)">${LABELS[s.id]}</div>`, `out/build/label-${s.id}.png`);
}
await overlay(caption(CARD_NARRATION.how), 'out/build/cap-how.png');
await overlay(caption(CARD_NARRATION.result), 'out/build/cap-result.png');

// Each stamp is a short transparent frame sequence that thumps into place.
const stampDirs = new Map<string, string>();
for (const list of Object.values(STAMPS)) {
  for (const st of list) {
    const dir = `out/build/stamp-${st.text.replace(/[^A-Z0-9]/g, '')}`;
    if (stampDirs.has(st.text)) continue;
    stampDirs.set(st.text, dir);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 9; f++) {
      const p = f / 8;
      const scale = 1.7 - 0.7 * (1 - (1 - p) ** 3);
      await overlay(`<div style="position:absolute;right:130px;top:150px;transform:rotate(-5deg) scale(${scale});transform-origin:center;opacity:${Math.min(1, p * 2.2)};background:rgba(255,255,255,.96);color:${st.color};border:8px solid ${st.color};border-radius:16px;padding:8px 30px;font:800 84px 'Barlow Condensed',sans-serif;letter-spacing:3px;box-shadow:0 10px 30px rgba(0,0,0,.28)">${escapeHtml(st.text)}</div>`, `${dir}/${String(f).padStart(2, '0')}.png`);
    }
  }
}
await browser.close();

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const draft = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const final = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const loopImage = (path: string, seconds: number) => ['-loop', '1', '-framerate', String(FPS), '-t', seconds.toFixed(3), '-i', path];
const captionFilter = (input: string) => `[${input}]format=rgba,fade=t=in:st=0.1:d=0.3:alpha=1[cap]`;

/** The parts of a scene left after removing its trimmed Testnet waits. */
function keeps(s: Scene): [number, number][] {
  const out: [number, number][] = [];
  let at = s.start;
  for (const [a, b] of s.cuts) {
    out.push([at, a]);
    at = b;
  }
  out.push([at, s.end]);
  return out;
}
/** Maps a recording time to seconds into the trimmed scene. */
function keptOffset(s: Scene, t: number) {
  let off = 0;
  for (const [a, b] of keeps(s)) {
    if (t <= b) return off + Math.max(0, t - a);
    off += b - a;
  }
  return off;
}

ff(['-framerate', String(FPS), '-i', 'out/build/title/%04d.jpg', ...draft, 'out/build/title.mp4']);
ff(['-framerate', String(FPS), '-i', 'out/build/end/%04d.jpg', ...draft, 'out/build/end.mp4']);
function cardClip(dir: string, cap: string, seconds: number, out: string) {
  ff(['-framerate', String(FPS), '-i', `out/build/${dir}/%04d.jpg`, ...loopImage(cap, seconds), '-filter_complex', `${captionFilter('1:v')};[0:v][cap]overlay=0:0:format=auto,format=yuv420p[o]`, '-map', '[o]', '-t', seconds.toFixed(3), ...draft, out]);
}
cardClip('problem', 'out/build/cap-1.png', problemSeconds, 'out/build/problem.mp4');
cardClip('how', 'out/build/cap-how.png', howSeconds, 'out/build/how.mp4');
cardClip('result', 'out/build/cap-result.png', resultSeconds, 'out/build/result.mp4');

const lengths = new Map<number, number>();
for (const s of scenes.filter((x) => x.id !== 1)) {
  const ranges = keeps(s).map(([a, b]): [number, number] => [a - s.start, b - s.start]); // the input is seeked to s.start
  const seconds = ranges.reduce((sum, [a, b]) => sum + (b - a), 0);
  lengths.set(s.id, seconds);
  const stamps = (STAMPS[s.id] ?? []).flatMap((st) => {
    const m = s.marks.find((x) => x.kind === st.mark);
    return m ? [{ ...st, at: Math.min(keptOffset(s, m.t) + 0.35, seconds - 0.6) }] : [];
  });
  const stampInputs = stamps.flatMap((st) => ['-framerate', String(FPS), '-i', `${stampDirs.get(st.text)}/%02d.png`]);
  const trims = ranges.map(([a, b], i) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS[p${i}]`).join(';');
  const joined = ranges.map((_, i) => `[p${i}]`).join('');
  const slide = `if(lt(t,.45),-${W}+${W}*(1-pow(1-t/.45,3)),if(lt(t,2.3),0,-${W}*pow((t-2.3)/.35,3)))`;
  let filter = `${trims};${joined}concat=n=${ranges.length}:v=1:a=0,fps=${FPS}[v];${captionFilter('1:v')};[v][cap]overlay=0:0:format=auto[c];` +
    `[c][2:v]overlay=x='${slide}':y=0:enable='lt(t,2.7)':format=auto[l0]`;
  stamps.forEach((st, i) => {
    filter += `;[${3 + i}:v]format=rgba,tpad=stop_mode=clone:stop_duration=1.25,fade=t=out:st=1.3:d=0.2:alpha=1,setpts=PTS+${st.at.toFixed(3)}/TB[st${i}];[l${i}][st${i}]overlay=0:0:eof_action=pass:format=auto[l${i + 1}]`;
  });
  filter += `;[l${stamps.length}]format=yuv420p[o]`;
  ff(['-ss', s.start.toFixed(3), '-i', video, ...loopImage(`out/build/cap-${s.id}.png`, seconds), ...loopImage(`out/build/label-${s.id}.png`, seconds), ...stampInputs, '-filter_complex', filter, '-map', '[o]', '-t', seconds.toFixed(3), ...draft, `out/build/scene-${s.id}.mp4`]);
}

// One timeline: every clip after the first starts XFADE seconds before the previous one ends.
interface Segment { file: string; seconds: number; transition: string; voice?: { file: string; seconds: number }; scene?: Scene }
const byId = (id: number) => scenes.find((s) => s.id === id)!;
const segments: Segment[] = [
  { file: 'out/build/problem.mp4', seconds: problemSeconds, transition: 'fadeblack', voice: { file: 'out/audio/scene-1.mp3', seconds: sceneClips.get(1)! } },
  { file: 'out/build/how.mp4', seconds: howSeconds, transition: 'slideleft', voice: { file: 'out/audio/card-how.mp3', seconds: cardClips.get('how')! } },
  ...scenes.filter((s) => s.id !== 1).map((s) => ({ file: `out/build/scene-${s.id}.mp4`, seconds: lengths.get(s.id)!, transition: TRANSITIONS[s.id], voice: { file: `out/audio/scene-${s.id}.mp3`, seconds: sceneClips.get(s.id)! }, scene: byId(s.id) })),
  { file: 'out/build/result.mp4', seconds: resultSeconds, transition: 'smoothup', voice: { file: 'out/audio/card-result.mp3', seconds: cardClips.get('result')! } },
  { file: 'out/build/end.mp4', seconds: END_SECONDS, transition: 'fadeblack' },
];

const sounds: { t: number; kind: string }[] = [{ t: 0.15, kind: 'stinger' }];
const voices: { file: string; start: number; end: number }[] = [];
const chain: string[] = [];
let at = TITLE_SECONDS;
let last = '[0:v]';
segments.forEach((seg, i) => {
  const start = at - XFADE;
  chain.push(`${last}[${i + 1}:v]xfade=transition=${seg.transition}:duration=${XFADE}:offset=${start.toFixed(3)}[x${i}]`);
  last = `[x${i}]`;
  sounds.push({ t: Math.max(0, start - 0.08), kind: 'whoosh' });
  for (const m of seg.scene?.marks ?? []) sounds.push({ t: start + keptOffset(seg.scene!, m.t), kind: m.kind });
  if (seg.voice) {
    const v = start + XFADE + NARRATION_DELAY;
    voices.push({ file: seg.voice.file, start: v, end: v + seg.voice.seconds });
  }
  if (seg.file.endsWith('result.mp4')) for (const ms of [900, 1900, 2700, 3600]) sounds.push({ t: start + ms / 1000, kind: 'click' });
  if (seg.file.endsWith('result.mp4')) sounds.push({ t: start + 5, kind: 'paid' });
  if (seg.file.endsWith('end.mp4')) sounds.push({ t: start + 0.2, kind: 'stinger' });
  at = start + seg.seconds;
});
const total = at;

voices.forEach((v, i) => {
  if (i && v.start < voices[i - 1].end) throw new Error(`Narration overlap at clip ${i + 1}: lengthen that scene`);
});
writeFileSync('out/build/timeline.json', JSON.stringify({ total, narration: voices.map((v) => [v.start, v.end]), sounds }, null, 1));
execFileSync('python3', ['scripts/make-audio.py'], { stdio: 'inherit' });

// Narration on top of the bed. One fixed gain afterwards: loudnorm's dynamic mode lifts the music between lines.
const delays = voices.map((v, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}:all=1,volume=1.5[n${i}]`).join(';');
const mixIn = ['[0:a]', ...voices.map((_, i) => `[n${i}]`)].join('');
ff(['-i', 'out/build/bed.wav', ...voices.flatMap((v) => ['-i', v.file]), '-filter_complex', `${delays};${mixIn}amix=inputs=${voices.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[a]`, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_s16le', 'out/build/mix-raw.wav']);
const measured = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', 'out/build/mix-raw.wav', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const integrated = Number([...measured.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()![1]);
const gain = TARGET_LUFS - integrated;
ff(['-i', 'out/build/mix-raw.wav', '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89`, '-c:a', 'pcm_s16le', 'out/build/mix.wav']);

const inputs = ['out/build/title.mp4', ...segments.map((s) => s.file)];
ff([...inputs.flatMap((f) => ['-i', f]), '-i', 'out/build/mix.wav', '-filter_complex', chain.join(';'), '-map', `${last}`, '-map', `${inputs.length}:a`, ...final, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', total.toFixed(3), 'out/demo.mp4']);

const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'default=nw=1', 'out/demo.mp4'], { encoding: 'utf8' });
console.log(probe.trim());
console.log(`gain ${gain.toFixed(2)} dB; size=${(statSync('out/demo.mp4').size / 1_000_000).toFixed(1)} MB`);
