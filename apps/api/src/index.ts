import Fastify from 'fastify';
import cors from '@fastify/cors';
import { MarketService } from './market-service';
import { DemoProvider } from './providers/demo';
import { ProviderError } from './providers/types';
import { registerRoutes } from './routes';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

const market = new MarketService(new DemoProvider());

await app.register(cors, { origin: true });

await registerRoutes(app, market);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ProviderError) {
    reply.status(error.statusCode).send({ error: { code: error.statusCode, message: error.message } });
    return;
  }
  request.log.error(error);
  reply.status(500).send({ error: { code: 500, message: '服务内部错误' } });
});

app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ error: { code: 404, message: `未找到接口 ${request.method} ${request.url}` } });
});

const shutdown = async (signal: string) => {
  app.log.info(`收到 ${signal}，正在关闭服务`);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`A-Market API 已启动 · 数据渠道: ${market.providerLabel}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
