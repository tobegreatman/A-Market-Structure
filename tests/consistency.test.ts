import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AXIS_ANCHORS,
  axisScore,
  buildCycleModel,
  buildMockDataset,
  buildSentiment,
  classifyStage,
  cyclePhase,
  emotionLabel,
  indicatorStage,
  percentileRank,
  sentimentRaw,
  sentimentWeightSum,
  trendStats,
  SENTIMENT_FACTORS,
  SENTIMENT_HISTORY,
  type FlowPayload,
  type FlowPeriodKey,
  type ThemeStage,
} from '@am/contracts';
import { MarketService } from '../apps/api/src/market-service';
import type { MarketDataProvider } from '../apps/api/src/providers/types';
import { pct, signed } from '../apps/web/src/lib/format';

const data = buildMockDataset();
const stocks = Object.values(data.stocks);

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function movingAverage(values: number[], days: number): number {
  return sum(values.slice(-days)) / days;
}

/* ------------------------------ 盘面 / 宽度 ------------------------------ */

test('涨跌分布与涨跌停统计一致', () => {
  const b = data.overview.breadth;
  const dist = data.overview.distribution;

  assert.equal(sum(dist.map((d) => d.count)), b.up + b.down + b.flat);
  assert.equal(dist[0].count, b.limitDown);
  assert.equal(dist[6].count, b.flat);
  assert.equal(dist[12].count, b.limitUp);
  assert.equal(sum(dist.slice(0, 6).map((d) => d.count)), b.down);
  assert.equal(sum(dist.slice(7).map((d) => d.count)), b.up);
});

test('情绪温度 = 6 分项分位加权，权重合计为 1', () => {
  const b = data.overview.breadth;
  const s = b.sentiment;

  assert.equal(s.factors.length, 6);
  assert.equal(s.window, 252);
  assert.equal(SENTIMENT_HISTORY.length, 252);
  assert.ok(Math.abs(sentimentWeightSum() - 1) < 1e-9, '权重合计应为 1');
  for (const def of SENTIMENT_FACTORS) {
    const factor = s.factors.find((f) => f.key === def.key);
    assert.ok(factor, `缺少分项 ${def.key}`);
    assert.equal(factor.weight, def.weight);
    assert.ok(factor.percentile >= 0 && factor.percentile <= 100, `${def.label} 分位越界`);
    assert.equal(factor.contribution, Math.round(factor.percentile * factor.weight * 100) / 100);
  }

  const weighted = s.factors.reduce((a, f) => a + f.percentile * f.weight, 0) / sentimentWeightSum();
  assert.ok(Math.abs(s.score - weighted) < 0.06, '综合分应等于分位加权');
  assert.equal(s.temperature, Math.round(s.score));
  assert.equal(b.temperature, s.temperature, 'breadth.temperature 必须与模型一致');
  assert.equal(b.emotion, s.emotion);
  assert.equal(b.emotion, emotionLabel(b.temperature));
});

test('情绪分项读数与盘面统计同源', () => {
  const b = data.overview.breadth;
  const raw = sentimentRaw({
    up: b.up,
    down: b.down,
    flat: b.flat,
    limitUp: b.limitUp,
    limitDown: b.limitDown,
    broken: b.broken,
    maxBoard: b.maxBoard,
    premium: b.premium,
    turnover: b.turnover,
    turnoverMa5: b.turnoverMa5,
  });
  const total = b.up + b.down + b.flat;
  const ladderMax = Math.max(...data.overview.ladders.map((g) => Number.parseInt(g.level, 10) || 1));

  assert.ok(Math.abs(raw.breadth - (b.up / total) * 100) < 1e-9);
  assert.ok(Math.abs(raw.limitUp - (b.limitUp / total) * 100) < 1e-9);
  assert.ok(Math.abs(raw.seal - (b.limitUp / (b.limitUp + b.broken)) * 100) < 1e-9);
  assert.equal(raw.boardHeight, ladderMax, '连板高度应取梯队最高板');
  assert.equal(b.maxBoard, ladderMax);
  assert.ok(Math.abs(raw.volume - b.turnover / b.turnoverMa5) < 1e-9);

  const byKey = new Map(b.sentiment.factors.map((f) => [f.key, f]));
  assert.equal(byKey.get('breadth')!.value, Math.round(raw.breadth * 10) / 10);
  assert.equal(byKey.get('limitUp')!.value, Math.round(raw.limitUp * 100) / 100);
  assert.equal(byKey.get('seal')!.value, Math.round(raw.seal * 10) / 10);
  assert.equal(byKey.get('boardHeight')!.value, b.maxBoard);
  assert.equal(byKey.get('premium')!.value, b.premium);
  assert.equal(byKey.get('volume')!.value, Math.round(raw.volume * 100) / 100);
  assert.equal(b.prevTurnover, 17238.4);
  assert.ok(b.turnoverMa5 > 0 && b.turnoverMa5 !== b.prevTurnover, '5 日均额不能等于昨日成交额');
});

test('每个分项的分位可由 252 日历史复算', () => {
  const b = data.overview.breadth;
  const raw = sentimentRaw({
    up: b.up,
    down: b.down,
    flat: b.flat,
    limitUp: b.limitUp,
    limitDown: b.limitDown,
    broken: b.broken,
    maxBoard: b.maxBoard,
    premium: b.premium,
    turnover: b.turnover,
    turnoverMa5: b.turnoverMa5,
  });

  for (const factor of b.sentiment.factors) {
    const series = SENTIMENT_HISTORY.map((d) => d[factor.key as keyof typeof d]);
    assert.equal(factor.percentile, percentileRank(series, raw[factor.key as keyof typeof raw]), `${factor.label} 分位不可复算`);
  }
});

test('分位函数有界、单调，且中位数读数落在 50 附近', () => {
  assert.equal(percentileRank([], 3), 50);
  assert.equal(percentileRank([1, 2, 3], 0), 0);
  assert.equal(percentileRank([1, 2, 3], 4), 100);
  assert.ok(percentileRank([1, 2, 3], 2.5) > percentileRank([1, 2, 3], 1.5));

  // 六个分项都取历史中位时，温度应回到中性 50
  const neutral = buildSentiment({
    up: 5360,
    down: 4640,
    flat: 0,
    limitUp: 104,
    limitDown: 0,
    broken: 41.66,
    maxBoard: 4,
    premium: 1.44,
    turnover: 101,
    turnoverMa5: 100,
  });
  assert.ok(Math.abs(neutral.score - 50) <= 1.5, `中性输入应落在 50 附近，实际 ${neutral.score}`);
  assert.ok(['中性', '偏弱', '偏强'].includes(neutral.emotion));
});

test('指数迷你走势首尾与涨跌幅一致', () => {
  for (const index of data.overview.indices) {
    const first = index.spark[0];
    const last = index.spark[index.spark.length - 1];

    assert.equal(index.spark.length, 48);
    assert.ok(Math.abs(first - index.prevClose) < 0.02, `${index.name} 首点应等于昨收`);
    assert.ok(Math.abs(last - index.value) < 0.01, `${index.name} 末点应等于现价`);
    assert.equal(Math.sign(last - first), Math.sign(index.changePct), `${index.name} 走势方向应与涨跌幅一致`);
  }
});

/* -------------------------------- 资金流 -------------------------------- */

test('主力 = 超大 + 大，行业合计与资金水位一致', () => {
  const cap = data.overview.capital;
  const main = cap.superLarge + cap.large;
  const today = data.flow.periods[0];

  assert.ok(Math.abs(main - (cap.superLarge + cap.large)) < 1e-9);
  assert.ok(Math.abs(today.totalMainNet - main) <= 0.1, '1 日行业合计应等于主力净流入');
  assert.ok(Math.abs(today.totalSuperNet - cap.superLarge) <= 0.1, '1 日超大单合计应等于资本拆分');

  for (const period of data.flow.periods) {
    assert.ok(Math.abs(sum(period.industries.map((r) => r.mainNet)) - period.totalMainNet) <= 0.01);
    assert.ok(Math.abs(sum(period.industries.map((r) => r.superNet)) - period.totalSuperNet) <= 0.01);
    for (const row of period.industries) {
      assert.ok(Math.abs(row.mainNet - row.superNet - row.largeNet) <= 0.01);
    }
  }
});

test('5/10/20 日是滚动累加，不是 1 日乘固定系数', () => {
  const oneDay = data.flow.periods[0];
  const fiveDay = data.flow.periods[1];
  const ratios = fiveDay.industries
    .map((row) => {
      const base = oneDay.industries.find((r) => r.name === row.name);
      return base && Math.abs(base.mainNet) > 1 ? row.mainNet / base.mainNet : null;
    })
    .filter((v): v is number => v !== null);

  assert.ok(ratios.length >= 10);
  assert.ok(Math.max(...ratios) - Math.min(...ratios) > 0.5, '5 日/1 日不应是固定倍数');

  const twentyDay = data.flow.periods[3];
  for (const period of data.flow.periods) {
    for (const row of period.industries) {
      const twenty = twentyDay.industries.find((r) => r.name === row.name);
      assert.ok(twenty, `${row.name} 应存在于 20 日表`);
      assert.ok(Math.abs(row.mainNetRange - twenty.mainNet) <= 0.01, `${row.name} 的 20 日累计应一致`);
    }
  }
});

test('Sankey 是毛买入结构，且每个节点守恒', () => {
  const sankey = data.flow.sankey;
  const sources = sankey.nodes.filter((n) => n.kind === 'source');
  const targets = sankey.nodes.filter((n) => n.kind === 'target');

  assert.equal(sankey.unit, '亿元');
  assert.deepEqual(sources.map((n) => n.name), ['超大单', '大单', '中单', '小单']);

  for (const source of sources) {
    const linked = sum(sankey.links.filter((l) => l.source === source.id).map((l) => l.value));
    assert.ok(Math.abs(linked - source.value) <= 0.2, `${source.name} 出边应守恒`);
  }
  for (const target of targets) {
    const linked = sum(sankey.links.filter((l) => l.target === target.id).map((l) => l.value));
    assert.ok(Math.abs(linked - target.value) <= 0.01, `${target.name} 入边应守恒`);
  }

  const gross = sum(sources.map((n) => n.value));
  assert.equal(gross, 3774);
  assert.ok(gross > data.flow.periods[0].totalMainNet * 2, '毛买入不应被当成净流入');
});

/* --------------------------------- 个股 --------------------------------- */

test('K 线落在 52 周区间内，且今日 OHLC 与报价一致', () => {
  for (const stock of stocks) {
    const { profile, candles } = stock;
    const last = candles[candles.length - 1];
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);

    assert.ok(profile.price >= profile.low52 && profile.price <= profile.high52, `${profile.name} 现价应在 52 周区间`);
    assert.ok(Math.min(...lows) >= profile.low52 - 0.01, `${profile.name} K 线低点不应跌破 52 周低点`);
    assert.ok(Math.max(...highs) <= profile.high52 + 0.01, `${profile.name} K 线高点不应突破 52 周高点`);
    assert.equal(last.close, profile.price);
    assert.equal(profile.open, last.open);
    assert.equal(profile.high, last.high);
    assert.equal(profile.low, last.low);

    for (const candle of candles) {
      assert.ok(candle.high >= Math.max(candle.open, candle.close) - 0.02);
      assert.ok(candle.low <= Math.min(candle.open, candle.close) + 0.02);
      assert.ok(candle.low <= candle.high);
      assert.ok(candle.volume >= 0);
    }
  }
});

test('K 线生成器不应让所有样本都呈多头排列', () => {
  const bullish = stocks.filter(({ candles }) => {
    const closes = candles.map((c) => c.close);
    return (
      movingAverage(closes, 5) > movingAverage(closes, 20) &&
      movingAverage(closes, 20) > movingAverage(closes, 60)
    );
  });

  assert.ok(bullish.length < stocks.length, '全部样本多头排列说明起点被写死');
  assert.ok(bullish.length > 0, '至少应保留一部分多头样本');
});

test('筹码权重归一为 100%，获利盘是真实占比', () => {
  for (const stock of stocks) {
    const total = sum(stock.chips.map((c) => c.weight));
    const profit = sum(stock.chips.filter((c) => c.price <= stock.profile.price).map((c) => c.weight));

    assert.ok(Math.abs(total - 100) <= 0.5, `${stock.profile.name} 筹码权重应归一`);
    assert.ok(profit >= 0 && profit <= 100, `${stock.profile.name} 获利盘应在 0-100%`);
    assert.ok(stock.chips.every((c) => c.weight > 0));
  }
});

test('估值分位由近 3 年 PE 序列计算，亏损股为 null', () => {
  for (const stock of stocks) {
    const { profile, valuation } = stock;

    if (profile.pe === null) {
      assert.equal(valuation.percentile, null);
      assert.equal(valuation.history.length, 0);
      continue;
    }

    assert.equal(valuation.history.length, 750);
    assert.ok(Math.abs(valuation.history[valuation.history.length - 1] - profile.pe) < 0.02);
    assert.ok(valuation.percentile !== null && valuation.percentile >= 0 && valuation.percentile <= 100);

    const history = valuation.history.slice(0, -1);
    const expected = Math.round((history.filter((v) => v <= profile.pe).length / history.length) * 100);
    assert.ok(Math.abs(valuation.percentile - expected) <= 1, `${profile.name} 分位应可复算`);
  }
});

test('财报同比可由同季营收/净利复算', () => {
  for (const stock of stocks) {
    const rows = stock.finance;
    assert.equal(rows.length, 6);

    for (const row of rows) {
      assert.ok(Math.abs(row.margin - (row.profit / row.revenue) * 100) <= 0.11);
    }

    for (const i of [4, 5]) {
      const row = rows[i];
      const prior = rows[i - 4];
      const revenueYoy = (row.revenue / prior.revenue - 1) * 100;
      const profitYoy = (row.profit / prior.profit - 1) * 100;

      assert.ok(Math.abs(row.revenueYoy - revenueYoy) <= 0.3, `${stock.profile.name} ${row.period} 营收同比应可复算`);
      assert.ok(Math.abs(row.profitYoy - profitYoy) <= 0.3, `${stock.profile.name} ${row.period} 净利同比应可复算`);
    }
  }
});

test('个股主力 = 超大 + 大，且不再恒为成交额的 18%', () => {
  for (const stock of stocks) {
    const { profile, capital } = stock;
    assert.ok(Math.abs(capital.main - capital.superLarge - capital.large) <= 0.02);
    assert.ok(Math.abs(capital.main) <= profile.amount * 0.121);
    assert.ok(Math.abs(profile.turnoverRate - (profile.amount / profile.floatCap) * 100) <= 0.02);
  }

  assert.ok(stocks.some((s) => s.capital.main > 0));
  assert.ok(stocks.some((s) => s.capital.main < 0), '至少应有一只主力净流出的样本');
});

/* --------------------------------- 周期 --------------------------------- */

test('美林时钟的 phase 与 active 象限由 x/y 派生', () => {
  const clock = data.cycle.clock;

  assert.equal(clock.phase, cyclePhase(clock.x, clock.y));
  assert.deepEqual(
    clock.quadrants.filter((q) => q.active).map((q) => q.name),
    [clock.phase],
  );

  for (const indicator of data.cycle.indicators) {
    assert.ok(indicator.percentile >= 0 && indicator.percentile <= 100);
    assert.equal(indicator.series[indicator.series.length - 1], indicator.latest);
    assert.equal(indicator.delta, Math.round((indicator.latest - indicator.series[indicator.series.length - 2]) * 10) / 10);
    assert.equal(indicator.stage, indicatorStage(indicator.key, indicator.latest, indicator.delta));
    const history = indicator.series.slice(0, -1);
    const expected = Math.round((history.filter((v) => v <= indicator.latest).length / history.length) * 100);
    assert.equal(indicator.percentile, expected, `${indicator.name} 分位不可复算`);
  }
});

test('周期 x/y 由 4 个宏观分项锚点加权派生', () => {
  const clock = data.cycle.clock;
  const model = clock.model;
  const byKey = new Map(data.cycle.indicators.map((i) => [i.key, i]));

  assert.equal(model.growthParts.length, 2);
  assert.equal(model.inflationParts.length, 2);
  assert.ok(Math.abs(sum(model.growthParts.map((p) => p.weight)) - 1) < 1e-9);
  assert.ok(Math.abs(sum(model.inflationParts.map((p) => p.weight)) - 1) < 1e-9);

  for (const part of [...model.growthParts, ...model.inflationParts]) {
    const indicator = byKey.get(part.key)!;
    const anchor = AXIS_ANCHORS[part.key as keyof typeof AXIS_ANCHORS];
    assert.equal(part.value, indicator.latest);
    assert.equal(part.score, axisScore(indicator.latest, anchor.center, anchor.half));
    assert.equal(part.contribution, Math.round(part.score * part.weight * 100) / 100);
    assert.ok(part.score >= -1 && part.score <= 1, `${part.label} 分项越界`);
  }

  const y = sum(model.growthParts.map((p) => p.contribution));
  const x = sum(model.inflationParts.map((p) => p.contribution));
  assert.ok(Math.abs(clock.y - y) < 0.011, 'y 应等于增长分项贡献之和');
  assert.ok(Math.abs(clock.x - x) < 0.011, 'x 应等于通胀分项贡献之和');
  assert.equal(model.growth, clock.y);
  assert.equal(model.inflation, clock.x);
  assert.equal(model.margin, Math.round(Math.min(Math.abs(clock.x), Math.abs(clock.y)) * 100) / 100);
  assert.ok(model.phaseReason.includes(clock.phase), '阶段理由应包含当前象限');

  const next = clock.next.match(/进入「(.+)」/);
  assert.ok(next, 'next 应为「进入某象限」的派生句');
  assert.notEqual(next[1], clock.phase, '下一阶段不能等于当前阶段');

  const rebuilt = buildCycleModel(data.cycle.indicators);
  assert.equal(rebuilt.x, clock.x);
  assert.equal(rebuilt.y, clock.y);
  assert.equal(rebuilt.phase, clock.phase);
  assert.equal(rebuilt.note, clock.note);
  assert.equal(rebuilt.next, clock.next);
  assert.deepEqual(rebuilt.model, model);
});

/* --------------------------------- 主线 --------------------------------- */

test('主线阶段与强度/拥挤度不矛盾，且龙头必须是 A 股代码', () => {
  const allowed: Record<string, ThemeStage[]> = {
    'top-left': ['萌芽', '发酵', '加速', '分歧'],
    'top-right': ['加速', '分歧', '退潮'],
    'bottom-left': ['萌芽', '退潮', '分歧'],
    'bottom-right': ['退潮', '分歧'],
  };

  for (const theme of data.mainlines.themes) {
    assert.ok(theme.strength >= 0 && theme.strength <= 100);
    assert.ok(theme.crowding >= 0 && theme.crowding <= 100);
    assert.ok(theme.heat > 0 && theme.heat <= 100);

    const vertical = theme.strength >= 50 ? 'top' : 'bottom';
    const horizontal = theme.crowding >= 50 ? 'right' : 'left';
    const quadrant = `${vertical}-${horizontal}`;
    assert.ok(allowed[quadrant].includes(theme.stage), `${theme.name} 的 ${theme.stage} 不应出现在 ${quadrant}`);

    if (theme.stage === '加速') assert.ok(theme.strength >= 65);
    if (theme.stage === '退潮') assert.ok(theme.strength <= 60);
    if (theme.stage === '萌芽') assert.ok(theme.strength <= 65);

    for (const leader of theme.leaders) {
      assert.match(leader.code, /^(60|68|00|30)\d{4}$/, `${leader.name} ${leader.code} 不是沪深 A 股代码`);
    }
  }
});

test('主线强度/拥挤度由分项公式派生，可逐项复算', () => {
  const marketTurnover = data.overview.breadth.turnover;
  const benchmark = data.overview.indices.find((i) => i.code === '000300')!;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  for (const theme of data.mainlines.themes) {
    const strengthParts = theme.model.strengthParts;
    const crowdingParts = theme.model.crowdingParts;

    assert.equal(strengthParts.length, 4, `${theme.name} 强度应为 4 个分项`);
    assert.equal(crowdingParts.length, 3, `${theme.name} 拥挤度应为 3 个分项`);
    assert.ok(Math.abs(sum(strengthParts.map((p) => p.weight)) - 1) < 1e-9);
    assert.ok(Math.abs(sum(crowdingParts.map((p) => p.weight)) - 1) < 1e-9);
    assert.equal(theme.strength, Math.round(theme.model.strengthScore));
    assert.equal(theme.crowding, Math.round(theme.model.crowdingScore));
    assert.equal(theme.stage, theme.model.stage);

    for (const part of [...strengthParts, ...crowdingParts]) {
      assert.ok(part.score >= 0 && part.score <= 100, `${theme.name} ${part.label} 得分越界`);
      assert.equal(part.contribution, Math.round(part.score * part.weight * 100) / 100);
    }
    assert.ok(Math.abs(sum(strengthParts.map((p) => p.score * p.weight)) - theme.model.strengthScore) < 0.06);
    assert.ok(Math.abs(sum(crowdingParts.map((p) => p.score * p.weight)) - theme.model.crowdingScore) < 0.06);

    // 原始读数必须能由盘面字段复算
    const avgChange = sum(theme.leaders.map((l) => l.changePct)) / theme.leaders.length;
    assert.equal(theme.changePct, round2(avgChange));
    assert.equal(theme.model.strengthParts[0].value, round2(theme.changePct - benchmark.changePct));
    assert.equal(theme.model.strengthParts[1].value, round2((theme.inflow / theme.turnover) * 100));
    assert.equal(theme.model.strengthParts[2].value, theme.limitUp);
    assert.equal(theme.heat, round2((theme.turnover / marketTurnover) * 100));
    assert.equal(theme.model.crowdingParts[0].value, theme.heat);
    assert.equal(theme.model.crowdingParts[1].value, round2((theme.turnover / theme.floatCap) * 100));
    const trend = trendStats(theme.spark);
    assert.equal(theme.model.strengthParts[3].value, Math.round(trend.momentum5 * 10) / 10);
    assert.equal(theme.model.crowdingParts[2].value, theme.spark[theme.spark.length - 1]);

    // 成交占比是主题成交额 / 全市场，量级必须可信
    assert.ok(theme.heat > 0 && theme.heat < 8, `${theme.name} 成交占比 ${theme.heat}% 不合常理`);
    assert.ok(theme.floatCap > theme.turnover);

    // 阶段必须由同一套规则派生
    const { momentum5, ret20 } = trendStats(theme.spark);
    const derived = classifyStage(theme.strength, theme.crowding, momentum5, ret20);
    assert.equal(theme.stage, derived.stage);
    assert.equal(theme.model.stageReason, derived.reason);
  }
});

/* ------------------------------- API 缓存 ------------------------------- */

test('flow 缓存 key 必须带 period', async () => {
  const calls: Array<string | undefined> = [];
  const provider = {
    id: 'test',
    label: 'test',
    getFlow: async (period?: FlowPeriodKey) => {
      calls.push(period);
      return {
        periods: [],
        sankey: { unit: '亿元', nodes: [], links: [] },
        capital: { superLarge: 0, large: 0, medium: 0, small: 0 },
        marginBalance: 0,
        northboundTurnover: 0,
        history: { dates: [], series: [] },
        source: { provider: 'test', mode: 'demo', asOf: '' },
        marker: period,
      } as unknown as FlowPayload;
    },
  } as unknown as MarketDataProvider;

  const service = new MarketService(provider, 60_000);
  const oneDay = (await service.getFlow('1d')) as FlowPayload & { marker?: string };
  const fiveDay = (await service.getFlow('5d')) as FlowPayload & { marker?: string };
  const cached = (await service.getFlow('1d')) as FlowPayload & { marker?: string };

  assert.equal(oneDay.marker, '1d');
  assert.equal(fiveDay.marker, '5d');
  assert.equal(cached.marker, '1d');
  assert.deepEqual(calls, ['1d', '5d']);
});

test('负零不显示为 -0.0', () => {
  assert.equal(signed(-0.02, 1), '0.0');
  assert.equal(pct(-0.02, 1), '0.0%');
  assert.equal(signed(-0.06, 1), '-0.1');
  assert.equal(pct(0.06, 1), '+0.1%');
});

test('情绪模型在空盘面输入下不产生 NaN', () => {
  const empty = buildSentiment({
    up: 0,
    down: 0,
    flat: 0,
    limitUp: 0,
    limitDown: 0,
    broken: 0,
    maxBoard: 1,
    premium: 0,
    turnover: 0,
    turnoverMa5: 0,
  });
  assert.ok(Number.isFinite(empty.score));
  assert.ok(empty.factors.every((f) => Number.isFinite(f.percentile) && Number.isFinite(f.value)));
  assert.ok(empty.temperature >= 0 && empty.temperature <= 100);
});
