import type {
  Candle,
  CapitalSplit,
  ChipLevel,
  CycleIndicator,
  CyclePayload,
  DistributionBucket,
  FinanceRow,
  FlowPayload,
  FlowPeriod,
  FlowPeriodKey,
  FlowSankeyLink,
  FlowSankeyNode,
  IndustryFlowRow,
  IndexQuote,
  IntradayPoint,
  KnowledgeTopic,
  LadderGroup,
  MainlinePayload,
  MarketBreadth,
  MarketOverview,
  MarketTheme,
  MockDataset,
  SearchItem,
  SectorSnapshot,
  StockPayload,
  StockProfile,
  StockSummary,
  UniverseNode,
  UniverseEdge,
  UniversePayload,
} from './types';
import { buildSentiment } from './sentiment';
import { buildThemeModel } from './mainline';
import { buildCycleModel } from './cycle';

/* ------------------------------- 基础工具 ------------------------------- */

const AS_OF = '2026-11-24T15:00:00+08:00';
const END_DATE = new Date('2026-11-24T00:00:00Z');

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tradingDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date(END_DATE);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(fmtDate(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function monthDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2026, 9, 1));
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

function percentileOf(series: number[], value: number): number {
  const history = series.slice(0, -1);
  const pool = history.length ? history : series;
  const below = pool.filter((v) => v <= value).length;
  return Math.round((below / pool.length) * 100);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 把 total 按 weights 分成一组整数，且和恰为 total */
function allocate(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const base = raw.map(Math.floor);
  const remainder = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) base[order[k % order.length].i] += 1;
  return base;
}

/** 一条首尾固定的桥接序列，用于指数迷你走势：起点=昨收，终点=现价 */
function bridgeSeries(seed: number, n: number, start: number, end: number, vol: number): number[] {
  const r = rng(seed);
  const noise = [0];
  for (let i = 1; i < n; i++) noise.push(noise[i - 1] + (r() - 0.5) * vol);
  const last = noise[n - 1];
  return Array.from({ length: n }, (_, i) =>
    round(start + ((end - start) * i) / (n - 1) + noise[i] - (last * i) / (n - 1), 2),
  );
}

/* -------------------------------- 盘面 -------------------------------- */

interface IndexSeed {
  code: string;
  name: string;
  value: number;
  pct: number;
  amount: number;
}

const INDEX_SEEDS: IndexSeed[] = [
  { code: '000001', name: '上证指数', value: 3842.77, pct: 0.62, amount: 7821.4 },
  { code: '399001', name: '深证成指', value: 12864.31, pct: 0.94, amount: 10312.6 },
  { code: '399006', name: '创业板指', value: 2913.56, pct: 1.38, amount: 4826.2 },
  { code: '000688', name: '科创50', value: 1187.42, pct: 1.91, amount: 968.4 },
  { code: '000300', name: '沪深300', value: 4521.88, pct: 0.71, amount: 5126.3 },
];

function buildIndices(): IndexQuote[] {
  return INDEX_SEEDS.map((s, idx) => {
    const prevClose = round(s.value / (1 + s.pct / 100), 2);
    const spark = bridgeSeries(31 + idx, 48, prevClose, s.value, s.value * 0.0016);
    return {
      code: s.code,
      name: s.name,
      value: s.value,
      change: round(s.value - prevClose, 2),
      changePct: s.pct,
      prevClose,
      amount: s.amount,
      spark,
    };
  });
}

type SectorSeed = [
  name: string,
  pct: number,
  inflow: number,
  turnover: number,
  marketCap: number,
  leader: string,
  leaderPct: number,
];

const SECTOR_SEEDS: SectorSeed[] = [
  ['电子', 2.84, 86.4, 2143, 62000, '中际旭创', 9.98],
  ['通信', 2.41, 64.2, 842, 28000, '新易盛', 7.42],
  ['电力设备', 1.76, 38.1, 1320, 48000, '宁德时代', 3.86],
  ['计算机', 1.52, 27.6, 1186, 32000, '金山办公', 5.12],
  ['有色金属', 1.18, 12.8, 612, 26000, '紫金矿业', 2.94],
  ['医药生物', 0.86, 9.4, 728, 56000, '恒瑞医药', 3.24],
  ['汽车', 0.72, 6.2, 546, 30000, '比亚迪', 1.86],
  ['机械设备', 0.54, 4.8, 689, 24000, '汇川技术', 2.12],
  ['国防军工', 0.48, 3.6, 316, 14000, '中航沈飞', 1.94],
  ['传媒', 0.31, 2.1, 289, 12000, '分众传媒', 1.42],
  ['非银金融', 0.22, 1.8, 486, 58000, '东方财富', 1.68],
  ['银行', 0.08, 0.9, 512, 128000, '招商银行', 0.42],
  ['综合', -0.15, -0.6, 34, 2500, '综艺股份', 0.21],
  ['基础化工', -0.18, -9.6, 358, 22000, '万华化学', -0.32],
  ['公用事业', -0.26, -5.4, 198, 26000, '长江电力', -0.18],
  ['交通运输', -0.09, -4.8, 182, 19000, '顺丰控股', -0.22],
  ['环保', -0.29, -2.2, 88, 5000, '瀚蓝环境', -0.31],
  ['石油石化', -0.33, -6.8, 118, 22000, '中国石油', -0.45],
  ['建筑材料', -0.36, -3.9, 76, 7000, '海螺水泥', -0.44],
  ['商贸零售', -0.38, -3.6, 132, 8000, '永辉超市', -0.58],
  ['房地产', -0.41, -12.6, 246, 15000, '保利发展', -0.82],
  ['轻工制造', -0.44, -2.6, 126, 7000, '欧派家居', -0.52],
  ['钢铁', -0.55, -11.8, 142, 10000, '宝钢股份', -0.78],
  ['社会服务', -0.58, -4.6, 84, 5000, '中国中免', -0.86],
  ['煤炭', -0.62, -14.2, 168, 13000, '中国神华', -0.94],
  ['纺织服饰', -0.63, -2.8, 96, 6000, '华利集团', -0.74],
  ['农林牧渔', -0.51, -4.2, 168, 11000, '牧原股份', -0.68],
  ['美容护理', -0.72, -3.1, 62, 4000, '爱美客', -0.92],
  ['食品饮料', -0.12, -8.4, 392, 42000, '贵州茅台', -0.28],
  ['家用电器', -0.24, -6.2, 236, 16000, '美的集团', -0.36],
  ['建筑装饰', -0.47, -8.2, 154, 13000, '中国建筑', -0.66],
];

function buildSectors(): SectorSnapshot[] {
  return SECTOR_SEEDS.map(([name, pct, inflow, turnover, marketCap, leader, leaderPct]) => ({
    name,
    changePct: pct,
    netInflow: inflow,
    turnover,
    marketCap,
    leader,
    leaderPct,
  })).sort((a, b) => b.changePct - a.changePct);
}

function buildDistribution(
  breadth: Pick<MarketBreadth, 'up' | 'down' | 'flat' | 'limitUp' | 'limitDown'>,
): DistributionBucket[] {
  const labels = [
    '跌停',
    '≤-7%',
    '-7~-5',
    '-5~-3',
    '-3~-1',
    '-1~0',
    '平盘',
    '0~1',
    '1~3',
    '3~5',
    '5~7',
    '≥7%',
    '涨停',
  ];
  const downRest = Math.max(0, breadth.down - breadth.limitDown);
  const upRest = Math.max(0, breadth.up - breadth.limitUp);
  const downBuckets = allocate(downRest, [1.4, 2.2, 4.8, 12.5, 22.4]);
  const upBuckets = allocate(upRest, [24.6, 15.2, 6.4, 3.6, 1.9]);
  const counts = [breadth.limitDown, ...downBuckets, breadth.flat, ...upBuckets, breadth.limitUp];
  return labels.map((label, i) => ({ label, count: counts[i] }));
}

function buildIntraday(prevClose: number, target: number, seed: number): IntradayPoint[] {
  const r = rng(seed);
  const minutes: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const m = 9 * 60 + 30 + i;
    minutes.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  for (let i = 0; i < 120; i++) {
    const m = 13 * 60 + i;
    minutes.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  const n = minutes.length;
  const bridge: number[] = [0];
  for (let i = 1; i < n; i++) bridge.push(bridge[i - 1] + (r() - 0.5) * prevClose * 0.0009);
  const vols = minutes.map((_, i) => {
    const open = Math.exp(-i / 26);
    const close = Math.exp(-(n - i) / 30);
    return 0.7 + open * 1.9 + close * 1.6 + r() * 0.55;
  });
  const totalVol = vols.reduce((a, b) => a + b, 0);
  let vwapSum = 0;
  let volSum = 0;
  return minutes.map((t, i) => {
    const price =
      prevClose + ((target - prevClose) * i) / (n - 1) + bridge[i] - bridge[n - 1] * (i / (n - 1));
    const volume = (vols[i] / totalVol) * 100;
    vwapSum += price * volume;
    volSum += volume;
    return {
      t,
      price: round(price, 2),
      avg: round(vwapSum / volSum, 2),
      volume: round(volume, 2),
    };
  });
}

/** 前 5 个交易日成交额（亿元），末位等于昨收日成交额 */
const TURNOVER_HISTORY = [16420.5, 16880.2, 17412.6, 16204.8, 17238.4];

/** 昨日涨停股今日平均涨幅（%）。真实环境由个股级行情计算，演示快照为固定输入 */
const PREMIUM_TODAY = 2.63;

const LADDER_GROUPS: LadderGroup[] = [
  { level: '5板', stocks: ['华胜天成', '太辰光'] },
  { level: '3板', stocks: ['剑桥科技', '科华数据', '润建股份'] },
  { level: '2板', stocks: ['中贝通信', '恒润股份', '光智科技', '拓维信息', '常山北明'] },
  {
    level: '首板',
    stocks: ['东山精密', '沪电股份', '胜宏科技', '工业富联', '沃尔核材', '英维克', '申菱环境', '高澜股份'],
  },
];

function buildOverview(): MarketOverview {
  const indices = buildIndices();
  const sectors = buildSectors();
  const counts = {
    up: 3241,
    down: 1826,
    flat: 158,
    limitUp: 68,
    limitDown: 9,
    broken: 21,
    turnover: 18642.8,
    prevTurnover: TURNOVER_HISTORY[TURNOVER_HISTORY.length - 1],
    marginBalance: 19246.5,
    northboundTurnover: 1842.6,
  };
  const totalStocks = counts.up + counts.down + counts.flat;
  const upRatio = totalStocks ? (counts.up / totalStocks) * 100 : 0;
  const sealRate = counts.limitUp + counts.broken ? (counts.limitUp / (counts.limitUp + counts.broken)) * 100 : 0;
  const maxBoard = Math.max(...LADDER_GROUPS.map((g) => Number.parseInt(g.level, 10) || 1));
  const turnoverMa5 = round(TURNOVER_HISTORY.reduce((a, b) => a + b, 0) / TURNOVER_HISTORY.length, 1);
  const sentiment = buildSentiment({
    up: counts.up,
    down: counts.down,
    flat: counts.flat,
    limitUp: counts.limitUp,
    limitDown: counts.limitDown,
    broken: counts.broken,
    maxBoard,
    premium: PREMIUM_TODAY,
    turnover: counts.turnover,
    turnoverMa5,
  });
  const breadth: MarketBreadth = {
    ...counts,
    turnoverMa5,
    maxBoard,
    premium: PREMIUM_TODAY,
    sentiment,
    temperature: sentiment.temperature,
    emotion: sentiment.emotion,
  };
  const totalPct = round(((breadth.turnover - breadth.prevTurnover) / breadth.prevTurnover) * 100, 1);
  const topTwo = [...sectors].sort((a, b) => b.netInflow - a.netInflow).slice(0, 2);
  const topTwoSum = round(topTwo.reduce((a, s) => a + s.netInflow, 0), 1);
  const positiveSum = round(sectors.filter((s) => s.netInflow > 0).reduce((a, s) => a + s.netInflow, 0), 1);
  const byPercentile = [...sentiment.factors].sort((a, b) => b.percentile - a.percentile);
  const hottest = byPercentile.slice(0, 2);
  const coldest = byPercentile[byPercentile.length - 1];
  return {
    asOf: AS_OF,
    session: 'closed',
    sessionLabel: '已收盘',
    indices,
    breadth,
    distribution: buildDistribution(breadth),
    intraday: {
      index: '上证指数',
      prevClose: indices[0].prevClose,
      points: buildIntraday(indices[0].prevClose, indices[0].value, 77),
    },
    sectors,
    capital: { superLarge: 88.6, large: 53.7, medium: -22.4, small: -17.7 },
    ladders: LADDER_GROUPS,
    insights: [
      `${topTwo.map((s) => s.name).join('与')}合计净流入 ${topTwoSum} 亿元，占全部净流入行业的 ${positiveSum ? round((topTwoSum / positiveSum) * 100, 1) : 0}%，结构高度收敛于算力链。`,
      `涨跌比 ${round(breadth.up / breadth.down, 2)}，上涨家数占 ${round(upRatio, 1)}%，普涨之下仍是结构性行情。`,
      `成交额 ${(breadth.turnover / 10000).toFixed(2)} 万亿，较昨日放量 ${totalPct}%，增量资金优先选择了高景气方向。`,
      `涨停 ${breadth.limitUp} 家、炸板 ${breadth.broken} 家，封板率 ${round(sealRate, 1)}%；情绪温度 ${sentiment.temperature}（${sentiment.emotion}），${hottest
        .map((f) => f.label)
        .join('、')}分位最高，${coldest.percentile >= 50 ? '六个分项均在历史中位以上' : `${coldest.label}仅 ${coldest.percentile} 分位`}。`,
    ],
    source: { provider: '演示数据 · 结构引擎', mode: 'demo', asOf: AS_OF, note: '内置确定性行情快照，用于界面与交互验证' },
  };
}

/* -------------------------------- 资金流 -------------------------------- */

const FLOW_INDUSTRIES = ['电子', '通信', '电力设备', '计算机', '有色金属', '医药生物', '汽车', '机械设备'];

function sumTail(values: number[], days: number): number {
  return values.slice(-days).reduce((a, b) => a + b, 0);
}

/**
 * 生成 20 个交易日的行业资金日序列；1d / 5d / 10d / 20d 都是同一序列的滚动累加，
 * 不再用「1 日 × 系数」伪造多周期。
 */
function buildDailyFlowSeries(
  sectors: SectorSnapshot[],
  capital: CapitalSplit,
): { main: number[]; superNet: number[]; change: number[] }[] {
  const horizon = 20;
  const targetMain = round(capital.superLarge + capital.large, 2);
  const rawSum = round(sectors.reduce((a, s) => a + s.netInflow, 0), 2);
  const mainScale = rawSum === 0 ? 1 : targetMain / rawSum;

  const series = sectors.map((s, idx) => {
    const r = rng(900 + idx);
    const base = s.netInflow * mainScale;
    const main: number[] = [];
    const change: number[] = [];
    for (let d = 0; d < horizon - 1; d++) {
      main.push(base * (0.55 + r() * 1.1));
      change.push(s.changePct * (0.4 + r() * 1.2));
    }
    main.push(base);
    change.push(s.changePct);
    return { main, change };
  });

  const shares = sectors.map((_, idx) => {
    const r = rng(1300 + idx);
    return 0.56 + r() * 0.16;
  });
  const todaySuperRaw = sectors.reduce((a, s, i) => a + s.netInflow * mainScale * shares[i], 0);
  const superScale = todaySuperRaw === 0 ? 1 : capital.superLarge / todaySuperRaw;

  return series.map((s, i) => ({
    main: s.main,
    superNet: s.main.map((v) => v * shares[i] * superScale),
    change: s.change,
  }));
}

function buildFlowPeriods(sectors: SectorSnapshot[], capital: CapitalSplit): FlowPeriod[] {
  const daily = buildDailyFlowSeries(sectors, capital);
  const specs: { key: FlowPeriodKey; label: string; days: number; seed: number }[] = [
    { key: '1d', label: '今日', days: 1, seed: 101 },
    { key: '5d', label: '5日', days: 5, seed: 102 },
    { key: '10d', label: '10日', days: 10, seed: 103 },
    { key: '20d', label: '20日', days: 20, seed: 104 },
  ];
  return specs.map((spec) => {
    const r = rng(spec.seed);
    const industries: IndustryFlowRow[] = sectors
      .map((s, idx) => {
        const d = daily[idx];
        const mainNet = round(sumTail(d.main, spec.days), 2);
        const superNet = round(sumTail(d.superNet, spec.days), 2);
        const turnover = round(s.turnover * spec.days, 2);
        return {
          name: s.name,
          changePct: round(sumTail(d.change, spec.days), 2),
          mainNet,
          superNet,
          largeNet: round(mainNet - superNet, 2),
          mainNetRange: round(sumTail(d.main, 20), 2),
          ratio: round(turnover > 0 ? (mainNet / turnover) * 100 : 0, 2),
          turnover,
          leader: s.leader,
          leaderPct: spec.days === 1 ? s.leaderPct : round(s.leaderPct * spec.days * (0.8 + r() * 0.4), 2),
        };
      })
      .sort((a, b) => b.mainNet - a.mainNet);
    const totalSuperNet = round(industries.reduce((a, i) => a + i.superNet, 0), 2);
    return {
      key: spec.key,
      label: spec.label,
      totalMainNet: round(industries.reduce((a, i) => a + i.mainNet, 0), 2),
      totalSuperNet,
      upCount: industries.filter((i) => i.mainNet > 0).length,
      downCount: industries.filter((i) => i.mainNet < 0).length,
      industries,
    };
  });
}

function buildSankey(): { unit: string; nodes: FlowSankeyNode[]; links: FlowSankeyLink[] } {
  const sources = [
    { id: 's1', name: '超大单', value: 1240 },
    { id: 's2', name: '大单', value: 986 },
    { id: 's3', name: '中单', value: 842 },
    { id: 's4', name: '小单', value: 706 },
  ];
  const weights: Record<string, Record<string, number>> = {
    s1: { 电子: 30, 通信: 22, 电力设备: 16, 计算机: 12, 有色金属: 8, 医药生物: 6, 汽车: 4, 机械设备: 2 },
    s2: { 电子: 26, 通信: 18, 电力设备: 19, 计算机: 13, 有色金属: 9, 医药生物: 7, 汽车: 5, 机械设备: 3 },
    s3: { 电子: 18, 通信: 12, 电力设备: 20, 计算机: 18, 有色金属: 9, 医药生物: 10, 汽车: 7, 机械设备: 6 },
    s4: { 电子: 14, 通信: 9, 电力设备: 17, 计算机: 20, 有色金属: 10, 医药生物: 12, 汽车: 10, 机械设备: 8 },
  };
  const targets = FLOW_INDUSTRIES.map((name) => ({
    id: `t-${name}`,
    name,
    value: 0,
    kind: 'target' as const,
  }));
  const links: FlowSankeyLink[] = [];
  for (const s of sources) {
    const row = weights[s.id];
    const sum = Object.values(row).reduce((a, b) => a + b, 0);
    for (const t of targets) {
      const value = round((s.value * row[t.name]) / sum, 2);
      t.value = round(t.value + value, 2);
      links.push({ source: s.id, target: t.id, value });
    }
  }
  return {
    unit: '亿元',
    nodes: [
      ...sources.map((s) => ({ ...s, kind: 'source' as const })),
      ...targets,
    ],
    links,
  };
}

function buildFlowHistory(): FlowPayload['history'] {
  const dates = tradingDates(20);
  const r = rng(203);
  const configs: { name: string; tone: 'up' | 'down' | 'brass' | 'steel'; base: number; vol: number }[] = [
    { name: '电子', tone: 'up', base: 26, vol: 42 },
    { name: '通信', tone: 'brass', base: 19, vol: 30 },
    { name: '电力设备', tone: 'steel', base: 11, vol: 26 },
    { name: '食品饮料', tone: 'down', base: -7, vol: 16 },
  ];
  return {
    dates,
    series: configs.map((c) => ({
      name: c.name,
      tone: c.tone,
      values: dates.map(() => round(c.base + (r() - 0.5) * c.vol, 2)),
    })),
  };
}

function buildFlow(overview: MarketOverview): FlowPayload {
  return {
    periods: buildFlowPeriods(overview.sectors, overview.capital),
    sankey: buildSankey(),
    capital: overview.capital,
    marginBalance: overview.breadth.marginBalance,
    northboundTurnover: overview.breadth.northboundTurnover,
    history: buildFlowHistory(),
    source: { provider: '演示数据 · 结构引擎', mode: 'demo', asOf: AS_OF },
  };
}

/* -------------------------------- 市场主线 -------------------------------- */

interface ThemeSeed
  extends Omit<MarketTheme, 'changePct' | 'heat' | 'strength' | 'crowding' | 'stage' | 'model'> {
  /** 成分股成交额，亿元 */
  turnover: number;
  /** 成分股自由流通市值，亿元 */
  floatCap: number;
  /** 主题内涨停家数 */
  limitUp: number;
}

const THEME_SEEDS: ThemeSeed[] = [
  {
    id: 'ai-optics',
    name: 'AI算力 · 光互联',
    alias: 'OPTICAL INTERCONNECT',
    turnover: 520,
    floatCap: 11000,
    limitUp: 7,
    inflow: 96.2,
    description: '海外算力资本开支上修叠加 1.6T 光模块放量，业绩兑现与产业趋势同向共振。',
    catalysts: ['北美云厂商上调 2027 资本开支', '1.6T 模块进入批量交付', 'CPO 交换机路线落地'],
    risk: '估值透支后对业绩不及预期的敏感度上升，需跟踪季度订单与毛利率。',
    etf: '通信ETF 515880',
    leaders: [
      { name: '中际旭创', code: '300308', changePct: 5.62, tag: '龙头' },
      { name: '新易盛', code: '300502', changePct: 7.42, tag: '弹性' },
      { name: '天孚通信', code: '300394', changePct: 4.18, tag: '器件' },
    ],
    spark: [42, 46, 44, 51, 55, 53, 58, 62, 61, 68, 72, 70, 76, 81, 79, 84, 88, 86, 90, 92],
  },
  {
    id: 'solid-battery',
    name: '固态电池',
    alias: 'SOLID-STATE BATTERY',
    turnover: 310,
    floatCap: 16000,
    limitUp: 4,
    inflow: 41.8,
    description: '半固态装车与全固态中试线落地，材料体系从 0 到 1，设备与电解质先行受益。',
    catalysts: ['头部电池厂中试线招标', '硫化物电解质送样', '车企半固态装车计划'],
    risk: '技术路线尚未收敛，量产节奏可能低于预期。',
    etf: '电池ETF 561910',
    leaders: [
      { name: '宁德时代', code: '300750', changePct: 3.86, tag: '权重' },
      { name: '当升科技', code: '300073', changePct: 6.12, tag: '材料' },
      { name: '先导智能', code: '300450', changePct: 4.86, tag: '设备' },
    ],
    spark: [22, 25, 24, 30, 34, 33, 38, 44, 47, 52, 51, 58, 63, 66, 64, 72, 76, 79, 82, 84],
  },
  {
    id: 'humanoid',
    name: '人形机器人',
    alias: 'HUMANOID ROBOTICS',
    turnover: 240,
    floatCap: 6000,
    limitUp: 2,
    inflow: 12.6,
    description: '量产预期反复，丝杠与减速器环节订单能见度分化，资金开始向确定性收敛。',
    catalysts: ['头部厂商量产指引', '灵巧手方案迭代', '供应链定点公告'],
    risk: '主题交易充分，边际催化减弱后容易进入宽幅震荡。',
    etf: '机器人ETF 562500',
    leaders: [
      { name: '三花智控', code: '002050', changePct: 2.14, tag: '执行器' },
      { name: '绿的谐波', code: '688017', changePct: -1.26, tag: '减速器' },
      { name: '拓普集团', code: '601689', changePct: 1.48, tag: '总成' },
    ],
    spark: [58, 66, 72, 78, 84, 88, 83, 76, 70, 74, 68, 63, 67, 72, 69, 65, 70, 73, 70, 71],
  },
  {
    id: 'semis',
    name: '半导体设备',
    alias: 'SEMICONDUCTOR CAPEX',
    turnover: 200,
    floatCap: 13000,
    limitUp: 3,
    inflow: 24.4,
    description: '先进制程扩产与国产化率提升共振，设备公司订单与合同负债同步改善。',
    catalysts: ['晶圆厂资本开支上修', '刻蚀/薄膜设备验证通过', '大基金三期落地'],
    risk: '海外制裁与出口管制的不确定性仍存。',
    etf: '半导体设备ETF 561980',
    leaders: [
      { name: '北方华创', code: '002371', changePct: 3.42, tag: '平台型' },
      { name: '中微公司', code: '688012', changePct: 2.86, tag: '刻蚀' },
      { name: '拓荆科技', code: '688072', changePct: 4.64, tag: '薄膜' },
    ],
    spark: [36, 40, 45, 43, 49, 54, 58, 56, 61, 65, 63, 68, 72, 70, 74, 76, 75, 77, 78, 78],
  },
  {
    id: 'innovative-drug',
    name: '创新药出海',
    alias: 'GLOBAL INNOVATION',
    turnover: 150,
    floatCap: 9500,
    limitUp: 2,
    inflow: 9.4,
    description: 'License-out 交易持续放量，国内创新药资产被全球定价，估值体系正在重估。',
    catalysts: ['大额 BD 授权落地', '海外 III 期数据读出', '医保谈判温和'],
    risk: '单笔交易波动大，板块内部业绩兑现差异明显。',
    etf: '创新药ETF 159992',
    leaders: [
      { name: '恒瑞医药', code: '600276', changePct: 3.24, tag: '龙头' },
      { name: '百济神州', code: '688235', changePct: 2.18, tag: '出海' },
      { name: '荣昌生物', code: '688331', changePct: 1.86, tag: 'BD' },
    ],
    spark: [28, 30, 33, 31, 38, 42, 40, 46, 52, 55, 53, 58, 61, 59, 63, 66, 64, 67, 68, 69],
  },
  {
    id: 'fusion',
    name: '可控核聚变',
    alias: 'FUSION ENERGY',
    turnover: 70,
    floatCap: 2200,
    limitUp: 2,
    inflow: 4.2,
    description: '工程堆招标与高温超导带材扩产，主题从早期认知转向订单验证，波动大但赔率可观。',
    catalysts: ['聚变工程堆招标', '高温超导带材扩产', '国际合作项目落地'],
    risk: '商业化周期长，短期难以证伪，交易属性强于基本面。',
    etf: '核电ETF 561260',
    leaders: [
      { name: '西部超导', code: '688122', changePct: 5.86, tag: '超导' },
      { name: '永鼎股份', code: '600105', changePct: 3.14, tag: '材料' },
      { name: '国光电气', code: '688776', changePct: 2.42, tag: '部件' },
    ],
    spark: [18, 22, 20, 26, 29, 27, 33, 36, 34, 40, 44, 42, 47, 50, 48, 53, 55, 54, 56, 57],
  },
  {
    id: 'low-altitude',
    name: '低空经济',
    alias: 'LOW ALTITUDE',
    turnover: 80,
    floatCap: 7000,
    limitUp: 0,
    inflow: -6.8,
    description: '政策密度下降，订单落地慢于预期，资金撤离后进入震荡出清阶段。',
    catalysts: ['地方空域改革试点', 'eVTOL 适航取证'],
    risk: '收入确认周期长，退潮期反弹持续性弱。',
    etf: '通用航空ETF 159231',
    leaders: [
      { name: '万丰奥威', code: '002085', changePct: -2.14, tag: '整机' },
      { name: '中信海直', code: '000099', changePct: -1.26, tag: '运营' },
      { name: '莱斯信息', code: '688631', changePct: 0.42, tag: '空管' },
    ],
    spark: [78, 74, 70, 66, 60, 56, 52, 55, 50, 46, 43, 40, 44, 41, 38, 35, 37, 34, 36, 42],
  },
  {
    id: 'stablecoin',
    name: '稳定币 · 金融科技',
    alias: 'DIGITAL FINANCE',
    turnover: 95,
    floatCap: 4200,
    limitUp: 1,
    inflow: 1.8,
    description: '政策预期反复，板块在低位重新蓄势，交易重心转向有真实牌照与场景的公司。',
    catalysts: ['香港稳定币牌照进展', '跨境支付试点扩容'],
    risk: '政策驱动为主，缺乏业绩锚，情绪退潮速度快。',
    etf: '金融科技ETF 516860',
    leaders: [
      { name: '东方财富', code: '300059', changePct: 1.68, tag: '平台' },
      { name: '拉卡拉', code: '300773', changePct: -0.86, tag: '支付' },
      { name: '恒生电子', code: '600570', changePct: 0.94, tag: '系统' },
    ],
    spark: [44, 48, 52, 58, 64, 61, 57, 60, 55, 50, 47, 52, 49, 45, 48, 51, 47, 50, 53, 52],
  },
];

function buildMainlines(overview: MarketOverview): MainlinePayload {
  const marketTurnover = overview.breadth.turnover;
  const benchmark = overview.indices.find((i) => i.code === '000300') ?? overview.indices[0];
  const marketChangePct = benchmark.changePct;

  const themes: MarketTheme[] = THEME_SEEDS.map((seed) => {
    const changePct = round(seed.leaders.reduce((a, l) => a + l.changePct, 0) / seed.leaders.length, 2);
    const heat = round((seed.turnover / marketTurnover) * 100, 2);
    const built = buildThemeModel({
      changePct,
      inflow: seed.inflow,
      turnover: seed.turnover,
      floatCap: seed.floatCap,
      limitUp: seed.limitUp,
      spark: seed.spark,
      marketTurnover,
      marketChangePct,
    });
    return {
      ...seed,
      changePct,
      heat,
      strength: built.strength,
      crowding: built.crowding,
      stage: built.stage,
      model: built.model,
    };
  });

  const ranked = [...themes].sort((a, b) => b.strength - a.strength);
  const leader = ranked[0];
  const leaderShort = leader.name.split(' · ')[0];
  const top3Heat = round(
    (themes
      .slice()
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 3)
      .reduce((a, t) => a + t.turnover, 0) /
      marketTurnover) *
      100,
    1,
  );
  const strongCool = ranked.filter((t) => t.strength >= 50 && t.crowding < 50);
  const fading = themes.filter((t) => t.stage === '分歧' || t.stage === '退潮');

  return {
    themes,
    events: [
      { date: '09.08', title: '北美云厂商上调资本开支指引，光模块板块启动', themeId: 'ai-optics', tone: 'up' },
      { date: '09.22', title: '硫化物电解质送样进展超预期，固态电池扩散', themeId: 'solid-battery', tone: 'up' },
      { date: '10.09', title: '人形机器人量产指引下修，板块进入分歧', themeId: 'humanoid', tone: 'down' },
      { date: '10.17', title: '大基金三期落地，半导体设备订单预期上修', themeId: 'semis', tone: 'up' },
      { date: '10.29', title: '创新药大额 BD 授权，出海逻辑重估', themeId: 'innovative-drug', tone: 'up' },
      { date: '11.06', title: '聚变工程堆招标启动，主题由萌芽转入加速', themeId: 'fusion', tone: 'up' },
      { date: '11.13', title: '低空经济政策真空，龙头跌破 20 日线', themeId: 'low-altitude', tone: 'down' },
      { date: '11.21', title: '1.6T 光模块追加订单，算力主线再度加速', themeId: 'ai-optics', tone: 'up' },
    ],
    summary: [
      `${leaderShort}成交占比 ${leader.heat.toFixed(1)}%，强度 ${leader.strength} / 拥挤 ${leader.crowding}，${leader.stage}期；前三大主线合计 ${top3Heat}%。`,
      strongCool.length
        ? `${strongCool
            .slice(0, 3)
            .map((t) => t.name)
            .join('、')}：强度 ≥50、拥挤 <50，仍在主升区。`
        : '当前没有主线同时满足强度 ≥50 与拥挤度 <50。',
      fading.length
        ? `${fading.map((t) => `${t.name}（${t.stage}，${t.strength}/${t.crowding}）`).join('；')}，动量转弱。`
        : '当前所有主线的强度与拥挤度同向，尚未出现分歧或退潮。',
    ],
    source: { provider: '演示数据 · 主线模型', mode: 'demo', asOf: AS_OF },
  };
}

/* --------------------------------- 个股 --------------------------------- */

interface StockSeed {
  code: string;
  name: string;
  exchange: 'SH' | 'SZ';
  industry: string;
  price: number;
  changePct: number;
  turnoverRate: number;
  marketCap: number;
  floatCap: number;
  pe: number | null;
  pb: number;
  high52: number;
  low52: number;
  amount: number;
  tags: string[];
  seed: number;
  revBase: number;
  profitBase: number;
  margin: number;
  peerMedian: number;
  northbound: number;
  peers: { code: string; name: string; corr: number; changePct: number }[];
  lhb: { date: string; buyer: string; amount: number }[];
}

const STOCK_SEEDS: StockSeed[] = [
  {
    code: '300308',
    name: '中际旭创',
    exchange: 'SZ',
    industry: '通信设备',
    price: 186.42,
    changePct: 5.62,
    turnoverRate: 6.82,
    marketCap: 2086.4,
    floatCap: 1982.6,
    pe: 42.8,
    pb: 9.24,
    high52: 198.6,
    low52: 96.2,
    amount: 128.4,
    tags: ['AI算力', '光模块', 'CPO', '沪深300'],
    seed: 308,
    revBase: 246.8,
    profitBase: 52.6,
    margin: 26.4,
    peerMedian: 38.2,
    northbound: 12.4,
    peers: [
      { code: '300502', name: '新易盛', corr: 0.92, changePct: 7.42 },
      { code: '300394', name: '天孚通信', corr: 0.86, changePct: 4.18 },
      { code: '601138', name: '工业富联', corr: 0.74, changePct: 2.36 },
      { code: '002281', name: '光迅科技', corr: 0.71, changePct: 3.02 },
    ],
    lhb: [
      { date: '11.24', buyer: '机构专用', amount: 4.28 },
      { date: '11.24', buyer: '深股通专用', amount: 2.16 },
      { date: '11.21', buyer: '中信证券上海溧阳路', amount: 1.84 },
    ],
  },
  {
    code: '600519',
    name: '贵州茅台',
    exchange: 'SH',
    industry: '白酒',
    price: 1538.2,
    changePct: -0.28,
    turnoverRate: 0.32,
    marketCap: 19320.6,
    floatCap: 19320.6,
    pe: 22.4,
    pb: 7.62,
    high52: 1826.4,
    low52: 1382.6,
    amount: 46.8,
    tags: ['核心资产', '高股息', '食品饮料'],
    seed: 519,
    revBase: 486.2,
    profitBase: 246.8,
    margin: 51.2,
    peerMedian: 24.6,
    northbound: 86.2,
    peers: [
      { code: '000858', name: '五粮液', corr: 0.88, changePct: -0.42 },
      { code: '000568', name: '泸州老窖', corr: 0.84, changePct: -0.66 },
      { code: '600809', name: '山西汾酒', corr: 0.79, changePct: -0.18 },
      { code: '603369', name: '今世缘', corr: 0.62, changePct: -0.52 },
    ],
    lhb: [
      { date: '11.24', buyer: '沪股通专用', amount: 1.86 },
      { date: '11.20', buyer: '机构专用', amount: 2.42 },
      { date: '11.18', buyer: '中信证券总部', amount: 1.12 },
    ],
  },
  {
    code: '300750',
    name: '宁德时代',
    exchange: 'SZ',
    industry: '电池',
    price: 268.4,
    changePct: 3.86,
    turnoverRate: 1.24,
    marketCap: 11830.2,
    floatCap: 10462.8,
    pe: 24.6,
    pb: 5.12,
    high52: 286.4,
    low52: 168.2,
    amount: 84.6,
    tags: ['固态电池', '储能', '创业板50'],
    seed: 750,
    revBase: 862.4,
    profitBase: 128.6,
    margin: 14.9,
    peerMedian: 27.8,
    northbound: 42.6,
    peers: [
      { code: '300014', name: '亿纬锂能', corr: 0.81, changePct: 2.46 },
      { code: '002074', name: '国轩高科', corr: 0.72, changePct: 1.84 },
      { code: '300073', name: '当升科技', corr: 0.68, changePct: 6.12 },
      { code: '300450', name: '先导智能', corr: 0.64, changePct: 4.86 },
    ],
    lhb: [
      { date: '11.24', buyer: '机构专用', amount: 6.42 },
      { date: '11.24', buyer: '深股通专用', amount: 3.18 },
      { date: '11.19', buyer: '华泰证券深圳益田路', amount: 2.06 },
    ],
  },
  {
    code: '688256',
    name: '寒武纪',
    exchange: 'SH',
    industry: '半导体',
    price: 1286.0,
    changePct: 8.14,
    turnoverRate: 4.62,
    marketCap: 5370.8,
    floatCap: 4218.4,
    pe: null,
    pb: 42.6,
    high52: 1328.4,
    low52: 486.2,
    amount: 96.2,
    tags: ['AI芯片', '国产替代', '科创50'],
    seed: 256,
    revBase: 18.6,
    profitBase: 2.4,
    margin: 12.9,
    peerMedian: 68.4,
    northbound: 6.8,
    peers: [
      { code: '688041', name: '海光信息', corr: 0.88, changePct: 4.26 },
      { code: '603986', name: '兆易创新', corr: 0.72, changePct: 2.14 },
      { code: '688008', name: '澜起科技', corr: 0.69, changePct: 1.86 },
      { code: '002371', name: '北方华创', corr: 0.61, changePct: 3.42 },
    ],
    lhb: [
      { date: '11.24', buyer: '机构专用', amount: 8.12 },
      { date: '11.24', buyer: '国泰君安上海新闸路', amount: 3.46 },
      { date: '11.21', buyer: '沪股通专用', amount: 2.28 },
    ],
  },
  {
    code: '601899',
    name: '紫金矿业',
    exchange: 'SH',
    industry: '工业金属',
    price: 21.68,
    changePct: 2.94,
    turnoverRate: 1.86,
    marketCap: 5740.6,
    floatCap: 4462.8,
    pe: 16.4,
    pb: 3.82,
    high52: 23.42,
    low52: 13.86,
    amount: 62.4,
    tags: ['黄金', '铜', '资源'],
    seed: 899,
    revBase: 982.4,
    profitBase: 96.8,
    margin: 9.9,
    peerMedian: 18.2,
    northbound: 28.4,
    peers: [
      { code: '603993', name: '洛阳钼业', corr: 0.82, changePct: 2.24 },
      { code: '600547', name: '山东黄金', corr: 0.78, changePct: 3.12 },
      { code: '000975', name: '银泰黄金', corr: 0.74, changePct: 2.86 },
      { code: '601168', name: '西部矿业', corr: 0.69, changePct: 1.94 },
    ],
    lhb: [
      { date: '11.24', buyer: '沪股通专用', amount: 2.86 },
      { date: '11.22', buyer: '机构专用', amount: 1.94 },
      { date: '11.20', buyer: '中信证券上海分公司', amount: 1.26 },
    ],
  },
  {
    code: '600036',
    name: '招商银行',
    exchange: 'SH',
    industry: '股份制银行',
    price: 46.82,
    changePct: 0.42,
    turnoverRate: 0.46,
    marketCap: 11810.4,
    floatCap: 9658.2,
    pe: 7.2,
    pb: 1.08,
    high52: 52.64,
    low52: 34.82,
    amount: 32.6,
    tags: ['高股息', '银行', '沪深300'],
    seed: 636,
    revBase: 862.4,
    profitBase: 386.2,
    margin: 44.8,
    peerMedian: 6.4,
    northbound: 62.8,
    peers: [
      { code: '600000', name: '浦发银行', corr: 0.86, changePct: 0.18 },
      { code: '601166', name: '兴业银行', corr: 0.83, changePct: 0.64 },
      { code: '000001', name: '平安银行', corr: 0.79, changePct: -0.12 },
      { code: '601398', name: '工商银行', corr: 0.72, changePct: 0.24 },
    ],
    lhb: [
      { date: '11.24', buyer: '沪股通专用', amount: 1.42 },
      { date: '11.21', buyer: '机构专用', amount: 0.96 },
      { date: '11.17', buyer: '中信证券总部', amount: 0.68 },
    ],
  },
];

function buildCandles(
  seed: number,
  n: number,
  prevClose: number,
  price: number,
  amount: number,
  high52: number,
  low52: number,
): Candle[] {
  const dates = tradingDates(n);
  const r = rng(seed);
  // 起点按现价在 52 周区间中的位置决定趋势：靠近高位则低起点，靠近低位则高起点。
  const pos = clamp((price - low52) / Math.max(high52 - low52, 0.01), 0.02, 0.98);
  const anchor = pos > 0.7 ? 0.86 : pos < 0.35 ? 1.14 : 1.0;
  const start = clamp(price * anchor * (0.96 + r() * 0.08), low52 * 1.01, high52 * 0.99);
  const noise: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (r() - 0.5) * prevClose * 0.018;
    noise.push(acc);
  }
  const lastNoise = noise[n - 1];
  const closes = Array.from({ length: n }, (_, i) => {
    const trend = start + ((prevClose - start) * i) / (n - 1);
    return clamp(trend + (noise[i] - (lastNoise * i) / (n - 1)) * 0.55, low52, high52);
  });
  const candles: Candle[] = closes.map((close, i) => {
    const prev = i === 0 ? close * 0.99 : closes[i - 1];
    const c = clamp(close, low52, high52);
    const open = clamp(prev * (1 + (r() - 0.5) * 0.014), low52, high52);
    const high = clamp(Math.max(open, c) * (1 + r() * 0.018), Math.max(open, c), high52);
    const low = clamp(Math.min(open, c) * (1 - r() * 0.018), low52, Math.min(open, c));
    const volume = round(18 + r() * 46 + Math.abs(c - prev) * 1.6, 1);
    return {
      date: dates[i],
      open: round(open, 2),
      high: round(high, 2),
      low: round(low, 2),
      close: round(c, 2),
      volume,
      amount: round((volume * c) / 10000, 2),
    };
  });
  const last = candles[n - 1];
  const todayClose = clamp(price, low52, high52);
  const todayOpen = clamp(prevClose * (1 + (price > prevClose ? 0.006 : -0.004)), low52, high52);
  last.close = round(todayClose, 2);
  last.open = round(todayOpen, 2);
  last.high = round(clamp(Math.max(todayOpen, todayClose) * 1.012, Math.max(todayOpen, todayClose), high52), 2);
  last.low = round(clamp(Math.min(todayOpen, todayClose) * 0.988, low52, Math.min(todayOpen, todayClose)), 2);
  last.volume = round(46 + amount * 0.1, 1);
  last.amount = round((last.volume * last.close) / 10000, 2);
  return candles;
}

function buildChips(price: number, seed: number): ChipLevel[] {
  const r = rng(seed);
  const levels: ChipLevel[] = [];
  for (let i = 0; i < 26; i++) {
    const p = price * (0.82 + i * 0.0104);
    const main = Math.exp(-((p - price * 0.985) ** 2) / (2 * (price * 0.045) ** 2));
    const accum = Math.exp(-((p - price * 0.9) ** 2) / (2 * (price * 0.028) ** 2)) * 0.55;
    const weight = Math.max(1.2, (main + accum) * 26 + r() * 3);
    levels.push({ price: round(p, 2), weight });
  }
  const total = levels.reduce((a, l) => a + l.weight, 0);
  return levels.map((l) => ({ ...l, weight: round((l.weight / total) * 100, 2) }));
}

function buildFinance(seed: StockSeed): FinanceRow[] {
  const r = rng(seed.seed + 5);
  const quarters = [
    '2024Q2',
    '2024Q3',
    '2024Q4',
    '2025Q1',
    '2025Q2',
    '2025Q3',
    '2025Q4',
    '2026Q1',
    '2026Q2',
    '2026Q3',
  ];
  const season = [0.92, 1.0, 1.08, 0.88, 0.92, 1.0, 1.08, 0.88, 1.02, 1.12];
  const all = quarters.map((period, i) => {
    const growth = 1 + 0.06 * Math.floor(i / 4);
    const revenue = round(seed.revBase * season[i] * growth * (0.94 + r() * 0.12), 2);
    const profit = round(revenue * (seed.margin / 100) * (0.9 + r() * 0.16), 2);
    return { period, revenue, profit };
  });
  return all.slice(4).map((row, i) => {
    const prior = all[i];
    return {
      period: row.period,
      revenue: row.revenue,
      revenueYoy: round((row.revenue / prior.revenue - 1) * 100, 1),
      profit: row.profit,
      profitYoy: round((row.profit / prior.profit - 1) * 100, 1),
      margin: round((row.profit / row.revenue) * 100, 1),
    };
  });
}

function buildPeHistory(currentPe: number, seed: number, n = 750): number[] {
  const r = rng(seed + 11);
  const start = currentPe * (0.65 + r() * 0.7);
  const noise: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (r() - 0.5) * currentPe * 0.02;
    noise.push(acc);
  }
  const lastNoise = noise[n - 1];
  return Array.from({ length: n }, (_, i) => {
    const trend = start + ((currentPe - start) * i) / (n - 1);
    return round(Math.max(currentPe * 0.2, trend + noise[i] - (lastNoise * i) / (n - 1)), 2);
  });
}

function buildStock(seed: StockSeed): StockPayload {
  const prevClose = round(seed.price / (1 + seed.changePct / 100), 2);
  const change = round(seed.price - prevClose, 2);
  const candles = buildCandles(seed.seed, 160, prevClose, seed.price, seed.amount, seed.high52, seed.low52);
  const today = candles[candles.length - 1];
  const profile: StockProfile = {
    code: seed.code,
    name: seed.name,
    exchange: seed.exchange,
    industry: seed.industry,
    price: seed.price,
    change,
    changePct: seed.changePct,
    open: today.open,
    high: today.high,
    low: today.low,
    prevClose,
    turnoverRate: round(seed.floatCap > 0 ? (seed.amount / seed.floatCap) * 100 : seed.turnoverRate, 2),
    amount: seed.amount,
    marketCap: seed.marketCap,
    floatCap: seed.floatCap,
    pe: seed.pe,
    pb: seed.pb,
    high52: seed.high52,
    low52: seed.low52,
    tags: seed.tags,
  };
  const r = rng(seed.seed + 9);
  const histDates = tradingDates(10).slice(1);
  const mainRatio = clamp(seed.changePct * 0.012 + (r() - 0.5) * 0.055, -0.12, 0.12);
  const main = round(seed.amount * mainRatio, 2);
  const superLarge = round(main * (0.58 + r() * 0.12), 2);
  const peHistory = seed.pe === null ? [] : buildPeHistory(seed.pe, seed.seed);
  return {
    profile,
    candles,
    capital: {
      main,
      superLarge,
      large: round(main - superLarge, 2),
      retail: round(-main * (0.45 + r() * 0.25), 2),
      history: histDates.map((d) => ({
        label: d.slice(5),
        value: round((r() - 0.42) * seed.amount * 0.06, 2),
      })),
    },
    chips: buildChips(seed.price, seed.seed + 3),
    valuation: {
      pe: seed.pe ?? 0,
      pb: seed.pb,
      percentile: seed.pe === null ? null : percentileOf(peHistory, seed.pe),
      history: peHistory,
      peersMedian: [
        { label: '行业中位', value: seed.peerMedian },
        { label: '全市场中位', value: 28.6 },
        { label: '自身 PB', value: seed.pb },
      ],
    },
    finance: buildFinance(seed),
    lhb: seed.lhb,
    peers: seed.peers,
    northboundHolding: seed.northbound,
    source: { provider: '演示数据 · 结构引擎', mode: 'demo', asOf: AS_OF },
  };
}

/* --------------------------------- 周期 --------------------------------- */

export function indicatorStage(key: string, latest: number, delta: number): string {
  if (key === 'pmi') {
    if (latest >= 51) return '扩张加快';
    if (latest >= 50) return '扩张区间';
    return '收缩区间';
  }
  if (key === 'cpi') {
    if (latest < 0) return '通缩';
    if (latest < 1) return '低位';
    if (latest < 3) return '温和';
    return '高位';
  }
  if (key === 'ppi') {
    if (latest < 0) return delta > 0 ? '负值收窄' : '低位徘徊';
    return delta > 0 ? '上行' : '高位回落';
  }
  if (key === 'afre') return delta > 0 ? '信用企稳' : '信用收缩';
  return '';
}

/**
 * 48 个月序列：先按 trend（48 个月净变化）铺一条从 start 到 prev 的趋势，
 * 再叠加季节项与噪声；末两点强制为 prev / latest，保证 delta 与页面一致。
 */
function buildIndicator(
  key: string,
  name: string,
  unit: string,
  latest: number,
  delta: number,
  amp: number,
  trend: number,
  seed: number,
  note: string,
  digits = 1,
): CycleIndicator {
  const dates = monthDates(48);
  const r = rng(seed);
  const n = dates.length;
  const prev = latest - delta;
  const start = prev - trend;
  const series = Array.from({ length: n }, (_, i) => {
    const base = start + ((prev - start) * i) / (n - 2);
    const cycle = Math.sin(i / 4.2 + seed * 0.13) * amp * 0.5;
    const noise = (r() - 0.5) * amp * 0.35;
    return round(base + cycle + noise, digits);
  });
  series[n - 2] = round(prev, digits);
  series[n - 1] = latest;
  return {
    key,
    name,
    unit,
    latest,
    delta: round(latest - series[n - 2], digits),
    percentile: percentileOf(series, latest),
    stage: indicatorStage(key, latest, delta),
    note,
    dates,
    series,
  };
}

function buildCycle(): CyclePayload {
  const indicators = [
    buildIndicator('pmi', '制造业 PMI', '', 50.8, 0.4, 2.6, 0.8, 301, '连续 3 个月站上荣枯线，新订单分项回升'),
    buildIndicator('cpi', 'CPI 同比', '%', 0.6, 0.2, 0.9, -2.0, 302, '食品项拖累减弱，核心 CPI 保持韧性'),
    buildIndicator('ppi', 'PPI 同比', '%', -1.8, 0.5, 2.0, -6.0, 303, '上游价格环比转正，但同比仍待修复'),
    buildIndicator('afre', '社融存量同比', '%', 8.4, 0.1, 0.6, -1.2, 304, '政府债支撑明显，企业中长贷边际改善'),
  ];
  const built = buildCycleModel(indicators);
  const quadrants = [
    {
      id: 'recovery',
      name: '复苏',
      growth: '增长 ↑',
      inflation: '通胀 ↓',
      assets: ['权益', '可转债', '中长久期利率债'],
    },
    { id: 'overheat', name: '过热', growth: '增长 ↑', inflation: '通胀 ↑', assets: ['商品', '周期股', '短久期债'] },
    { id: 'stagflation', name: '滞胀', growth: '增长 ↓', inflation: '通胀 ↑', assets: ['现金', '黄金', '防御'] },
    { id: 'recession', name: '衰退', growth: '增长 ↓', inflation: '通胀 ↓', assets: ['长久期利率债', '高股息', '黄金'] },
  ].map((q) => ({ ...q, active: q.name === built.phase }));
  return {
    clock: {
      phase: built.phase,
      x: built.x,
      y: built.y,
      note: built.note,
      next: built.next,
      quadrants,
      model: built.model,
    },
    indicators,
    styleMatrix: [
      { name: '大盘成长', value: 2.4, note: '算力权重拉动' },
      { name: '小盘成长', value: 3.6, note: '主题扩散，弹性最强' },
      { name: '大盘价值', value: -0.8, note: '红利阶段性休整' },
      { name: '小盘价值', value: 1.1, note: '顺周期局部修复' },
    ],
    analogs: [
      { period: '2019Q1', similarity: 78, note: '宽信用 + 产业周期启动，成长风格领先' },
      { period: '2016Q3', similarity: 71, note: '供给侧改革 + 盈利修复，价值与周期共舞' },
      { period: '2013Q2', similarity: 64, note: '移动互联网浪潮，主题投资高度活跃' },
    ],
    credit: {
      stage: '宽货币 · 稳信用',
      inventory: '主动去库 → 被动去库',
      liquidity: '中性偏松',
      earnings: '弱修复',
    },
    source: { provider: '演示数据 · 周期模型', mode: 'demo', asOf: AS_OF },
  };
}

/* -------------------------------- 知识宇宙 -------------------------------- */

type NodeSeed = [id: string, name: string, layer: UniverseNode['layer'], weight: number, note: string, tags: string];

const NODE_SEEDS: NodeSeed[] = [
  ['liquidity', '流动性', 'macro', 0.95, '银行间与资本市场的资金宽裕程度，决定风险资产的估值底座。', '货币·估值'],
  ['credit', '信用周期', 'macro', 0.9, '社融与信贷扩张的节奏，是A股中期盈利的先行指标。', '社融·盈利'],
  ['inventory', '库存周期', 'macro', 0.82, '企业库存的主动/被动变化，决定顺周期行业的盈利斜率。', '库存·景气'],
  ['inflation', '通胀', 'macro', 0.78, 'CPI 与 PPI 的剪刀差，影响中下游利润分配与政策空间。', '价格·利润'],
  ['rates', '无风险利率', 'macro', 0.8, '10 年期国债收益率，是成长股估值分母的核心变量。', '估值·债券'],
  ['fx', '汇率', 'macro', 0.62, '人民币汇率影响外资流向与出口链的相对竞争力。', '外资·出口'],
  ['risk', '风险偏好', 'macro', 0.72, '两融、成交额与换手率共同刻画的资金情绪。', '情绪·两融'],
  ['policy', '政策周期', 'macro', 0.75, '产业政策与监管取向，决定主题投资的边界与斜率。', '政策·主题'],
  ['ai', 'AI算力', 'meso', 0.98, '从芯片、光互联到液冷与IDC，当前最强的主线产业趋势。', '算力·资本开支'],
  ['solid', '固态电池', 'meso', 0.86, '材料体系从液态走向固态，设备与电解质率先受益。', '电池·0→1'],
  ['robot', '人形机器人', 'meso', 0.8, '执行器、减速器与丝杠构成的核心供应链。', '机器人·量产'],
  ['semi-equip', '半导体设备', 'meso', 0.84, '先进制程扩产与国产化率提升的双重驱动。', '设备·国产化'],
  ['innovative-drug', '创新药', 'meso', 0.76, 'License-out 让国内资产进入全球定价体系。', '医药·出海'],
  ['low-altitude', '低空经济', 'meso', 0.6, '政策驱动的早期产业，订单与适航进度是关键。', 'eVTOL·政策'],
  ['fusion', '可控核聚变', 'meso', 0.55, '工程堆招标与高温超导带材扩产带来的远期主题。', '聚变·超导'],
  ['metals', '有色金属', 'meso', 0.74, '铜金铝的供给约束与全球流动性共同定价。', '资源·通胀'],
  ['dividend', '高股息', 'meso', 0.68, '低利率环境下，稳定现金流资产的配置价值。', '红利·防御'],
  ['global', '出海链', 'meso', 0.63, '海外收入占比提升，规避内需波动的成长路径。', '出口·全球化'],
  ['optical', '光模块', 'micro', 0.92, 'AI集群互联的核心器件，1.6T 迭代带来量价齐升。', '光互联·1.6T'],
  ['cpo', 'CPO', 'micro', 0.7, '光电共封装，下一代交换机降低功耗的关键路径。', '封装·功耗'],
  ['liquid-cooling', '液冷', 'micro', 0.66, '高功率机柜的散热刚需，渗透率快速提升。', '散热·IDC'],
  ['copper-connect', '铜连接', 'micro', 0.58, '机柜内短距高速互联的性价比方案。', '连接·机柜'],
  ['silicon-carbon', '硅碳负极', 'micro', 0.64, '提升能量密度的关键负极材料。', '负极·能量密度'],
  ['lithium-sulfide', '硫化锂', 'micro', 0.55, '硫化物固态电解质的核心原料。', '电解质·硫化物'],
  ['harmonic', '谐波减速器', 'micro', 0.6, '机器人关节的核心部件，精度与寿命决定壁垒。', '关节·精密'],
  ['ball-screw', '行星滚柱丝杠', 'micro', 0.57, '直线执行器的关键，加工设备与良率是瓶颈。', '执行器·丝杠'],
  ['etch', '刻蚀设备', 'micro', 0.62, '先进制程中价值量最高的设备品类之一。', '设备·刻蚀'],
  ['deposition', '薄膜沉积', 'micro', 0.6, 'CVD/PVD 设备，国产替代加速推进。', '设备·薄膜'],
  ['rare-earth', '稀土永磁', 'micro', 0.5, '机器人电机与新能源车的上游材料。', '磁材·电机'],
  ['electrolyte', '固态电解质', 'micro', 0.59, '固态电池的命门，路线尚未完全收敛。', '电解质·路线'],
  ['idc-rental', '算力租赁', 'micro', 0.54, '算力供需错配下的短期商业模式。', '算力·租赁'],
  ['hbm', 'HBM', 'micro', 0.68, '高带宽存储，AI 芯片的带宽瓶颈所在。', '存储·带宽'],
  ['lifecycle', '主线生命周期', 'method', 0.8, '萌芽、发酵、加速、分歧、退潮五阶段的分析框架。', '框架·节奏'],
  ['crowding', '拥挤度', 'method', 0.75, '成交额占比、换手与机构持仓刻画的一致性风险。', '风险·一致性'],
  ['prosperity', '景气度', 'method', 0.73, '订单、价格与产能利用率构成的基本面刻度。', '基本面·景气'],
  ['leader-effect', '龙头效应', 'method', 0.7, '主线的定价权与情绪锚，先看龙头再看扩散。', '龙头·情绪'],
  ['volume-price', '量价结构', 'method', 0.66, '成交与价格的位置关系，识别承接与派发。', '技术·成交'],
  ['capital-tier', '资金分层', 'method', 0.64, '超大单、大单、中单、小单的行为差异。', '资金·结构'],
  ['zjxc', '中际旭创', 'stock', 0.78, '全球光模块龙头，1.6T 放量的核心受益者。', '光模块·龙头'],
  ['xys', '新易盛', 'stock', 0.68, '光模块高弹性标的，海外客户占比高。', '光模块·弹性'],
  ['catl', '宁德时代', 'stock', 0.82, '动力电池龙头，固态电池与储能双线布局。', '电池·龙头'],
  ['cambricon', '寒武纪', 'stock', 0.66, '国产 AI 芯片核心标的，估值锚在订单。', 'AI芯片·国产'],
  ['zijin', '紫金矿业', 'stock', 0.64, '铜金资源龙头，受益于全球流动性宽松。', '资源·铜金'],
  ['hengrui', '恒瑞医药', 'stock', 0.62, '创新药龙头，管线出海打开估值空间。', '医药·创新'],
];

const EDGE_SEEDS: [string, string, UniverseEdge['kind']][] = [
  ['liquidity', 'credit', 'logic'],
  ['liquidity', 'rates', 'logic'],
  ['liquidity', 'risk', 'capital'],
  ['credit', 'inventory', 'logic'],
  ['credit', 'policy', 'logic'],
  ['inflation', 'policy', 'logic'],
  ['rates', 'dividend', 'capital'],
  ['fx', 'metals', 'logic'],
  ['risk', 'ai', 'capital'],
  ['policy', 'semi-equip', 'logic'],
  ['policy', 'fusion', 'logic'],
  ['policy', 'low-altitude', 'logic'],
  ['ai', 'optical', 'supply'],
  ['ai', 'cpo', 'logic'],
  ['ai', 'liquid-cooling', 'logic'],
  ['ai', 'hbm', 'supply'],
  ['ai', 'idc-rental', 'logic'],
  ['optical', 'cpo', 'supply'],
  ['optical', 'zjxc', 'supply'],
  ['optical', 'xys', 'supply'],
  ['cpo', 'zjxc', 'logic'],
  ['liquid-cooling', 'idc-rental', 'logic'],
  ['copper-connect', 'optical', 'supply'],
  ['solid', 'silicon-carbon', 'logic'],
  ['solid', 'lithium-sulfide', 'supply'],
  ['solid', 'electrolyte', 'supply'],
  ['solid', 'catl', 'supply'],
  ['robot', 'harmonic', 'supply'],
  ['robot', 'ball-screw', 'supply'],
  ['robot', 'rare-earth', 'supply'],
  ['semi-equip', 'etch', 'logic'],
  ['semi-equip', 'deposition', 'logic'],
  ['etch', 'cambricon', 'supply'],
  ['deposition', 'hbm', 'supply'],
  ['innovative-drug', 'hengrui', 'supply'],
  ['metals', 'rare-earth', 'logic'],
  ['metals', 'zijin', 'supply'],
  ['dividend', 'catl', 'capital'],
  ['global', 'optical', 'capital'],
  ['lifecycle', 'ai', 'method'],
  ['lifecycle', 'solid', 'method'],
  ['lifecycle', 'optical', 'method'],
  ['crowding', 'ai', 'method'],
  ['crowding', 'robot', 'method'],
  ['prosperity', 'solid', 'method'],
  ['prosperity', 'semi-equip', 'method'],
  ['leader-effect', 'optical', 'method'],
  ['leader-effect', 'harmonic', 'method'],
  ['volume-price', 'optical', 'method'],
  ['capital-tier', 'optical', 'method'],
  ['capital-tier', 'zjxc', 'method'],
  ['lifecycle', 'cambricon', 'method'],
];

const TOPIC_SEEDS: KnowledgeTopic[] = [
  {
    id: 'why-optical',
    title: '为什么光模块是 AI 算力链上利润最确定的环节',
    kind: '产业研究',
    summary:
      '算力集群规模扩大后，互联带宽成为瓶颈。光模块是少数具备「量价齐升 + 中国厂商全球份额」双重逻辑的环节。',
    bullets: [
      '1.6T 迭代使单模块价值量提升约 60%，同时单价与毛利率同步改善。',
      '北美云厂商资本开支是核心跟踪变量，订单能见度通常领先业绩 1-2 个季度。',
      'CPO 是中期变量，短期仍以可插拔方案为主，需跟踪交换机路线切换节奏。',
    ],
    related: ['optical', 'cpo', 'zjxc', 'xys', 'ai'],
  },
  {
    id: 'crowding-signal',
    title: '拥挤度：主线从加速到分歧的先行指标',
    kind: '方法论',
    summary: '当成交额占比、换手率与机构持仓同时处于历史高位，主线的边际买盘开始衰减，波动率随之抬升。',
    bullets: [
      '成交额占比 > 近一年 90% 分位，是进入分歧期的必要非充分条件。',
      '拥挤度高但景气度仍上行时，调整往往以时间换空间。',
      '龙头补跌 + 低位补涨同时出现，通常是主线切换的信号。',
    ],
    related: ['crowding', 'lifecycle', 'leader-effect', 'ai'],
  },
  {
    id: 'inventory-cycle',
    title: '库存周期与顺周期行业的择时',
    kind: '宏观框架',
    summary: '库存周期从主动去库转向被动去库时，需求边际改善先于价格，顺周期行业往往迎来第一波估值修复。',
    bullets: [
      '跟踪指标：产成品库存同比、PPI 环比、工业企业利润。',
      '被动去库阶段，优先选择库存低、价格弹性大的上游资源。',
      '主动补库确认后，中游制造的盈利弹性通常大于上游。',
    ],
    related: ['inventory', 'credit', 'metals', 'zijin'],
  },
  {
    id: 'solid-state',
    title: '固态电池：0→1 阶段的主题投资节奏',
    kind: '产业研究',
    summary: '固态电池处于技术路线尚未收敛的早期阶段，投资节奏由「事件催化」而非「业绩兑现」主导。',
    bullets: [
      '设备与电解质先行，材料体系（硫化物/氧化物/聚合物）决定弹性。',
      '中试线招标、送样进展与车企装车计划是三类核心催化。',
      '0→1 阶段仓位管理比选股更重要，避免在情绪高潮追高。',
    ],
    related: ['solid', 'electrolyte', 'lithium-sulfide', 'silicon-carbon', 'catl'],
  },
];

function buildUniverse(): UniversePayload {
  return {
    nodes: NODE_SEEDS.map(([id, name, layer, weight, note, tags]) => ({
      id,
      name,
      layer,
      weight,
      note,
      tags: tags.split('·'),
    })),
    edges: EDGE_SEEDS.filter(([s, t]) => NODE_SEEDS.some((n) => n[0] === s) && NODE_SEEDS.some((n) => n[0] === t)).map(
      ([source, target, kind]) => ({ source, target, kind }),
    ),
    topics: TOPIC_SEEDS,
    source: { provider: '演示数据 · 知识图谱', mode: 'demo', asOf: AS_OF },
  };
}

/* -------------------------------- 汇总输出 -------------------------------- */

const MODULES: SearchItem[] = [
  { id: 'mod-overview', label: '盘面结构', type: 'module', sub: '指数 · 宽度 · 资金 · 梯队', href: '/' },
  { id: 'mod-flow', label: '行业资金流', type: 'module', sub: '主力资金迁移与行业轮动', href: '/flow' },
  { id: 'mod-mainlines', label: '市场主线', type: 'module', sub: '强度 · 拥挤度 · 生命周期', href: '/mainlines' },
  { id: 'mod-stocks', label: '个股结构', type: 'module', sub: 'K线 · 筹码 · 估值 · 财务', href: '/stocks' },
  { id: 'mod-cycle', label: '经济周期', type: 'module', sub: '美林时钟 · 宏观指标 · 风格', href: '/cycle' },
  { id: 'mod-universe', label: '知识宇宙', type: 'module', sub: '宏观到公司的知识图谱', href: '/universe' },
];

let cached: MockDataset | null = null;

export function buildMockDataset(): MockDataset {
  if (cached) return cached;
  const overview = buildOverview();
  const flow = buildFlow(overview);
  const mainlines = buildMainlines(overview);
  const stocks: Record<string, StockPayload> = {};
  for (const seed of STOCK_SEEDS) stocks[seed.code] = buildStock(seed);
  const stockList: StockSummary[] = STOCK_SEEDS.map((s) => ({
    code: s.code,
    name: s.name,
    industry: s.industry,
    price: s.price,
    changePct: s.changePct,
    marketCap: s.marketCap,
  }));
  const cycle = buildCycle();
  const universe = buildUniverse();
  const search: SearchItem[] = [
    ...MODULES,
    ...stockList.map((s) => ({
      id: `stock-${s.code}`,
      label: `${s.name} ${s.code}`,
      type: 'stock' as const,
      sub: `${s.industry} · ${s.changePct > 0 ? '+' : ''}${s.changePct}%`,
      href: `/stocks/${s.code}`,
    })),
    ...mainlines.themes.map((t) => ({
      id: `theme-${t.id}`,
      label: t.name,
      type: 'theme' as const,
      sub: `${t.stage}期 · 强度 ${t.strength}`,
      href: `/mainlines?theme=${t.id}`,
    })),
    ...universe.topics.map((t) => ({
      id: `topic-${t.id}`,
      label: t.title,
      type: 'topic' as const,
      sub: `${t.kind} · 知识宇宙`,
      href: `/universe?topic=${t.id}`,
    })),
  ];
  cached = { overview, flow, mainlines, stockList, stocks, cycle, universe, search };
  return cached;
}

export const DEFAULT_STOCK_CODE = '300308';
