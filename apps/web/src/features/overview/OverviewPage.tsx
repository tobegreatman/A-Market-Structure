import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  DistributionBucket,
  IndexQuote,
  IntradayPoint,
  SectorSnapshot,
  SentimentReading,
  SessionState,
} from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync, useSize } from '../../lib/hooks';
import {
  areaPath,
  clamp,
  smoothPath,
  squarify,
  ticksBetween,
} from '../../lib/geometry';
import { cx, compactMoney, fmt, pct, percentOf, signed, toneOf } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { Sparkline } from '../../components/Sparkline';
import { Delta } from '../../components/Delta';
import { Meter } from '../../components/Meter';
import { ArrowUpRight } from '../../components/Icons';

const SESSION_NOTE: Record<SessionState, string> = {
  pre: '集合竞价',
  open: '盘中',
  break: '午间休市',
  closed: '15:00 收盘',
};

/* --------------------------------- 指数卡 -------------------------------- */

function IndexCard({ quote, active }: { quote: IndexQuote; active?: boolean }) {
  const tone = toneOf(quote.changePct);
  return (
    <div className={cx('index-card', active && 'active')}>
      <div className="index-top">
        <span className="index-name">{quote.name}</span>
        <span className="index-code">{quote.code}</span>
      </div>
      <div className="index-value display">{fmt(quote.value)}</div>
      <div className="index-delta-row">
        <Delta value={quote.changePct} />
        <span className={cx('index-change num', `text-${tone}`)}>{signed(quote.change)}</span>
      </div>
      <Sparkline data={quote.spark} height={38} tone={tone === 'flat' ? 'flat' : tone} />
      <div className="index-foot">
        <span>成交 {fmt(quote.amount, 1)} 亿</span>
        <span>昨收 {fmt(quote.prevClose)}</span>
      </div>
    </div>
  );
}

/* -------------------------------- 分时图 -------------------------------- */

function IntradayChart({ points, prevClose }: { points: IntradayPoint[]; prevClose: number }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const uid = useId().replace(/:/g, '');
  const height = 272;
  const padL = 4;
  const padR = 52;
  const priceTop = 10;
  const priceH = 196;
  const volTop = 224;
  const volH = 32;

  const chart = useMemo(() => {
    if (!width || points.length < 2) return null;
    const values = points.flatMap((p) => [p.price, p.avg]).concat(prevClose);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.12 || 1;
    const yMin = min - pad;
    const yMax = max + pad;
    const innerW = width - padL - padR;
    const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
    const y = (v: number) => priceTop + (1 - (v - yMin) / (yMax - yMin)) * priceH;
    const maxVol = Math.max(...points.map((p) => p.volume));
    const pts = points.map((p, i) => ({ x: x(i), y: y(p.price) }));
    const avgPts = points.map((p, i) => ({ x: x(i), y: y(p.avg) }));
    return {
      yMin,
      yMax,
      x,
      y,
      innerW,
      pts,
      avgPts,
      priceLine: smoothPath(pts, 0.12),
      avgLine: smoothPath(avgPts, 0.12),
      area: areaPath(pts, priceTop + priceH),
      baselineY: y(prevClose),
      ticks: ticksBetween(yMin, yMax, 4),
      maxVol,
      timeTicks: [0, 60, 120, 180, 240].filter((i) => i < points.length),
    };
  }, [width, points, prevClose]);

  if (!chart) return <div ref={ref} className="chart-frame" style={{ height }} />;

  const latest = points[points.length - 1];
  const lastPoint = chart.pts[chart.pts.length - 1];
  const hoverPoint = hover ? points[hover.i] : null;
  const tipX = hover ? clamp(hover.x, 76, width - 76) : 0;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const ratio = clamp((localX - padL) / (width - padL - padR), 0, 1);
    const i = Math.round(ratio * (points.length - 1));
    setHover({ i, x: chart.x(i), y: chart.y(points[i].price) });
  };

  return (
    <div ref={ref} className="chart-frame" style={{ height }}>
      {width > 0 && (
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="上证指数分时图"
        >
          <defs>
            <linearGradient id={`intraday-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--up)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--up)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {chart.ticks.map((tick) => {
            const yy = chart.y(tick);
            return (
              <g key={tick}>
                <line x1={padL} x2={width - padR} y1={yy} y2={yy} className="grid-line" />
                <text x={width - padR + 6} y={yy + 3} className="axis-label">
                  {fmt(tick, 0)}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            x2={width - padR}
            y1={chart.baselineY}
            y2={chart.baselineY}
            className="grid-line dashed"
            stroke="rgba(var(--brass-rgb),.34)"
          />
          <text x={padL + 4} y={chart.baselineY - 5} className="axis-label" fill="var(--brass)">
            昨收 {fmt(prevClose, 2)}
          </text>

          <path d={chart.area} fill={`url(#intraday-${uid})`} />
          <path d={chart.avgLine} fill="none" stroke="var(--brass)" strokeWidth="1" strokeDasharray="3 4" opacity="0.75" />
          <path d={chart.priceLine} fill="none" stroke="var(--up)" strokeWidth="1.5" strokeLinecap="round" />

          {points.map((p, i) => {
            const barH = Math.max(0.5, (p.volume / chart.maxVol) * volH);
            const up = i === 0 ? p.price >= prevClose : p.price >= points[i - 1].price;
            return (
              <rect
                key={p.t}
                x={chart.x(i)}
                y={volTop + volH - barH}
                width={Math.max(1, chart.innerW / points.length - 0.4)}
                height={barH}
                fill={up ? 'var(--up)' : 'var(--down)'}
                opacity="0.42"
              />
            );
          })}

          {chart.timeTicks.map((i) => (
            <text key={i} x={chart.x(i)} y={height - 4} className="axis-label" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {points[i].t}
            </text>
          ))}

          <circle cx={lastPoint.x} cy={lastPoint.y} r="2.6" fill="var(--up)" />
          <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill="none" stroke="var(--up)" opacity="0.28" />

          {hover && hoverPoint && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={priceTop} y2={volTop + volH} stroke="rgba(var(--ink-rgb),.35)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={padL} x2={width - padR} y1={hover.y} y2={hover.y} stroke="rgba(var(--ink-rgb),.18)" strokeWidth="1" />
              <circle cx={hover.x} cy={hover.y} r="3.2" fill="var(--ink-0)" stroke="var(--brass)" strokeWidth="1.2" />
            </g>
          )}
        </svg>
      )}

      {hover && hoverPoint && (
        <div className="chart-tip" style={{ left: tipX, top: Math.max(hover.y, 112) }}>
          <div className="tip-title">{hoverPoint.t}</div>
          <div className="tip-row">
            <span>价格</span>
            <b>{fmt(hoverPoint.price)}</b>
          </div>
          <div className="tip-row">
            <span>均价</span>
            <b>{fmt(hoverPoint.avg)}</b>
          </div>
          <div className="tip-row">
            <span>涨跌</span>
            <b className={hoverPoint.price >= prevClose ? 'text-up' : 'text-down'}>
              {pct(((hoverPoint.price - prevClose) / prevClose) * 100)}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- 涨跌分布 ------------------------------- */

function DistributionChart({ data }: { data: DistributionBucket[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...data.map((item) => item.count));
  return (
    <div className="distribution">
      <div className="dist-bars">
        {data.map((item, index) => {
          const negative = index < 6;
          const positive = index > 6;
          const tone = index === 6 ? 'flat' : positive ? 'up' : 'down';
          return (
            <div className="dist-col" key={item.label} title={`${item.label}：${item.count} 只`}>
              <span className="dist-count num">{item.count > max * 0.4 ? item.count : ''}</span>
              <div className="dist-track">
                <div
                  className={cx('dist-bar', tone)}
                  style={{ height: `${Math.max(2, (item.count / max) * 100)}%` }}
                />
              </div>
              <span className={cx('dist-label', negative && 'dim')}>
                {[0, 2, 4, 6, 8, 10, 12].includes(index) ? item.label.replace('%', '') : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div className="dist-foot">
        <span>
          上涨 <b className="text-up">{data.slice(7).reduce((a, b) => a + b.count, 0)}</b>
        </span>
        <span>
          平盘 <b>{data[6]?.count}</b>
        </span>
        <span>
          下跌 <b className="text-down">{data.slice(0, 6).reduce((a, b) => a + b.count, 0)}</b>
        </span>
        <span className="dim">合计 {fmt(total, 0)} 只</span>
      </div>
    </div>
  );
}

/* -------------------------------- 情绪结构 ------------------------------- */

function percentileTone(percentile: number): 'up' | 'down' | 'brass' {
  if (percentile >= 60) return 'up';
  if (percentile <= 40) return 'down';
  return 'brass';
}

function SentimentBreakdown({ reading }: { reading: SentimentReading }) {
  return (
    <>
      <div className="sent-grid">
        {reading.factors.map((factor) => (
          <div
            className="sent-factor"
            key={factor.key}
            title={`${factor.formula} · 252 日 P25–P75：${fmt(factor.historyP25, factor.digits)}–${fmt(
              factor.historyP75,
              factor.digits,
            )}${factor.unit} · 中位 ${fmt(factor.historyMedian, factor.digits)}${factor.unit}`}
          >
            <div className="sent-factor-head">
              <span className="label">{factor.label}</span>
              <span className="panel-note">{Math.round(factor.weight * 100)}%</span>
            </div>
            <div className="sent-factor-value">
              <span className="num">
                {fmt(factor.value, factor.digits)}
                <span className="sent-unit">{factor.unit}</span>
              </span>
              <span
                className={cx(
                  'sent-rank',
                  factor.percentile >= 60 ? 'text-up' : factor.percentile <= 40 ? 'text-down' : 'dim',
                )}
              >
                {factor.percentile} 分位
              </span>
            </div>
            <Meter value={factor.percentile} tone={percentileTone(factor.percentile)} height={3} />
            <div className="sent-factor-foot">
              <span className="dim">
                中位 {fmt(factor.historyMedian, factor.digits)}
                {factor.unit}
              </span>
              <span className="dim">贡献 {factor.contribution}</span>
            </div>
            <span className="sent-formula">{factor.formula}</span>
          </div>
        ))}
      </div>
      <p className="sent-caveat">{reading.caveat}</p>
    </>
  );
}

/* -------------------------------- 行业热力 ------------------------------- */

function SectorHeatmap({ sectors }: { sectors: SectorSnapshot[] }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ sector: SectorSnapshot; x: number; y: number } | null>(null);
  const height = 408;

  const cells = useMemo(() => {
    if (!width) return [];
    const items = [...sectors]
      .sort((a, b) => b.turnover - a.turnover)
      .map((s) => ({ ...s, value: s.turnover }));
    return squarify(items, { x: 0, y: 0, w: width, h: height });
  }, [sectors, width]);

  const color = (change: number) => {
    const strength = Math.min(Math.abs(change) / 3, 1);
    const rgb = change >= 0 ? 'var(--heat-up-rgb)' : 'var(--heat-down-rgb)';
    return `rgba(${rgb}, calc(var(--heat-base) + ${strength.toFixed(3)} * var(--heat-gain)))`;
  };

  return (
    <div ref={ref} className="heat-wrap" style={{ height }}>
      {width > 0 &&
        cells.map((cell) => {
          const showName = cell.w > 62 && cell.h > 34;
          const showPct = cell.h > 56 && cell.w > 74;
          const showLeader = cell.h > 84 && cell.w > 104;
          return (
            <div
              key={cell.name}
              className="heat-cell"
              style={{
                left: cell.x + 1,
                top: cell.y + 1,
                width: cell.w - 2,
                height: cell.h - 2,
                background: color(cell.changePct),
                borderColor: hover?.sector.name === cell.name ? 'var(--brass)' : 'var(--heat-gap)',
              }}
              onMouseMove={(event) => {
                const rect = ref.current?.getBoundingClientRect();
                if (!rect) return;
                setHover({ sector: cell, x: event.clientX - rect.left, y: event.clientY - rect.top });
              }}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label={`${cell.name} ${pct(cell.changePct)}，主力净流入 ${signed(cell.netInflow, 1)} 亿`}
            >
              {showName && <span className="heat-name">{cell.name}</span>}
              {showPct && <span className="heat-pct num">{pct(cell.changePct)}</span>}
              {showLeader && <span className="heat-leader">{cell.leader}</span>}
            </div>
          );
        })}
      {hover && (
        <div className="chart-tip" style={{ left: clamp(hover.x, 90, width - 90), top: Math.max(hover.y, 112) }}>
          <div className="tip-title">
            {hover.sector.name} <span className="num">{pct(hover.sector.changePct)}</span>
          </div>
          <div className="tip-row">
            <span>主力净流入</span>
            <b className={hover.sector.netInflow >= 0 ? 'text-up' : 'text-down'}>
              {signed(hover.sector.netInflow, 1)} 亿
            </b>
          </div>
          <div className="tip-row">
            <span>成交额</span>
            <b>{fmt(hover.sector.turnover, 0)} 亿</b>
          </div>
          <div className="tip-row">
            <span>领涨</span>
            <b>
              {hover.sector.leader} {pct(hover.sector.leaderPct)}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- 页面 -------------------------------- */

export function OverviewPage() {
  const { data, loading } = useAsync(() => api.overview(), []);

  if (!data) {
    return (
      <div className="page">
        <PageHeader
          serial="01"
          kicker="MARKET TAPE / 盘面"
          title="盘面结构"
          deck="指数、宽度、资金与梯队——先用四条线确认今天是不是一个「可以做多」的日子。"
        />
        <div className="grid">
          <Panel title="指数结构" idx="01" className="span-8" bodyClass="center" aside={loading ? '载入中' : ''}>
            <div className="skeleton" style={{ width: '100%', height: 238 }} />
          </Panel>
          <Panel title="市场宽度" idx="02" className="span-4" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 238 }} />
          </Panel>
        </div>
      </div>
    );
  }

  const { breadth, sectors, indices } = data;
  const upRatio = percentOf(breadth.up, breadth.up + breadth.down + breadth.flat);
  const turnoverChange = ((breadth.turnover - breadth.prevTurnover) / breadth.prevTurnover) * 100;
  const sealRate = (breadth.limitUp / (breadth.limitUp + breadth.broken)) * 100;
  const hs300 = indices.find((i) => i.code === '000300') ?? indices[0];
  const emotionClass = breadth.temperature >= 80 ? 'chip--up' : breadth.temperature < 40 ? 'chip--down' : 'chip--brass';
  const inflowTop = [...sectors].sort((a, b) => b.netInflow - a.netInflow).slice(0, 4);
  const outflow = [...sectors].sort((a, b) => a.netInflow - b.netInflow).slice(0, 3);
  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.netInflow)));
  const intradayPoints = data.intraday.points;
  const latest = intradayPoints[intradayPoints.length - 1];
  const latestTone = toneOf(latest.price - data.intraday.prevClose);
  const amplitude = ((Math.max(...intradayPoints.map((p) => p.price)) - Math.min(...intradayPoints.map((p) => p.price))) / data.intraday.prevClose) * 100;
  const insightTargets = ['/flow', '/mainlines', '/flow', '/mainlines'];

  return (
    <div className="page">
      <PageHeader
        serial="01"
        kicker="MARKET TAPE / 盘面"
        title="盘面结构"
        deck="指数、宽度、资金与梯队——先用四条线确认今天是不是一个「可以做多」的日子。结构比涨跌更重要。"
        asOf={data.asOf}
        source={data.source}
        note="A股惯例：红涨绿跌 · 数据为演示快照"
      />

      <div className="grid">
        <Panel
          idx="01"
          title="指数结构"
          sub="INDEX"
          className="span-8 panel--lead"
          bodyClass="flush"
          aside={<span className="panel-note">{SESSION_NOTE[data.session]}</span>}
          foot={
            <>
              <span>
                {hs300.name} {fmt(hs300.value)} · {pct(hs300.changePct)}
              </span>
              <span>
                上涨占比 <b className="text-up">{upRatio}%</b> · 成交较昨日{' '}
                <b className={turnoverChange >= 0 ? 'text-up' : 'text-down'}>{pct(turnoverChange, 1)}</b>
              </span>
            </>
          }
        >
          <div className="index-grid">
            {indices.slice(0, 4).map((quote, index) => (
              <IndexCard key={quote.code} quote={quote} active={index === 0} />
            ))}
          </div>
        </Panel>

        <Panel idx="02" title="市场宽度" sub="BREADTH" className="span-4" bodyClass="tight">
          <div className="breadth-hero">
            <div>
              <span className="label">涨跌比</span>
              <div className="breadth-ratio display">{(breadth.up / breadth.down).toFixed(2)}</div>
            </div>
            <div className="breadth-hero-right">
              <span className={cx('chip', emotionClass)}>情绪{breadth.emotion}</span>
              <span className="panel-note">{upRatio >= 50 ? '上涨家数占优' : '下跌家数占优'}</span>
            </div>
          </div>

          <div className="breadth-bar" role="img" aria-label={`上涨 ${breadth.up} 家，平盘 ${breadth.flat} 家，下跌 ${breadth.down} 家`}>
            <span className="up" style={{ width: `${percentOf(breadth.up, breadth.up + breadth.down + breadth.flat)}%` }} />
            <span className="flat" style={{ width: `${percentOf(breadth.flat, breadth.up + breadth.down + breadth.flat)}%` }} />
            <span className="down" style={{ width: `${percentOf(breadth.down, breadth.up + breadth.down + breadth.flat)}%` }} />
          </div>
          <div className="breadth-bar-labels">
            <span className="text-up">涨 {breadth.up}</span>
            <span className="dim">平 {breadth.flat}</span>
            <span className="text-down">跌 {breadth.down}</span>
          </div>

          <div className="breadth-stats">
            <div>
              <span className="label">涨停</span>
              <span className="num text-up">{breadth.limitUp}</span>
            </div>
            <div>
              <span className="label">跌停</span>
              <span className="num text-down">{breadth.limitDown}</span>
            </div>
            <div>
              <span className="label">炸板</span>
              <span className="num">{breadth.broken}</span>
            </div>
            <div>
              <span className="label">封板率</span>
              <span className="num">{sealRate.toFixed(1)}%</span>
            </div>
          </div>

          <div className="thermo">
            <div className="thermo-head">
              <span className="label">情绪温度 · 6 分项</span>
              <span className="num">{breadth.temperature}</span>
            </div>
            <div className="thermo-track">
              <span className="thermo-marker" style={{ left: `${breadth.temperature}%` }} />
            </div>
            <div className="thermo-labels">
              <span>冰点</span>
              <span>中性</span>
              <span>过热</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="03"
          title="上证指数 · 分时结构"
          sub="INTRADAY"
          className="span-8"
          bodyClass="tight"
          aside={
            <div className="legend">
              <span className="legend-item text-up">
                <span className="swatch" />
                价格
              </span>
              <span className="legend-item text-brass">
                <span className="swatch" style={{ background: 'transparent', borderTop: '1px dashed var(--brass)' }} />
                均价
              </span>
              <span className="legend-item dim">成交额 {compactMoney(breadth.turnover)}</span>
            </div>
          }
          foot={
            <>
              <span>振幅 {amplitude.toFixed(2)}% · 均价 {fmt(latest.avg)}</span>
              <span>09:30 — 15:00 · {intradayPoints.length} 点 · 1 分钟采样</span>
            </>
          }
        >
          <div className="chart-meta">
            <div>
              <span className="label">最新</span>
              <span className={cx('num', `text-${latestTone}`)}>{fmt(latest.price)}</span>
            </div>
            <div>
              <span className="label">均价</span>
              <span className="num">{fmt(latest.avg)}</span>
            </div>
            <div>
              <span className="label">昨收</span>
              <span className="num">{fmt(data.intraday.prevClose)}</span>
            </div>
            <div>
              <span className="label">成交</span>
              <span className="num">{fmt(breadth.turnover / 10000, 2)} 万亿</span>
            </div>
          </div>
          <IntradayChart points={intradayPoints} prevClose={data.intraday.prevClose} />
        </Panel>

        <Panel
          idx="04"
          title="涨跌分布"
          sub="DISTRIBUTION"
          className="span-4"
          bodyClass="tight"
          aside={<span className="panel-note">全市场 5,225 只</span>}
        >
          <DistributionChart data={data.distribution} />
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="05"
          title="情绪结构"
          sub="SENTIMENT · 6 FACTORS"
          className="span-12"
          bodyClass="tight"
          aside={
            <div className="legend">
              <span className="legend-item text-brass">
                温度 {breadth.temperature} · {breadth.emotion}
              </span>
              <span className="legend-item dim">分位模型 {breadth.sentiment.version}</span>
            </div>
          }
          foot={
            <>
              <span>
                温度 = Σ（分位 × 权重）= {breadth.sentiment.score.toFixed(1)} → {breadth.temperature}
              </span>
              <span>
                分位窗口 {breadth.sentiment.window} 个交易日 · 不含今日
                {data.source.mode === 'demo' ? ' · 演示样本' : ''}
              </span>
            </>
          }
        >
          <SentimentBreakdown reading={breadth.sentiment} />
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="06"
          title="行业热力"
          sub="SECTOR HEATMAP"
          className="span-8"
          bodyClass="flush"
          aside={
            <div className="legend">
              <span className="legend-item text-down">
                <span className="swatch dot" style={{ width: 7, height: 7 }} />
                -3% 以下
              </span>
              <span className="legend-item text-up">
                <span className="swatch dot" style={{ width: 7, height: 7 }} />
                +3% 以上
              </span>
            </div>
          }
          foot={
            <>
              <span>面积 = 成交额 · 颜色 = 当日涨跌幅</span>
              <span>申万一级行业 · 31 个</span>
            </>
          }
        >
          <SectorHeatmap sectors={sectors} />
        </Panel>

        <Panel idx="07" title="资金与梯队" sub="CAPITAL / LADDER" className="span-4" bodyClass="tight">
          <div className="mini-head">
            <span className="label">主力净流入</span>
            <span className="panel-note">亿元</span>
          </div>
          <div className="flow-mini">
            {[...inflowTop, ...outflow].map((sector, index) => (
              <div className={cx('flow-mini-row', index === 3 && 'divider')} key={sector.name}>
                <span className="flow-mini-name">{sector.name}</span>
                <span className="flow-mini-bar">
                  <Meter
                    value={Math.abs(sector.netInflow)}
                    max={maxFlow}
                    tone={sector.netInflow >= 0 ? 'up' : 'down'}
                    height={3}
                  />
                </span>
                <span className={cx('num', sector.netInflow >= 0 ? 'text-up' : 'text-down')}>
                  {signed(sector.netInflow, 1)}
                </span>
              </div>
            ))}
          </div>

          <div className="mini-head ladder-head">
            <span className="label">连板梯队</span>
            <span className="panel-note">涨停 {breadth.limitUp} 家</span>
          </div>
          <div className="ladder">
            {data.ladders.map((group) => (
              <div className="ladder-row" key={group.level}>
                <span className={cx('ladder-level', group.level === '5板' && 'top')}>{group.level}</span>
                <div className="ladder-stocks">
                  {group.stocks.slice(0, 5).map((stock) => (
                    <span className="chip chip--ghost" key={stock}>
                      {stock}
                    </span>
                  ))}
                  {group.stocks.length > 5 && <span className="ladder-more">+{group.stocks.length - 5}</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel idx="08" title="结构速读" sub="STRUCTURE NOTES" className="span-12" bodyClass="flush">
          <div className="insight-grid">
            {data.insights.map((insight, index) => (
              <Link className="insight" to={insightTargets[index] ?? '/'} key={insight}>
                <span className="insight-idx">0{index + 1}</span>
                <p>{insight}</p>
                <ArrowUpRight size={13} className="insight-arrow" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
