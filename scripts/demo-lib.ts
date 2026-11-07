// Shared by the demo video scripts: reads the scenes and narration from DEMO_PLAN.md.
import { readFileSync } from 'node:fs';

export interface PlanScene { id: number; plannedSeconds: number; narration: string }

export function planScenes(): PlanScene[] {
  const text = readFileSync('DEMO_PLAN.md', 'utf8');
  const re = /\*\*Scene (\d+) · [^(]*\((\d+) s\)[^\n]*\*\*[\s\S]*?- Narration: "([^"]+)"/g;
  const scenes = [...text.matchAll(re)].map((m) => ({ id: Number(m[1]), plannedSeconds: Number(m[2]), narration: m[3] }));
  if (scenes.length !== 9) throw new Error(`Expected 9 scenes in DEMO_PLAN.md, found ${scenes.length}`);
  return scenes;
}

/** Narration for the animated cards that have no recorded footage. */
export const CARD_NARRATION = {
  how: 'Pasada puts the rules inside the money. Each jeepney gets a Noir escrow and its own AI agent.',
  result: 'In one run: two fills paid, one refused, one top-up requested, five Noir transactions, and no driver ever pressed pay.',
} as const;
