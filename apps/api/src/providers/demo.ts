import { buildMockDataset, type FlowPeriodKey } from '@am/contracts';
import type { MarketDataProvider } from './types';

/**
 * 演示渠道：使用确定性种子生成的完整行情快照。
 * 同一交易日多次请求结果一致，便于前端联调与视觉回归。
 * 真实渠道接入后，可作为降级兜底（fallback）保留。
 */
export class DemoProvider implements MarketDataProvider {
  readonly id = 'demo';
  readonly label = '演示数据 · 结构引擎';

  async getOverview() {
    return buildMockDataset().overview;
  }

  async getFlow(_period?: FlowPeriodKey) {
    return buildMockDataset().flow;
  }

  async getMainlines() {
    return buildMockDataset().mainlines;
  }

  async getStockList() {
    return buildMockDataset().stockList;
  }

  async getStock(code: string) {
    return buildMockDataset().stocks[code] ?? null;
  }

  async getCycle() {
    return buildMockDataset().cycle;
  }

  async getUniverse() {
    return buildMockDataset().universe;
  }

  async search(keyword: string) {
    const q = keyword.trim().toLowerCase();
    if (!q) return buildMockDataset().search.slice(0, 8);
    return buildMockDataset()
      .search.filter((item) => `${item.label} ${item.sub}`.toLowerCase().includes(q))
      .slice(0, 12);
  }
}
