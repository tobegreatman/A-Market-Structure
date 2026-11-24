import type { SentimentFactor, SentimentReading } from './types';

/**
 * 情绪温度 v1：6 分项 · 252 日分位加权
 *
 * 设计原则：
 * 1. 每个分项先算「今日读数在历史中的分位」，再按权重合成。分位天然归一，
 *    不同量纲（家数、百分比、板数、倍数）可以直接相加。
 * 2. 分位基准只取今日之前 252 个交易日，不含当日，避免前视偏差。
 * 3. 六个分项由同一个「市场状态」驱动生成，保留相关性；否则会出现
 *    「广度 90 分位、封板率 20 分位」这类互相打架的组合。
 * 4. 温度 = Σ(分位 × 权重)，中性自然落在 50，不需要手工校准基线。
 */

export const SENTIMENT_VERSION = 'v1.0';
export const SENTIMENT_WINDOW = 252;

export type SentimentFactorKey = 'breadth' | 'limitUp' | 'seal' | 'boardHeight' | 'premium' | 'volume';

export interface SentimentFactorDef {
  key: SentimentFactorKey;
  label: string;
  unit: string;
  digits: number;
  /** 权重，合计为 1 */
  weight: number;
  /** 分项口径，直接展示给用户 */
  formula: string;
}

export const SENTIMENT_FACTORS: SentimentFactorDef[] = [
  { key: 'breadth', label: '上涨广度', unit: '%', digits: 1, weight: 0.22, formula: '上涨家数 / 全市场' },
  { key: 'limitUp', label: '涨停占比', unit: '%', digits: 2, weight: 0.18, formula: '涨停家数 / 全市场' },
  { key: 'seal', label: '封板率', unit: '%', digits: 1, weight: 0.2, formula: '涨停 / (涨停 + 炸板)' },
  { key: 'boardHeight', label: '连板高度', unit: '板', digits: 0, weight: 0.15, formula: '最高连板数' },
  { key: 'premium', label: '昨涨停溢价', unit: '%', digits: 2, weight: 0.15, formula: '昨日涨停股今日均涨幅' },
  { key: 'volume', label: '量能比', unit: '倍', digits: 2, weight: 0.1, formula: '成交额 / 前 5 日均额' },
];

export function sentimentWeightSum(): number {
  return SENTIMENT_FACTORS.reduce((a, f) => a + f.weight, 0);
}

export interface SentimentInput {
  up: number;
  down: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  broken: number;
  /** 最高连板数 */
  maxBoard: number;
  /** 昨日涨停股今日平均涨幅，% */
  premium: number;
  turnover: number;
  /** 前 5 个交易日日均成交额，亿元 */
  turnoverMa5: number;
}

export type SentimentDay = Record<SentimentFactorKey, number>;

/* ------------------------------- 基础工具 ------------------------------- */

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller：标准正态 */
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-9);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 分位（midrank）：严格小于记 1，等于记 0.5。
 * 取值 0-100，离散分项（连板高度）不会因为并列被推到极端。
 */
export function percentileRank(history: number[], value: number): number {
  if (history.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of history) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return round(((below + equal * 0.5) / history.length) * 100, 1);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ------------------------------- 历史样本 ------------------------------- */

const HISTORY_SEED = 20240819;

/**
 * 生成 252 个交易日的分项样本。
 * regime 是缓慢变化的共同状态，六个分项各自叠加噪声；这样既保留相关性，
 * 又能让分位分布有厚尾，而不是六条互不相干的随机数。
 */
export function buildSentimentHistory(days = SENTIMENT_WINDOW): SentimentDay[] {
  const r = mulberry32(HISTORY_SEED);
  const out: SentimentDay[] = [];
  for (let i = 0; i < days; i++) {
    const regime = Math.sin((i / days) * Math.PI * 2 * 1.7) * 0.5 + gauss(r) * 0.62;
    const breadth = clamp(52 + regime * 11.5 + gauss(r) * 7.2, 10, 94);
    const limitUp = clamp(0.95 * Math.exp(regime * 0.5 + gauss(r) * 0.3), 0.06, 4.6);
    const seal = clamp(70 + regime * 6.5 + gauss(r) * 7, 30, 97);
    const boardHeight = clamp(Math.round(3.7 + regime * 1.15 + gauss(r) * 0.9), 1, 8);
    const premium = clamp(1.15 + regime * 2.5 + gauss(r) * 1.7, -7.5, 9.5);
    const volume = clamp(1 + regime * 0.15 + gauss(r) * 0.11, 0.55, 2.2);
    out.push({
      breadth: round(breadth, 2),
      limitUp: round(limitUp, 3),
      seal: round(seal, 2),
      boardHeight,
      premium: round(premium, 2),
      volume: round(volume, 3),
    });
  }
  return out;
}

export const SENTIMENT_HISTORY: SentimentDay[] = buildSentimentHistory();

/* ------------------------------- 今日读数 ------------------------------- */

export function sentimentRaw(input: SentimentInput): SentimentDay {
  const total = input.up + input.down + input.flat;
  const attempts = input.limitUp + input.broken;
  return {
    breadth: total > 0 ? (input.up / total) * 100 : 50,
    limitUp: total > 0 ? (input.limitUp / total) * 100 : 0,
    seal: attempts > 0 ? (input.limitUp / attempts) * 100 : 50,
    boardHeight: input.maxBoard,
    premium: input.premium,
    volume: input.turnoverMa5 > 0 ? input.turnover / input.turnoverMa5 : 1,
  };
}

export function emotionLabel(temperature: number): string {
  if (temperature < 20) return '冰点';
  if (temperature < 40) return '偏弱';
  if (temperature < 60) return '中性';
  if (temperature < 80) return '偏强';
  return '过热';
}

/**
 * 合成情绪温度。
 * @param history 分位基准，默认内置 252 日样本（不含今日）
 */
export function buildSentiment(input: SentimentInput, history: SentimentDay[] = SENTIMENT_HISTORY): SentimentReading {
  const raw = sentimentRaw(input);
  const factors: SentimentFactor[] = SENTIMENT_FACTORS.map((def) => {
    const series = history.map((d) => d[def.key]);
    const sorted = [...series].sort((a, b) => a - b);
    const percentile = percentileRank(series, raw[def.key]);
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      digits: def.digits,
      weight: def.weight,
      value: round(raw[def.key], def.digits),
      percentile,
      contribution: round(percentile * def.weight, 2),
      historyMedian: round(quantile(sorted, 0.5), def.digits),
      historyP25: round(quantile(sorted, 0.25), def.digits),
      historyP75: round(quantile(sorted, 0.75), def.digits),
      formula: def.formula,
    };
  });
  const weightSum = sentimentWeightSum();
  const score = round(
    factors.reduce((a, f) => a + f.percentile * f.weight, 0) / weightSum,
    1,
  );
  const temperature = Math.round(score);
  return {
    version: SENTIMENT_VERSION,
    window: history.length,
    score,
    temperature,
    emotion: emotionLabel(temperature),
    factors,
    basis: `分位基准为过去 ${history.length} 个交易日（不含今日），分位越高表示当前读数在历史上越靠热端。`,
    caveat:
      '权重为经验设定（22/18/20/15/15/10），尚未做 IC 与分层回测；当前仅作观察指标，单日跳变需结合连板梯队与量能确认。',
  };
}
