export const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(' ');

export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  const [int, dec] = fixed.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const body = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${body}${dec ? `.${dec}` : ''}`;
}

export function signed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const threshold = 0.5 * 10 ** -digits;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  return `${normalized > 0 ? '+' : ''}${fmt(normalized, digits)}`;
}

export function pct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const threshold = 0.5 * 10 ** -digits;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}%`;
}

export function toneOf(value: number): 'up' | 'down' | 'flat' {
  if (value > 0.000001) return 'up';
  if (value < -0.000001) return 'down';
  return 'flat';
}

export function yuan(value: number, digits = 2): string {
  return fmt(value, digits);
}

export function yi(value: number, digits = 1): string {
  return `${signed(value, digits)} 亿`;
}

export function compactMoney(value: number): string {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)} 万亿`;
  return `${fmt(value, 1)} 亿`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')} ${get('weekday')} · ${get('hour')}:${get('minute')}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short' })
    .format(d)
    .replace(/\//g, '.');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentOf(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function stageTone(stage: string): 'up' | 'down' | 'brass' | 'steel' | 'flat' {
  if (stage === '加速' || stage === '发酵') return 'up';
  if (stage === '分歧') return 'brass';
  if (stage === '退潮') return 'down';
  if (stage === '萌芽') return 'steel';
  return 'flat';
}
