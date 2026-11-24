export function movingAverage(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function weightedAverage(pairs: Array<{ price: number; weight: number }>): number {
  const total = pairs.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return 0;
  return pairs.reduce((sum, item) => sum + item.price * item.weight, 0) / total;
}
