import { cx } from '../lib/format';

type MeterTone = 'up' | 'down' | 'brass' | 'steel' | 'flat';

const COLORS: Record<MeterTone, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  brass: 'var(--brass)',
  steel: 'var(--steel)',
  flat: 'var(--text-3)',
};

export function Meter({
  value,
  max = 100,
  tone = 'brass',
  height = 3,
  className,
}: {
  value: number;
  max?: number;
  tone?: MeterTone;
  height?: number;
  className?: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <span className={cx('meter', className)} style={{ height }}>
      <span className="meter-fill" style={{ width: `${ratio * 100}%`, background: COLORS[tone] }} />
    </span>
  );
}

export function ScoreCell({ value, tone = 'brass', label }: { value: number; tone?: MeterTone; label?: string }) {
  return (
    <span className="score-cell">
      <Meter value={value} tone={tone} height={3} className="score-meter" />
      <span className="num score-num">{label ?? value}</span>
    </span>
  );
}
