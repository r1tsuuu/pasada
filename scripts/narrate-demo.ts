// Generates one narration clip per DEMO_PLAN.md scene into out/audio/ and records each clip's length.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CARD_NARRATION, planScenes } from './demo-lib';

const VOICE = 'en-US-AndrewNeural';
const edgeTts = join(homedir(), '.local/bin/edge-tts');
mkdirSync('out/audio', { recursive: true });

const clips = planScenes().map((s) => {
  const file = `out/audio/scene-${s.id}.mp3`;
  execFileSync(edgeTts, ['--voice', VOICE, '--text', s.narration, '--write-media', file]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
  const fits = seconds <= s.plannedSeconds;
  console.log(`scene ${s.id}: clip ${seconds.toFixed(2)} s, planned ${s.plannedSeconds} s${fits ? '' : '  <- longer than planned'}`);
  return { id: s.id, seconds, plannedSeconds: s.plannedSeconds, file };
});
writeFileSync('out/audio/durations.json', JSON.stringify(clips, null, 2));

const seconds = (file: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
const cards = Object.entries(CARD_NARRATION).map(([id, text]) => {
  const file = `out/audio/card-${id}.mp3`;
  execFileSync(edgeTts, ['--voice', VOICE, '--text', text, '--write-media', file]);
  console.log(`card ${id}: clip ${seconds(file).toFixed(2)} s`);
  return { id, seconds: seconds(file), file };
});
writeFileSync('out/audio/cards.json', JSON.stringify(cards, null, 2));
