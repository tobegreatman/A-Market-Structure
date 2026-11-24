import type { FastifyInstance } from 'fastify';
import type { FlowPeriodKey } from '@am/contracts';
import type { MarketService } from './market-service';
import { ProviderError } from './providers/types';

const FLOW_PERIODS: FlowPeriodKey[] = ['1d', '5d', '10d', '20d'];

export async function registerRoutes(app: FastifyInstance, market: MarketService) {
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-data-provider', market.providerId);
    if (request.url.startsWith('/api/market') || request.url.startsWith('/api/flow')) {
      reply.header('cache-control', 'public, max-age=15');
    }
  });

  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    provider: { id: market.providerId, label: market.providerLabel },
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  }));

  app.get('/api/market/overview', async () => market.getOverview());

  app.get<{ Querystring: { period?: string } }>('/api/flow', async (request) => {
    const raw = request.query.period;
    const period = FLOW_PERIODS.includes(raw as FlowPeriodKey) ? (raw as FlowPeriodKey) : undefined;
    if (raw && !period) throw new ProviderError(`不支持的周期参数: ${raw}`, 400);
    return market.getFlow(period);
  });

  app.get('/api/mainlines', async () => market.getMainlines());

  app.get('/api/stocks', async () => market.getStockList());

  app.get<{ Params: { code: string } }>('/api/stocks/:code', async (request) => {
    const code = request.params.code.replace(/\D/g, '');
    if (code.length !== 6) throw new ProviderError('股票代码需为 6 位数字', 400);
    return market.getStock(code);
  });

  app.get('/api/cycle', async () => market.getCycle());

  app.get('/api/universe', async () => market.getUniverse());

  app.get<{ Querystring: { q?: string } }>('/api/search', async (request) => {
    const keyword = (request.query.q ?? '').slice(0, 40);
    const items = await market.search(keyword);
    return { keyword, items };
  });
}
