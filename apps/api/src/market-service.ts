import type { FlowPeriodKey } from '@am/contracts';
import type { MarketDataProvider } from './providers/types';
import { ProviderError } from './providers/types';

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

/**
 * 行情服务层：渠道编排 + TTL 缓存 + 统一错误语义。
 * 未来接入多渠道路由（实时优先、收盘快照兜底）时，只需在这里扩展。
 */
export class MarketService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly provider: MarketDataProvider,
    private readonly ttlMs = 30_000,
  ) {}

  get providerLabel() {
    return this.provider.label;
  }

  get providerId() {
    return this.provider.id;
  }

  private async cached<T>(key: string, loader: () => Promise<T>, ttl = this.ttlMs): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value as T;
    const value = await loader();
    this.cache.set(key, { expiresAt: now + ttl, value });
    return value;
  }

  getOverview() {
    return this.cached('overview', () => this.provider.getOverview());
  }

  getFlow(period?: FlowPeriodKey) {
    return this.cached(`flow:${period ?? 'default'}`, () => this.provider.getFlow(period), 60_000);
  }

  getMainlines() {
    return this.cached('mainlines', () => this.provider.getMainlines(), 60_000);
  }

  getStockList() {
    return this.cached('stock-list', () => this.provider.getStockList(), 60_000);
  }

  async getStock(code: string) {
    const stock = await this.cached(`stock:${code}`, () => this.provider.getStock(code), 60_000);
    if (!stock) throw new ProviderError(`未找到股票 ${code}`, 404);
    return stock;
  }

  getCycle() {
    return this.cached('cycle', () => this.provider.getCycle(), 5 * 60_000);
  }

  getUniverse() {
    return this.cached('universe', () => this.provider.getUniverse(), 10 * 60_000);
  }

  search(keyword: string) {
    return this.cached(`search:${keyword}`, () => this.provider.search(keyword), 10_000);
  }
}
