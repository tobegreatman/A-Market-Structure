import { cx, fmt, pct, signed, toneOf } from '../lib/format';

interface DeltaProps {
  value: number;
  digits?: number;
  suffix?: string;
  arrow?: boolean;
  className?: string;
  showSign?: boolean;
}

export function Delta({ value, digits = 2, suffix = '%', arrow = true, className, showSign = true }: DeltaProps) {
  const tone = toneOf(value);
  return (
    <span className={cx('delta', tone, className)}>
      {arrow && <span className="arrow">{tone === 'down' ? '▼' : tone === 'up' ? '▲' : '—'}</span>}
      <span>{showSign ? signed(value, digits) : fmt(value, digits)}{suffix}</span>
    </span>
  );
}

export function ChangeText({ value, digits = 2, className }: { value: number; digits?: number; className?: string }) {
  return <span className={cx('delta', toneOf(value), className)}>{signed(value, digits)}</span>;
}

export function Percent({ value, digits = 2 }: { value: number; digits?: number }) {
  return <span className={cx('delta', toneOf(value))}>{pct(value, digits)}</span>;
}
