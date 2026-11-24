import type { ThemeModel, ThemeScorePart, ThemeStage } from './types';

/**
 * 主线强度 / 拥挤度 v1
 *
 * 强度回答「这条线现在有多强」，由四个分项加权：
 *   相对涨幅 30% · 资金强度 25% · 涨停扩散 20% · 趋势持续性 25%
 * 拥挤度回答「这条线有多挤」，由三个参与度分项加权：
 *   成交占比 40% · 换手率 30% · 热度水位 30%
 *
 * 所有分项先映射到 0-100 再按权重合成，映射锚点写在下方常量里，
 * 换一批数据仍然可复算，不依赖人工填分。
 */

export const THEME_MODEL_VERSION = 'v1.0';

export const STRENGTH_WEIGHTS = {
  relChange: 0.3,
  flow: 0.25,
  limitUp: 0.2,
  trend: 0.25,
} as const;

export const CROWDING_WEIGHTS = {
  heat: 0.4,
  turnoverRate: 0.3,
  level: 0.3,
} as const;

/**
 * 分项锚点：value=0 → 50 分，value=±anchor → 0/100 分。
 * 相对涨幅 ±4 个百分点、资金强度 ±15%、5 日动量 ±15 点，都是一天内较极端的读数。
 */
export const SCORE_ANCHORS = {
  relChange: 4,
  flow: 15,
  momentum5: 15,
  heat: 5,
  turnoverRate: 6,
} as const;

/** 涨停家数达到该值即满分 */
export const LIMIT_UP_FULL_SCORE = 6;

export interface ThemeModelInput {
  changePct: number;
  inflow: number;
  turnover: number;
  floatCap: number;
  limitUp: number;
  /** 20 日主题强度指数，0-100 */
  spark: number[];
  /** 全市场成交额，亿元 */
  marketTurnover: number;
  /** 基准指数涨幅（沪深300），% */
  marketChangePct: number;
}

export interface ThemeModelResult {
  strength: number;
  crowding: number;
  stage: ThemeStage;
  model: ThemeModel;
}

function round(n: number, digits = 1): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 0 对应 50 分，正负 anchor 对应 100 / 0 分 */
function anchored(value: number, anchor: number): number {
  if (!Number.isFinite(value) || anchor <= 0) return 50;
  return round(clamp(50 + (value / anchor) * 50, 0, 100), 1);
}

/** 0 起步、cap 对应满分的线性映射 */
function capped(value: number, cap: number): number {
  if (!Number.isFinite(value) || cap <= 0) return 0;
  return round(clamp((value / cap) * 100, 0, 100), 1);
}

function signedPoints(points: number): string {
  const rounded = Math.round(points);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function buildPart(
  part: Omit<ThemeScorePart, 'contribution' | 'score'> & { rawScore: number },
): ThemeScorePart {
  const score = round(part.rawScore, 1);
  return {
    key: part.key,
    label: part.label,
    value: round(part.value, part.digits),
    unit: part.unit,
    digits: part.digits,
    score,
    weight: part.weight,
    contribution: round(score * part.weight, 2),
    formula: part.formula,
    note: part.note,
  };
}

/** 5 日动量与近 10 日上行占比 */
export function trendStats(spark: number[]): { momentum5: number; persistence: number; ret20: number } {
  if (spark.length < 20) return { momentum5: 0, persistence: 0.5, ret20: 0 };
  const last = spark[spark.length - 1];
  const momentum5 = last - spark[spark.length - 6];
  const window = spark.slice(-11);
  let up = 0;
  for (let i = 1; i < window.length; i++) if (window[i] > window[i - 1]) up += 1;
  return {
    momentum5,
    persistence: up / (window.length - 1),
    ret20: spark[0] === 0 ? 0 : (last / spark[0] - 1) * 100,
  };
}

/**
 * 阶段判定：先看 20 日趋势是否已经破坏，再看强度与 5 日动量，
 * 最后用拥挤度区分「发酵 / 分歧 / 萌芽」。
 */
export function classifyStage(
  strength: number,
  crowding: number,
  momentum5: number,
  ret20: number,
): { stage: ThemeStage; reason: string } {
  if (ret20 < -10) {
    return { stage: '退潮', reason: `20 日 ${round(ret20, 1)}%，趋势仍在出清` };
  }
  if (strength >= 65 && momentum5 >= 5) {
    return { stage: '加速', reason: `强度 ${strength}，5 日强度指数 ${signedPoints(momentum5)} 点` };
  }
  if (strength >= 50 && momentum5 < 3 && crowding >= 45) {
    return {
      stage: '分歧',
      reason: `强度 ${strength} 但 5 日仅 ${signedPoints(momentum5)} 点，动量走平而拥挤度仍有 ${crowding}`,
    };
  }
  if (strength < 50 && crowding < 40 && momentum5 > 0) {
    return { stage: '萌芽', reason: `强度 ${strength}、拥挤 ${crowding} 均处低位，5 日 ${signedPoints(momentum5)} 点` };
  }
  if (strength >= 50) {
    return { stage: '发酵', reason: `强度 ${strength}、拥挤 ${crowding}，5 日 ${signedPoints(momentum5)} 点，尚未过热` };
  }
  return { stage: '分歧', reason: `强度 ${strength} 低于中位，动量 ${signedPoints(momentum5)} 点，方向待确认` };
}

export function buildThemeModel(input: ThemeModelInput): ThemeModelResult {
  const { momentum5, persistence, ret20 } = trendStats(input.spark);
  const last = input.spark.length > 0 ? input.spark[input.spark.length - 1] : 50;

  const relChange = input.changePct - input.marketChangePct;
  const flowIntensity = input.turnover > 0 ? (input.inflow / input.turnover) * 100 : 0;
  const heat = input.marketTurnover > 0 ? (input.turnover / input.marketTurnover) * 100 : 0;
  const turnoverRate = input.floatCap > 0 ? (input.turnover / input.floatCap) * 100 : 0;

  const trendScore = round(anchored(momentum5, SCORE_ANCHORS.momentum5) * 0.6 + persistence * 100 * 0.4, 1);

  const strengthParts: ThemeScorePart[] = [
    buildPart({
      key: 'relChange',
      label: '相对涨幅',
      value: relChange,
      unit: '%',
      digits: 2,
      weight: STRENGTH_WEIGHTS.relChange,
      rawScore: anchored(relChange, SCORE_ANCHORS.relChange),
      formula: '主题均涨幅 − 沪深300 涨幅',
    }),
    buildPart({
      key: 'flow',
      label: '资金强度',
      value: flowIntensity,
      unit: '%',
      digits: 2,
      weight: STRENGTH_WEIGHTS.flow,
      rawScore: anchored(flowIntensity, SCORE_ANCHORS.flow),
      formula: '主力净流入 / 主题成交额',
    }),
    buildPart({
      key: 'limitUp',
      label: '涨停扩散',
      value: input.limitUp,
      unit: '家',
      digits: 0,
      weight: STRENGTH_WEIGHTS.limitUp,
      rawScore: capped(input.limitUp, LIMIT_UP_FULL_SCORE),
      formula: `主题内涨停家数（${LIMIT_UP_FULL_SCORE} 家封顶）`,
    }),
    buildPart({
      key: 'trend',
      label: '趋势持续',
      value: momentum5,
      unit: '点',
      digits: 1,
      weight: STRENGTH_WEIGHTS.trend,
      rawScore: trendScore,
      formula: '5 日强度指数变化 60% + 近 10 日上行占比 40%',
      note: `5 日 ${signedPoints(momentum5)} 点 · 上行 ${Math.round(persistence * 10)}/10`,
    }),
  ];

  const crowdingParts: ThemeScorePart[] = [
    buildPart({
      key: 'heat',
      label: '成交占比',
      value: heat,
      unit: '%',
      digits: 2,
      weight: CROWDING_WEIGHTS.heat,
      rawScore: capped(heat, SCORE_ANCHORS.heat),
      formula: '主题成交额 / 全市场成交额',
    }),
    buildPart({
      key: 'turnoverRate',
      label: '换手率',
      value: turnoverRate,
      unit: '%',
      digits: 2,
      weight: CROWDING_WEIGHTS.turnoverRate,
      rawScore: capped(turnoverRate, SCORE_ANCHORS.turnoverRate),
      formula: '主题成交额 / 自由流通市值',
    }),
    buildPart({
      key: 'level',
      label: '热度水位',
      value: last,
      unit: '',
      digits: 0,
      weight: CROWDING_WEIGHTS.level,
      rawScore: clamp(last, 0, 100),
      formula: '20 日强度指数当前值',
    }),
  ];

  const strengthScore = round(
    strengthParts.reduce((a, p) => a + p.score * p.weight, 0),
    1,
  );
  const crowdingScore = round(
    crowdingParts.reduce((a, p) => a + p.score * p.weight, 0),
    1,
  );
  const strength = Math.round(strengthScore);
  const crowding = Math.round(crowdingScore);
  const { stage, reason } = classifyStage(strength, crowding, momentum5, ret20);

  return {
    strength,
    crowding,
    stage,
    model: {
      version: THEME_MODEL_VERSION,
      strengthScore,
      crowdingScore,
      strengthParts,
      crowdingParts,
      stage,
      stageReason: reason,
    },
  };
}
