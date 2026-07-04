const MIN_WPM = 120;
const MAX_WPM = 700;
const PASS_FACTOR = 1.12;
const FAIL_FACTOR = 0.88;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearestTen(value: number) {
  return Math.round(value / 10) * 10;
}

export function nextWpm(currentWpm: number, passed: boolean) {
  const factor = passed ? PASS_FACTOR : FAIL_FACTOR;
  return clamp(roundToNearestTen(currentWpm * factor), MIN_WPM, MAX_WPM);
}

export { MIN_WPM, MAX_WPM };
