/**
 * 跨端共享的数据契约。
 * web 与 api 只依赖这里的类型，数据渠道（provider）负责把外部数据映射为这些结构。
 */

export type DataMode = 'live' | 'demo' | 'mixed';

export interface SourceMeta {
  /** 数据渠道名称，例如 "东方财富" / "演示数据" */
  provider: string;
  mode: DataMode;
  /** ISO 时间戳 */
  asOf: string;
  note?: string;
}

export type Tone = 'up' | 'down' | 'flat';
export type SessionState = 'pre' | 'open' | 'break' | 'closed';

/* ---------------------------------- 盘面 ---------------------------------- */

export interface IndexQuote {
  code: string;
  name: string;
  value: number;
  change: number;
  changePct: number;
  prevClose: number;
  amount: number;
  spark: number[];
}

export interface MarketBreadth {
  up: number;
  down: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  broken: number;
  /** 两市成交额，亿元 */
  turnover: number;
  prevTurnover: number;
  /** 两融余额，亿元 */
  marginBalance: number;
  /** 北向成交额，亿元 */
  northboundTurnover: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface IntradayPoint {
  t: string;
  price: number;
  avg: number;
  volume: number;
}

export interface SectorSnapshot {
  name: string;
  changePct: number;
  /** 主力净流入，亿元 */
  netInflow: number;
  /** 成交额，亿元 */
  turnover: number;
  marketCap: number;
  leader: string;
  leaderPct: number;
}

export interface LadderGroup {
  level: string;
  stocks: string[];
}

export interface CapitalSplit {
  superLarge: number;
  large: number;
  medium: number;
  small: number;
}

export interface MarketOverview {
  asOf: string;
  session: SessionState;
  sessionLabel: string;
  indices: IndexQuote[];
  breadth: MarketBreadth;
  distribution: DistributionBucket[];
  intraday: {
    index: string;
    prevClose: number;
    points: IntradayPoint[];
  };
  sectors: SectorSnapshot[];
  capital: CapitalSplit;
  ladders: LadderGroup[];
  insights: string[];
  source: SourceMeta;
}

/* --------------------------------- 资金流 --------------------------------- */

export type FlowPeriodKey = '1d' | '5d' | '10d' | '20d';

export interface IndustryFlowRow {
  name: string;
  changePct: number;
  /** 主力净流入，亿元 */
  mainNet: number;
  superNet: number;
  largeNet: number;
  /** 区间累计净流入，亿元 */
  mainNetRange: number;
  /** 主力净流入 / 成交额 */
  ratio: number;
  turnover: number;
  leader: string;
  leaderPct: number;
}

export interface FlowPeriod {
  key: FlowPeriodKey;
  label: string;
  totalMainNet: number;
  totalSuperNet: number;
  upCount: number;
  downCount: number;
  industries: IndustryFlowRow[];
}

export interface FlowSankeyNode {
  id: string;
  name: string;
  value: number;
  kind: 'source' | 'target';
}

export interface FlowSankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface FlowPayload {
  periods: FlowPeriod[];
  sankey: {
    unit: string;
    nodes: FlowSankeyNode[];
    links: FlowSankeyLink[];
  };
  capital: CapitalSplit;
  marginBalance: number;
  northboundTurnover: number;
  history: {
    dates: string[];
    series: { name: string; values: number[]; tone: Tone | 'brass' | 'steel' }[];
  };
  source: SourceMeta;
}

/* --------------------------------- 市场主线 -------------------------------- */

export type ThemeStage = '萌芽' | '发酵' | '加速' | '分歧' | '退潮';

export interface ThemeLeader {
  name: string;
  code: string;
  changePct: number;
  tag?: string;
}

export interface MarketTheme {
  id: string;
  name: string;
  alias: string;
  stage: ThemeStage;
  /** 0-100 */
  strength: number;
  /** 0-100 */
  crowding: number;
  /** 成交额占全市场比重，% */
  heat: number;
  /** 主力净流入，亿元 */
  inflow: number;
  description: string;
  catalysts: string[];
  risk: string;
  etf: string;
  leaders: ThemeLeader[];
  spark: number[];
}

export interface MainlineEvent {
  date: string;
  title: string;
  themeId: string;
  tone: Tone;
}

export interface MainlinePayload {
  themes: MarketTheme[];
  events: MainlineEvent[];
  summary: string[];
  source: SourceMeta;
}

/* --------------------------------- 个股 ---------------------------------- */

export interface StockProfile {
  code: string;
  name: string;
  exchange: 'SH' | 'SZ';
  industry: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  turnoverRate: number;
  amount: number;
  marketCap: number;
  floatCap: number;
  pe: number | null;
  pb: number;
  high52: number;
  low52: number;
  tags: string[];
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface ChipLevel {
  price: number;
  weight: number;
}

export interface FinanceRow {
  period: string;
  revenue: number;
  revenueYoy: number;
  profit: number;
  profitYoy: number;
  margin: number;
}

export interface StockPayload {
  profile: StockProfile;
  candles: Candle[];
  capital: {
    main: number;
    superLarge: number;
    large: number;
    retail: number;
    history: { label: string; value: number }[];
  };
  chips: ChipLevel[];
  valuation: {
    pe: number;
    pb: number;
    percentile: number;
    history: number[];
    peersMedian: { label: string; value: number }[];
  };
  finance: FinanceRow[];
  lhb: { date: string; buyer: string; amount: number }[];
  peers: { code: string; name: string; corr: number; changePct: number }[];
  northboundHolding: number;
  source: SourceMeta;
}

export interface StockSummary {
  code: string;
  name: string;
  industry: string;
  price: number;
  changePct: number;
  marketCap: number;
}

/* --------------------------------- 经济周期 -------------------------------- */

export interface CycleIndicator {
  key: string;
  name: string;
  unit: string;
  latest: number;
  delta: number;
  percentile: number;
  stage: string;
  note: string;
  dates: string[];
  series: number[];
}

export interface CycleQuadrant {
  id: string;
  name: string;
  growth: string;
  inflation: string;
  assets: string[];
  active?: boolean;
}

export interface CyclePayload {
  clock: {
    phase: string;
    /** -1 ~ 1，横向为通胀，纵向为增长 */
    x: number;
    y: number;
    note: string;
    quadrants: CycleQuadrant[];
    next: string;
  };
  indicators: CycleIndicator[];
  styleMatrix: { name: string; value: number; note: string }[];
  analogs: { period: string; similarity: number; note: string }[];
  credit: { stage: string; inventory: string; liquidity: string; earnings: string };
  source: SourceMeta;
}

/* --------------------------------- 知识宇宙 -------------------------------- */

export type UniverseLayer = 'macro' | 'meso' | 'micro' | 'method' | 'stock';

export interface UniverseNode {
  id: string;
  name: string;
  layer: UniverseLayer;
  /** 0-1 */
  weight: number;
  note: string;
  tags: string[];
}

export interface UniverseEdge {
  source: string;
  target: string;
  kind: 'logic' | 'supply' | 'capital' | 'method';
}

export interface KnowledgeTopic {
  id: string;
  title: string;
  kind: string;
  summary: string;
  bullets: string[];
  related: string[];
}

export interface UniversePayload {
  nodes: UniverseNode[];
  edges: UniverseEdge[];
  topics: KnowledgeTopic[];
  source: SourceMeta;
}

/* --------------------------------- 检索 ---------------------------------- */

export interface SearchItem {
  id: string;
  label: string;
  type: 'module' | 'stock' | 'theme' | 'topic';
  sub: string;
  href: string;
}

/* --------------------------------- 汇总 ---------------------------------- */

export interface MockDataset {
  overview: MarketOverview;
  flow: FlowPayload;
  mainlines: MainlinePayload;
  stockList: StockSummary[];
  stocks: Record<string, StockPayload>;
  cycle: CyclePayload;
  universe: UniversePayload;
  search: SearchItem[];
}
