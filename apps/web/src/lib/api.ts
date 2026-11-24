import {
  buildMockDataset,
  type CyclePayload,
  type FlowPayload,
  type MainlinePayload,
  type MarketOverview,
  type SearchItem,
  type StockPayload,
  type StockSummary,
  type UniversePayload,
} from '@am/contracts';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
const TIMEOUT = 4000;

const local = () => buildMockDataset();

async function getJson<T>(path: string, timeout = TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function withFallback<T>(path: string, fallback: () => T): Promise<T> {
  try {
    return await getJson<T>(path);
  } catch {
    return fallback();
  }
}

export function searchLocal(keyword: string): SearchItem[] {
  const q = keyword.trim().toLowerCase();
  const all = local().search;
  if (!q) return all.slice(0, 8);
  return all.filter((item) => `${item.label} ${item.sub}`.toLowerCase().includes(q)).slice(0, 12);
}

export const api = {
  overview: () => withFallback<MarketOverview>('/market/overview', () => local().overview),
  flow: () => withFallback<FlowPayload>('/flow', () => local().flow),
  mainlines: () => withFallback<MainlinePayload>('/mainlines', () => local().mainlines),
  stockList: () => withFallback<StockSummary[]>('/stocks', () => local().stockList),
  stock: (code: string) =>
    withFallback<StockPayload>(`/stocks/${code}`, () => {
      const stock = local().stocks[code];
      if (!stock) throw new Error(`未找到股票 ${code}`);
      return stock;
    }),
  cycle: () => withFallback<CyclePayload>('/cycle', () => local().cycle),
  universe: () => withFallback<UniversePayload>('/universe', () => local().universe),
  search: async (keyword: string): Promise<SearchItem[]> => {
    try {
      const payload = await getJson<{ items: SearchItem[] }>(`/search?q=${encodeURIComponent(keyword)}`, 2500);
      return payload.items;
    } catch {
      return searchLocal(keyword);
    }
  },
  health: async (): Promise<boolean> => {
    try {
      await getJson<{ ok: boolean }>('/health', 1600);
      return true;
    } catch {
      return false;
    }
  },
};
