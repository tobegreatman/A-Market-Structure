import type {
  CyclePayload,
  FlowPeriodKey,
  FlowPayload,
  MainlinePayload,
  MarketOverview,
  SearchItem,
  StockPayload,
  StockSummary,
  UniversePayload,
} from '@am/contracts';

/**
 * 数据渠道契约。
 *
 * 新增渠道（Tushare / Wind / 聚宽 / 自建行情网关）时，只需实现该接口，
 * 并在 MarketService 中注册；上层路由与前端完全无感。
 * 渠道可以只实现自己支持的粒度，未实现的粒度回落到上一个渠道。
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;

  getOverview(): Promise<MarketOverview>;
  getFlow(period?: FlowPeriodKey): Promise<FlowPayload>;
  getMainlines(): Promise<MainlinePayload>;
  getStockList(): Promise<StockSummary[]>;
  getStock(code: string): Promise<StockPayload | null>;
  getCycle(): Promise<CyclePayload>;
  getUniverse(): Promise<UniversePayload>;
  search(keyword: string): Promise<SearchItem[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
