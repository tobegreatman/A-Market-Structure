import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Candle } from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync, useSize } from '../../lib/hooks';
import { clamp, ticksBetween } from '../../lib/geometry';
import { cx, fmt, pct, signed, toneOf } from '../../lib/format';
import { movingAverage, weightedAverage } from '../../lib/series';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { Sparkline } from '../../components/Sparkline';
import { Delta } from '../../components/Delta';
import { Meter } from '../../components/Meter';

const MA_CONFIG = [
  { period: 5, color: 'var(--brass)', label: 'MA5' },
  { period: 10, color: 'var(--steel)', label: 'MA10' },
  { period: 20, color: 'var(--clay)', label: 'MA20' },
  { period: 60, color: '#8d9a8e', label: 'MA60' },
];

const KNOWN = new Set(['300308', '600519', '300750', '688256', '601899', '600036']);

/* -------------------------------- K线 -------------------------------- */

function CandleChart({ candles, visibleCount, height = 424 }: { candles: Candle[]; visibleCount: number; height?: number }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { left: 4, right: 48, top: 12, bottom: 22 };
  const priceH = 292;
  const volTop = 322;
  const volH = 66;

  const chart = useMemo(() => {
    if (!width) return null;
    const visible = candles.slice(-visibleCount);
    const closes = candles.map((c) => c.close);
    const mas = MA_CONFIG.map((cfg) => ({
      ...cfg,
      values: movingAverage(closes, cfg.period).slice(-visibleCount),
    }));
    const allValues = visible.flatMap((c) => [c.high, c.low]).concat(
      mas.flatMap((m) => m.values.filter((v): v is number => v !== null)),
    );
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.06 || 1;
    const yMin = min - padding;
    const yMax = max + padding;
    const innerW = width - pad.left - pad.right;
    const step = innerW / visible.length;
    const x = (i: number) => pad.left + step * (i + 0.5);
    const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * priceH;
    const maxVol = Math.max(...visible.map((c) => c.volume));
    const bodyW = Math.max(1.4, Math.min(9, step * 0.58));
    const labelIdx = Array.from(new Set([0, Math.floor((visible.length - 1) / 4), Math.floor((visible.length - 1) / 2), Math.floor(((visible.length - 1) * 3) / 4), visible.length - 1]));
    return {
      visible,
      mas,
      x,
      y,
      step,
      innerW,
      bodyW,
      yMin,
      yMax,
      maxVol,
      labelIdx,
      ticks: ticksBetween(yMin, yMax, 4),
      offset: candles.length - visible.length,
    };
  }, [candles, visibleCount, width]);

  if (!chart) return <div ref={ref} className="chart-frame" style={{ height }} />;

  const hoverCandle = hover !== null ? chart.visible[hover] : null;
  const prevOf = (i: number) => {
    if (i > 0) return chart.visible[i - 1].close;
    const fullIndex = chart.offset - 1;
    return fullIndex >= 0 ? candles[fullIndex].close : chart.visible[0].open;
  };

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left - pad.left;
    const index = Math.floor(localX / chart.step);
    setHover(clamp(index, 0, chart.visible.length - 1));
  };

  return (
    <div ref={ref} className="chart-frame candle-frame" style={{ height }}>
      {width > 0 && (
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="日K线图"
        >
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={chart.y(tick)} y2={chart.y(tick)} className="grid-line" />
              <text x={width - pad.right + 6} y={chart.y(tick) + 3} className="axis-label">
                {fmt(tick, 2)}
              </text>
            </g>
          ))}

          <line x1={pad.left} x2={width - pad.right} y1={volTop - 10} y2={volTop - 10} className="grid-line" />

          {chart.mas.map((ma) => {
            let d = '';
            ma.values.forEach((value, i) => {
              if (value === null) return;
              d += `${d ? ' L' : 'M'}${chart.x(i).toFixed(2)},${chart.y(value).toFixed(2)}`;
            });
            if (!d) return null;
            return <path key={ma.period} d={d} fill="none" stroke={ma.color} strokeWidth="1" opacity="0.82" />;
          })}

          {chart.visible.map((candle, i) => {
            const up = candle.close >= candle.open;
            const color = up ? 'var(--up)' : 'var(--down)';
            const bodyTop = chart.y(Math.max(candle.open, candle.close));
            const bodyBottom = chart.y(Math.min(candle.open, candle.close));
            const bodyH = Math.max(1, bodyBottom - bodyTop);
            return (
              <g key={candle.date}>
                <line x1={chart.x(i)} x2={chart.x(i)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1" opacity="0.85" />
                <rect
                  x={chart.x(i) - chart.bodyW / 2}
                  y={bodyTop}
                  width={chart.bodyW}
                  height={bodyH}
                  fill={color}
                  opacity={up ? 0.92 : 0.88}
                />
              </g>
            );
          })}

          {chart.visible.map((candle, i) => {
            const barH = Math.max(0.5, (candle.volume / chart.maxVol) * volH);
            const up = candle.close >= candle.open;
            return (
              <rect
                key={`v-${candle.date}`}
                x={chart.x(i) - chart.bodyW / 2}
                y={volTop + volH - barH}
                width={chart.bodyW}
                height={barH}
                fill={up ? 'var(--up)' : 'var(--down)'}
                opacity="0.38"
              />
            );
          })}

          {chart.labelIdx.map((i) => (
            <text key={i} x={chart.x(i)} y={height - 5} className="axis-label" textAnchor={i === 0 ? 'start' : i === chart.visible.length - 1 ? 'end' : 'middle'}>
              {chart.visible[i].date.slice(5)}
            </text>
          ))}

          {hover !== null && hoverCandle && (
            <g>
              <line
                x1={chart.x(hover)}
                x2={chart.x(hover)}
                y1={pad.top}
                y2={volTop + volH}
                stroke="rgba(var(--ink-rgb),.32)"
                strokeDasharray="3 3"
              />
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={chart.y(hoverCandle.close)}
                y2={chart.y(hoverCandle.close)}
                stroke="rgba(var(--ink-rgb),.18)"
              />
              <circle cx={chart.x(hover)} cy={chart.y(hoverCandle.close)} r="2.6" fill="var(--ink-0)" stroke="var(--brass)" />
            </g>
          )}
        </svg>
      )}

      {hover !== null && hoverCandle && (
        <div className="chart-tip" style={{ left: clamp(chart.x(hover), 96, width - 96), top: 112 }}>
          <div className="tip-title">{hoverCandle.date}</div>
          <div className="tip-row">
            <span>开盘 / 收盘</span>
            <b>
              {fmt(hoverCandle.open)} / {fmt(hoverCandle.close)}
            </b>
          </div>
          <div className="tip-row">
            <span>最高 / 最低</span>
            <b>
              {fmt(hoverCandle.high)} / {fmt(hoverCandle.low)}
            </b>
          </div>
          <div className="tip-row">
            <span>涨跌</span>
            <b className={hoverCandle.close >= prevOf(hover) ? 'text-up' : 'text-down'}>
              {pct(((hoverCandle.close - prevOf(hover)) / prevOf(hover)) * 100)}
            </b>
          </div>
          <div className="tip-row">
            <span>成交额</span>
            <b>{fmt(hoverCandle.amount, 1)} 亿</b>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- 筹码分布 ------------------------------- */

function ChipChart({ levels, price }: { levels: Array<{ price: number; weight: number }>; price: number }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const height = 296;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...levels.map((l) => l.weight));
  const padL = 44;
  const padR = 38;
  const top = 10;
  const bottom = 18;

  if (!width) return <div ref={ref} className="chart-frame" style={{ height }} />;

  const n = levels.length;
  const rowH = (height - top - bottom) / n;
  const yOfPrice = (p: number) => {
    const ratio = (p - levels[0].price) / (levels[n - 1].price - levels[0].price);
    return height - bottom - ratio * (height - top - bottom);
  };
  const currentY = yOfPrice(price);
  const avg = weightedAverage(levels);

  return (
    <div ref={ref} className="chart-frame" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="筹码分布">
        {levels.map((level, i) => {
          const barW = (level.weight / max) * (width - padL - padR);
          const profit = level.price <= price;
          const yy = top + (1 - i / (n - 1)) * (height - top - bottom);
          return (
            <g key={level.price} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL} y={yy - rowH * 0.34} width={width - padL - padR} height={rowH * 0.62} fill="transparent" />
              <rect
                x={padL}
                y={yy - rowH * 0.32}
                width={barW}
                height={Math.max(2, rowH * 0.56)}
                fill={profit ? 'var(--up)' : 'var(--down)'}
                opacity={hover === null || hover === i ? 0.55 : 0.22}
                rx={0.5}
              />
              {i % 5 === 0 && (
                <text x={padL - 7} y={yy + 3} className="axis-label" textAnchor="end">
                  {fmt(level.price, 0)}
                </text>
              )}
            </g>
          );
        })}

        <line x1={padL} x2={width - padR} y1={currentY} y2={currentY} stroke="var(--brass)" strokeDasharray="3 3" opacity="0.8" />
        <text x={width - padR + 4} y={currentY + 3} className="axis-label" fill="var(--brass)">
          {fmt(price)}
        </text>
        <line x1={padL} x2={width - padR} y1={yOfPrice(avg)} y2={yOfPrice(avg)} stroke="var(--steel)" strokeDasharray="2 4" opacity="0.45" />
      </svg>

      {hover !== null && (
        <div className="chart-tip" style={{ left: width / 2, top: 108 }}>
          <div className="tip-title">筹码价位 {fmt(levels[hover].price)}</div>
          <div className="tip-row">
            <span>筹码占比</span>
            <b>{levels[hover].weight.toFixed(1)}%</b>
          </div>
          <div className="tip-row">
            <span>状态</span>
            <b className={levels[hover].price <= price ? 'text-up' : 'text-down'}>
              {levels[hover].price <= price ? '获利盘' : '套牢盘'}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- 页面 -------------------------------- */

export function StockPage() {
  const params = useParams();
  const code = (params.code ?? '300308').replace(/\D/g, '') || '300308';
  const { data, error } = useAsync(() => api.stock(code), [code]);
  const { data: list } = useAsync(() => api.stockList(), []);
  const [range, setRange] = useState(120);

  const maLatest = useMemo(() => {
    if (!data) return [];
    const closes = data.candles.map((c) => c.close);
    return MA_CONFIG.map((cfg) => {
      const values = movingAverage(closes, cfg.period);
      return { ...cfg, value: values[values.length - 1] };
    });
  }, [data]);

  const header = (
    <PageHeader
      serial="04"
      kicker="SINGLE NAME / 个股"
      title="个股结构"
      deck="把一只股票放回产业、资金与估值的坐标系里看。单看 K 线是价格，叠加资金与筹码才是结构。"
      asOf={data?.source.asOf}
      source={data?.source}
      note="演示快照 · 前复权日线"
    />
  );

  if (!data) {
    return (
      <div className="page">
        {header}
        <div className="stock-switch">
          {list?.map((item) => (
            <Link key={item.code} to={`/stocks/${item.code}`} className={cx('stock-chip', item.code === code && 'active')}>
              {item.name}
              <span className="num">{item.code}</span>
            </Link>
          ))}
        </div>
        {error ? (
          <div className="error-note">{error.message}，请从上方切换其他标的。</div>
        ) : (
          <div className="grid">
            <Panel idx="01" title="日K结构" className="span-8" bodyClass="center">
              <div className="skeleton" style={{ width: '100%', height: 400 }} />
            </Panel>
            <Panel idx="02" title="资金结构" className="span-4" bodyClass="center">
              <div className="skeleton" style={{ width: '100%', height: 400 }} />
            </Panel>
          </div>
        )}
        <PageFoot />
      </div>
    );
  }

  const { profile, candles, capital, chips, valuation, finance, lhb, peers } = data;
  const tone = toneOf(profile.changePct);
  const profitRatio = Math.min(100, chips.filter((c) => c.price <= profile.price).reduce((a, b) => a + b.weight, 0));
  const avgCost = weightedAverage(chips);
  const superShare = profile.amount > 0 ? (Math.abs(capital.superLarge) / profile.amount) * 100 : 0;
  const maxCap = Math.max(Math.abs(capital.superLarge), Math.abs(capital.large), Math.abs(capital.retail), 1);
  const mainTone = toneOf(capital.main);
  const mainLabel = capital.main > 0 ? '净流入' : capital.main < 0 ? '净流出' : '持平';

  return (
    <div className="page">
      {header}

      <div className="stock-switch">
        <span className="label">自选</span>
        {list?.map((item) => (
          <Link key={item.code} to={`/stocks/${item.code}`} className={cx('stock-chip', item.code === code && 'active')}>
            {item.name}
            <span className="num">{item.code}</span>
          </Link>
        ))}
      </div>

      <section className="panel quote-panel span-12">
        <div className="quote-left">
          <div className="quote-title-row">
            <h2 className="quote-name serif">{profile.name}</h2>
            <span className="quote-code num">
              {profile.code}.{profile.exchange}
            </span>
            <span className="chip chip--ghost">{profile.industry}</span>
          </div>
          <div className="quote-tags">
            {profile.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="quote-price-row">
            <span className={cx('quote-price display', `text-${tone}`)}>{fmt(profile.price)}</span>
            <div className="quote-change">
              <Delta value={profile.changePct} />
              <span className={cx('num', `text-${tone}`)}>{signed(profile.change)}</span>
            </div>
          </div>
        </div>

        <div className="quote-stats">
          {[
            { label: '今开', value: fmt(profile.open) },
            { label: '最高', value: fmt(profile.high) },
            { label: '最低', value: fmt(profile.low) },
            { label: '换手率', value: `${profile.turnoverRate.toFixed(2)}%` },
            { label: '成交额', value: `${fmt(profile.amount, 1)} 亿` },
            { label: '总市值', value: `${fmt(profile.marketCap, 0)} 亿` },
            { label: 'PE (TTM)', value: profile.pe === null ? '亏损' : fmt(profile.pe, 1) },
            { label: 'PB', value: fmt(profile.pb, 2) },
          ].map((item) => (
            <div className="quote-stat" key={item.label}>
              <span className="label">{item.label}</span>
              <span className="num">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid" style={{ marginTop: 'var(--gap)' }}>
        <Panel
          idx="01"
          title="日K结构"
          sub="CANDLESTICK"
          className="span-8 panel--lead"
          bodyClass="tight"
          aside={
            <div className="seg">
              {[60, 120, 160].map((value) => (
                <button key={value} className={range === value ? 'active' : ''} onClick={() => setRange(value)} type="button">
                  {value === 160 ? '全部' : `${value}日`}
                </button>
              ))}
            </div>
          }
          foot={
            <div className="ma-legend">
              {maLatest.map((ma) => (
                <span className="legend-item" key={ma.period} style={{ color: ma.color }}>
                  <span className="swatch" />
                  {ma.label} <b className="num">{ma.value === null ? '—' : fmt(ma.value)}</b>
                </span>
              ))}
            </div>
          }
        >
          <CandleChart candles={candles} visibleCount={range} />
        </Panel>

        <Panel idx="02" title="资金结构" sub="CAPITAL" className="span-4" bodyClass="tight fill">
          <div className="capital-summary">
            <span className="label">今日主力{mainLabel}</span>
            <span className={cx('display', `text-${mainTone}`)}>{signed(capital.main, 1)}</span>
            <span className="capital-unit">亿元 · 超大单占成交额 {superShare.toFixed(1)}%</span>
          </div>
          <div className="capital-split">
            {[
              { name: '超大单', value: capital.superLarge },
              { name: '大单', value: capital.large },
              { name: '散户', value: capital.retail },
            ].map((item) => (
              <div className="capital-row" key={item.name}>
                <span className="capital-name">{item.name}</span>
                <Meter
                  value={Math.abs(item.value)}
                  max={maxCap}
                  tone={toneOf(item.value)}
                  height={3}
                />
                <span className={cx('num', `text-${toneOf(item.value)}`)}>{signed(item.value, 1)}</span>
              </div>
            ))}
          </div>

          <div className="mini-head">
            <span className="label">10 日主力节奏</span>
            <span className="panel-note">亿元</span>
          </div>
          <div className="daily-bars">
            {capital.history.map((item) => {
              const max = Math.max(...capital.history.map((h) => Math.abs(h.value)), 1);
              const h = (Math.abs(item.value) / max) * 32;
              return (
                <div className="daily-bar-col" key={item.label} title={`${item.label}：${signed(item.value, 2)} 亿`}>
                  <span
                    className={cx('daily-bar', item.value >= 0 ? 'up' : 'down')}
                    style={{ height: Math.max(2, h), ...(item.value >= 0 ? { bottom: '50%' } : { top: '50%' }) }}
                  />
                  <span className="daily-bar-label">{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="capital-meta">
            <div>
              <span className="label">北向持股 · 季末</span>
              <span className="num">{fmt(data.northboundHolding, 1)} 亿</span>
            </div>
            <div>
              <span className="label">52 周区间</span>
              <span className="num">
                {fmt(profile.low52)} — {fmt(profile.high52)}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="03"
          title="筹码分布"
          sub="CHIP"
          className="span-4"
          bodyClass="tight"
          foot={
            <>
              <span>获利盘 {profitRatio.toFixed(1)}%</span>
              <span>平均成本 {fmt(avgCost)}</span>
            </>
          }
        >
          <ChipChart levels={chips} price={profile.price} />
        </Panel>

        <Panel
          idx="04"
          title="估值分位"
          sub="VALUATION"
          className="span-4"
          bodyClass="tight"
          foot={
            <span>
              {valuation.percentile === null ? '亏损，PE (TTM) 分位不适用' : '分位口径：近 3 年 PE (TTM) 日频序列'}
            </span>
          }
        >
          <div className="valuation">
            <div className="valuation-head">
              <div>
                <span className="label">PE (TTM)</span>
                <span className="valuation-pe display">{profile.pe === null ? '亏损' : fmt(profile.pe, 1)}</span>
              </div>
              {valuation.percentile === null ? (
                <span className="chip chip--brass">PE 分位不适用</span>
              ) : (
                <span className={cx('chip', valuation.percentile > 70 ? 'chip--up' : 'chip--brass')}>
                  3 年 {valuation.percentile}% 分位
                </span>
              )}
            </div>
            {valuation.history.length > 1 ? (
              <Sparkline data={valuation.history} height={46} tone="brass" />
            ) : (
              <div className="panel-note" style={{ height: 46, display: 'flex', alignItems: 'center' }}>
                亏损期无 PE (TTM) 序列
              </div>
            )}
            {valuation.percentile !== null && (
              <div className="valuation-scale">
                <div className="valuation-scale-head">
                  <span className="label">历史分位</span>
                  <span className="num">{valuation.percentile}%</span>
                </div>
                <Meter value={valuation.percentile} tone={valuation.percentile > 70 ? 'up' : 'brass'} height={4} />
              </div>
            )}
            <div className="valuation-rows">
              {valuation.peersMedian.map((item) => (
                <div className="valuation-row" key={item.label}>
                  <span className="dim">{item.label}</span>
                  <span className="num">{item.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel idx="05" title="财务摘要" sub="FUNDAMENTALS" className="span-4" bodyClass="tight" foot={<span>单位：亿元 · 单季度</span>}>
          <table className="tbl mini-tbl">
            <thead>
              <tr>
                <th>季度</th>
                <th>营收</th>
                <th>同比</th>
                <th>净利</th>
                <th>同比</th>
              </tr>
            </thead>
            <tbody>
              {finance.slice(-6).map((row) => (
                <tr key={row.period}>
                  <td>{row.period}</td>
                  <td>{fmt(row.revenue, 1)}</td>
                  <td className={row.revenueYoy >= 0 ? 'text-up' : 'text-down'}>{pct(row.revenueYoy, 1)}</td>
                  <td>{fmt(row.profit, 1)}</td>
                  <td className={row.profitYoy >= 0 ? 'text-up' : 'text-down'}>{pct(row.profitYoy, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid">
        <Panel idx="06" title="龙虎榜" sub="DRAGON LIST" className="span-4" bodyClass="tight" foot={<span>近 5 个交易日机构与游资席位</span>}>
          <div className="lhb-list">
            {lhb.map((item) => (
              <div className="lhb-row" key={`${item.date}-${item.buyer}`}>
                <span className="num lhb-date">{item.date}</span>
                <span className="lhb-buyer">{item.buyer}</span>
                <span className="num text-up">{fmt(item.amount, 2)} 亿</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel idx="07" title="产业链相关" sub="CORRELATION" className="span-4" bodyClass="tight" foot={<span>20 日收益率相关系数</span>}>
          <div className="peer-list">
            {peers.map((peer) => (
              <div className="peer-row" key={peer.code}>
                <span className="peer-name">
                  {KNOWN.has(peer.code) ? <Link to={`/stocks/${peer.code}`}>{peer.name}</Link> : peer.name}
                  <span className="peer-code">{peer.code}</span>
                </span>
                <Meter value={peer.corr} max={1} tone="steel" height={3} />
                <span className="num peer-corr">{peer.corr.toFixed(2)}</span>
                <span className={cx('num', peer.changePct >= 0 ? 'text-up' : 'text-down')}>{pct(peer.changePct)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel idx="08" title="结构判断" sub="VERDICT" className="span-4" bodyClass="tight">
          <div className="verdict-list">
            <div className="verdict-item">
              <span className="verdict-idx">01</span>
              <div>
                <span className="label">资金</span>
                <p>
                  今日主力{mainLabel}{' '}
                  <b className={`text-${mainTone}`}>{signed(capital.main, 1)} 亿</b>
                  ，超大单占成交额 {superShare.toFixed(1)}%，
                  {capital.main > 0
                    ? '大资金定价特征明显。'
                    : capital.main < 0
                      ? '资金分歧，反弹需要新的增量。'
                      : '多空基本平衡，等待方向选择。'}
                </p>
              </div>
            </div>
            <div className="verdict-item">
              <span className="verdict-idx">02</span>
              <div>
                <span className="label">估值</span>
                <p>
                  {valuation.percentile === null ? (
                    '当前 PE (TTM) 为负，估值分位不适用；估值的锚在收入、订单与现金流。'
                  ) : (
                    <>
                      PE 处于 3 年 <b>{valuation.percentile}% 分位</b>，
                      {profile.pe === null
                        ? '当前仍处亏损阶段，估值的锚在收入与订单。'
                        : `${profile.pe > valuation.peersMedian[0].value ? '高于' : '低于'}行业中位 ${valuation.peersMedian[0].value.toFixed(1)} 倍。`}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="verdict-item">
              <span className="verdict-idx">03</span>
              <div>
                <span className="label">联动</span>
                <p>
                  与 <b>{peers[0].name}</b> 相关性 {peers[0].corr.toFixed(2)}，产业链
                  {peers[0].corr > 0.85 ? '高度' : '中度'}联动，可作为同一主线的观察组合。
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
