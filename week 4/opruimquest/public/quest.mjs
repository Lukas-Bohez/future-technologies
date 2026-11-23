export const THRESHOLD = 0.90;
export const MAX_FRAME_SPREAD = 0.08;

export function judgeScan(frames, expected) {
  const scores = frames.map(frame => {
    const prediction = frame.find(item => item.className.trim().toLowerCase() === expected);
    return prediction?.probability ?? 0;
  });
  const lowest = Math.min(...scores);
  const highest = Math.max(...scores);
  return {
    accepted: scores.length === 3 && lowest >= THRESHOLD && highest - lowest <= MAX_FRAME_SPREAD,
    score: scores.reduce((total, score) => total + score, 0) / scores.length,
  };
}
