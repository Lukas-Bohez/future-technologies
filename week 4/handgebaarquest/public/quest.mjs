export const THRESHOLD = 0.90;
export const TRAINING_MINIMUM = 30;
export const targets = ['V', 'O', 'L'];
export const labels = [...targets, 'Overig'];
export const hints = {
  V: 'Spreid je gestrekte wijs- en middelvinger.',
  O: 'Maak met je vingers en duim een ronde O.',
  L: 'Wijs omhoog met je wijsvinger en steek je duim opzij.',
  Overig: 'Gebruik een lege achtergrond of een handvorm die geen V, O of L is.',
};

export function targetFor(rounds) {
  return targets[rounds % targets.length];
}

export function judge(frames, expected) {
  if (frames.length !== 3) return 0;
  return Math.min(...frames.map(frame => frame.find(result =>
    result.className.trim().toLowerCase() === expected.toLowerCase())?.probability ?? 0));
}
