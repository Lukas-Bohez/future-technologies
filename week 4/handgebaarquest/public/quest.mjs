export const THRESHOLD = 0.90;
export const targets = ['Peace', 'Middelvinger'];
export const labels = [...targets, 'Geen gebaar'];

export function targetFor(rounds) {
  return targets[rounds % targets.length];
}

export function judge(frames, expected) {
  return Math.min(...frames.map(frame => frame.find(result =>
    result.className.trim().toLowerCase() === expected.toLowerCase())?.probability ?? 0));
}
