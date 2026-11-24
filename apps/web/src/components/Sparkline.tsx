import { useId } from 'react';
import { areaPath, smoothPath } from '../lib/geometry';
import { cx } from '../lib/format';

export type SparkTone = 'up' | 'down' | 'brass' | 'steel' | 'flat' | 'auto';

const TONE_COLOR: Record<Exclude<SparkTone, 'auto'>, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  brass: 'var(--brass)',
  steel: 'var(--steel)',
  flat: 'var(--text-3)',
};

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: SparkTone;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  tone = 'auto',
  fill = true,
  strokeWidth = 1.25,
  className,
}: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2.5;
  const points = data.map((value, index) => ({
    x: pad + (index / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
  const resolved: Exclude<SparkTone, 'auto'> = tone === 'auto' ? (data[data.length - 1] >= data[0] ? 'up' : 'down') : tone;
  const color = TONE_COLOR[resolved];
  const id = `spark-${uid}-${resolved}`;

  return (
    <svg
      className={cx('sparkline', className)}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath(points, height - 1)} fill={`url(#${id})`} />}
      <path
        d={smoothPath(points, 0.16)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}
