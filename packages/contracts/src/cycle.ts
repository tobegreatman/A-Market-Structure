import type { CycleAxisPart, CycleIndicator, CycleModel } from './types';

/**
 * 周期坐标 v1：增长 × 通胀
 *
 * 增长轴 y = PMI 65% + 社融存量同比 35%
 * 通胀轴 x = CPI 60% + PPI 40%
 *
 * 每个分项先用绝对锚点映射到 -1 ~ 1（0 = 中性），再按权重合成 x/y。
 * 锚点是宏观意义上的中性区间，不是历史分位：
 *   PMI 48/50/52、社融 7/9/11%、CPI 0/1.5/3%、PPI -3/0/3%。
 * 这样 x/y 表示「现在在周期里的位置」，而不是「在過去 48 个月里的排名」。
 */

export const CYCLE_MODEL_VERSION = 'v1.0';

export const GROWTH_WEIGHTS = { pmi: 0.65, afre: 0.35 } as const;
export const INFLATION_WEIGHTS = { cpi: 0.6, ppi: 0.4 } as const;

export const AXIS_ANCHORS = {
  pmi: { center: 50, half: 2 },
  afre: { center: 9, half: 2 },
  cpi: { center: 1.5, half: 1.5 },
  ppi: { center: 0, half: 3 },
} as const;

export type CycleAxisKey = keyof typeof AXIS_ANCHORS;

export interface CycleModelResult {
  x: number;
  y: number;
  phase: string;
  note: string;
  next: string;
  model: CycleModel;
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 绝对锚点 → -1 ~ 1；0 表示中性 */
export function axisScore(value: number, center: number, half: number): number {
  if (!Number.isFinite(value) || half <= 0) return 0;
  return round(clamp((value - center) / half, -1, 1), 2);
}

export function cyclePhase(x: number, y: number): string {
  if (x >= 0) return y >= 0 ? '过热' : '滞胀';
  return y >= 0 ? '复苏' : '衰退';
}

const PHASE_NOTE: Record<string, string> = {
  复苏: '估值与盈利同时具备向上弹性，行情能否延续取决于信用扩张。',
  过热: '盈利强但估值承压，关注政策收紧与商品端的拥挤。',
  滞胀: '盈利与估值双杀，现金、黄金与防御资产占优。',
  衰退: '政策转向宽松，久期与高股息先行，等待盈利见底。',
};

const NEXT_PHASE: Record<string, string> = {
  复苏: '过热',
  过热: '滞胀',
  滞胀: '衰退',
  衰退: '复苏',
};

const NEXT_TRIGGER: Record<string, string> = {
  复苏: 'CPI 回到 1.5% 以上且 PPI 转正',
  过热: '增长坐标回落到 0 以下',
  滞胀: '通胀坐标回落到 0 以下',
  衰退: '增长坐标回到 0 以上',
};

function signedAxis(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
}

function buildPart(
  key: CycleAxisKey,
  indicator: Pick<CycleIndicator, 'name' | 'unit' | 'latest'>,
  weight: number,
): CycleAxisPart {
  const anchor = AXIS_ANCHORS[key];
  const score = axisScore(indicator.latest, anchor.center, anchor.half);
  return {
    key,
    label: indicator.name,
    value: indicator.latest,
    unit: indicator.unit,
    digits: 1,
    score,
    weight,
    contribution: round(score * weight, 2),
    formula: `${indicator.name} ${anchor.center - anchor.half}/${anchor.center}/${anchor.center + anchor.half} → -1/0/+1`,
  };
}

/**
 * @param indicators 至少包含 pmi / afre / cpi / ppi 四个指标
 */
export function buildCycleModel(
  indicators: Pick<CycleIndicator, 'key' | 'name' | 'unit' | 'latest'>[],
): CycleModelResult {
  const byKey = new Map(indicators.map((i) => [i.key, i]));
  const fallback = (key: string) => ({ key, name: key, unit: '', latest: 0 });
  const pmi = byKey.get('pmi') ?? fallback('pmi');
  const afre = byKey.get('afre') ?? fallback('afre');
  const cpi = byKey.get('cpi') ?? fallback('cpi');
  const ppi = byKey.get('ppi') ?? fallback('ppi');

  const growthParts = [
    buildPart('pmi', pmi, GROWTH_WEIGHTS.pmi),
    buildPart('afre', afre, GROWTH_WEIGHTS.afre),
  ];
  const inflationParts = [
    buildPart('cpi', cpi, INFLATION_WEIGHTS.cpi),
    buildPart('ppi', ppi, INFLATION_WEIGHTS.ppi),
  ];

  const y = round(growthParts.reduce((a, p) => a + p.contribution, 0), 2);
  const x = round(inflationParts.reduce((a, p) => a + p.contribution, 0), 2);
  const phase = cyclePhase(x, y);
  const margin = round(Math.min(Math.abs(x), Math.abs(y)), 2);

  const note = `增长 ${signedAxis(y)}、通胀 ${signedAxis(x)}：${PHASE_NOTE[phase]}`;
  const next = `若 ${NEXT_TRIGGER[phase]}，将进入「${NEXT_PHASE[phase]}」。`;
  const phaseReason = `增长 ${signedAxis(y)}（PMI ${pmi.latest.toFixed(1)}、社融 ${afre.latest.toFixed(
    1,
  )}%），通胀 ${signedAxis(x)}（CPI ${cpi.latest.toFixed(1)}%、PPI ${ppi.latest.toFixed(
    1,
  )}%），落在「${phase}」象限；距最近边界 ${margin.toFixed(2)}。`;

  return {
    x,
    y,
    phase,
    note,
    next,
    model: {
      version: CYCLE_MODEL_VERSION,
      growth: y,
      inflation: x,
      growthParts,
      inflationParts,
      margin,
      phaseReason,
    },
  };
}
