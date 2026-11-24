import { useMemo, useState } from 'react';
import type { FlowPeriodKey, FlowPayload, FlowSankeyLink, FlowSankeyNode } from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync, useSize } from '../../lib/hooks';
import { clamp, smoothPath, ticksBetween } from '../../lib/geometry';
import { cx, fmt, pct, signed, toneOf } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { Delta } from '../../components/Delta';
import { Meter } from '../../components/Meter';

/* -------------------------------- 桑基图 -------------------------------- */

const SOURCE_COLOR: Record<string, string> = {
  s1: 'var(--clay)',
  s2: 'var(--brass)',
  s3: 'var(--steel)',
  s4: 'var(--text-3)',
};

function FlowSankey({ nodes, links }: { nodes: FlowSankeyNode[]; links: FlowSankeyLink[] }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const height = 470;
  const [hover, setHover] = useState<string | null>(null);
  const padTop = 16;
  const leftBarX = 62;
  const rightBarX = 12;
  const barW = 7;

  const chart = useMemo(() => {
    if (!width) return null;
    const sources = nodes.filter((n) => n.kind === 'source');
    const targets = nodes.filter((n) => n.kind === 'target').sort((a, b) => b.value - a.value);
    const total = sources.reduce((sum, n) => sum + n.value, 0);
    const availH = height - padTop * 2;
    const srcGap = 22;
    const tgtGap = 12;
    const srcScale = (availH - srcGap * (sources.length - 1)) / total;
    const tgtScale = (availH - tgtGap * (targets.length - 1)) / total;
    const linkScale = Math.min(srcScale, tgtScale) * 0.9;

    let cursor = padTop;
    const src = sources.map((n) => {
      const h = n.value * srcScale;
      const item = { ...n, y: cursor, h };
      cursor += h + srcGap;
      return item;
    });
    cursor = padTop;
    const tgt = targets.map((n) => {
      const h = n.value * tgtScale;
      const item = { ...n, y: cursor, h };
      cursor += h + tgtGap;
      return item;
    });

    const srcOffset: Record<string, number> = {};
    const tgtOffset: Record<string, number> = {};
    src.forEach((n) => {
      srcOffset[n.id] = n.y + (n.h - n.value * linkScale) / 2;
    });
    tgt.forEach((n) => {
      tgtOffset[n.id] = n.y + (n.h - n.value * linkScale) / 2;
    });

    const x1 = leftBarX + barW;
    const x2 = width - rightBarX - barW;
    const mid = (x1 + x2) / 2;
    const rendered = [] as Array<{
      key: string;
      source: string;
      target: string;
      value: number;
      thickness: number;
      y1: number;
      y2: number;
      color: string;
      d: string;
    }>;

    for (const s of src) {
      for (const t of tgt) {
        const link = links.find((l) => l.source === s.id && l.target === t.id);
        if (!link || link.value <= 0) continue;
        const thickness = link.value * linkScale;
        const y1 = srcOffset[s.id] + thickness / 2;
        const y2 = tgtOffset[t.id] + thickness / 2;
        srcOffset[s.id] += thickness;
        tgtOffset[t.id] += thickness;
        rendered.push({
          key: `${s.id}-${t.id}`,
          source: s.id,
          target: t.id,
          value: link.value,
          thickness,
          y1,
          y2,
          color: SOURCE_COLOR[s.id] ?? 'var(--brass)',
          d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
        });
      }
    }
    return { src, tgt, x1, x2, rendered, linkScale };
  }, [width, nodes, links, height]);

  if (!chart) return <div ref={ref} className="chart-frame" style={{ height }} />;

  const isActive = (key: string, source: string, target: string) => {
    if (!hover) return true;
    if (hover.startsWith('link:')) return hover === `link:${key}`;
    return hover === source || hover === target;
  };

  return (
    <div ref={ref} className="chart-frame" style={{ height }}>
      {width > 0 && (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="资金类型流向行业">
          <text x={0} y={10} className="sankey-col-label">
            资金类型
          </text>
          <text x={width - rightBarX} y={10} className="sankey-col-label" textAnchor="end">
            去向行业
          </text>

          {chart.rendered.map((link) => {
            const active = isActive(link.key, link.source, link.target);
            return (
              <path
                key={link.key}
                d={link.d}
                fill="none"
                stroke={link.color}
                strokeWidth={Math.max(1, link.thickness)}
                strokeOpacity={active ? 0.28 : 0.06}
                onMouseEnter={() => setHover(`link:${link.key}`)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-opacity .2s ease', cursor: 'default' }}
              >
                <title>
                  {nodes.find((n) => n.id === link.source)?.name} → {nodes.find((n) => n.id === link.target)?.name}：
                  {fmt(link.value, 1)} 亿
                </title>
              </path>
            );
          })}

          {chart.src.map((node) => (
            <g
              key={node.id}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              opacity={!hover || hover === node.id || hover.startsWith('link:') ? 1 : 0.55}
              style={{ transition: 'opacity .2s ease', cursor: 'default' }}
            >
              <rect
                x={leftBarX}
                y={node.y}
                width={barW}
                height={node.h}
                fill={SOURCE_COLOR[node.id] ?? 'var(--brass)'}
                rx={1}
              />
              <text x={leftBarX - 8} y={node.y + node.h / 2 - 2} className="sankey-name" textAnchor="end">
                {node.name}
              </text>
              <text x={leftBarX - 8} y={node.y + node.h / 2 + 9} className="sankey-val" textAnchor="end">
                {fmt(node.value, 0)}
              </text>
            </g>
          ))}

          {chart.tgt.map((node) => (
            <g
              key={node.id}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              opacity={!hover || hover === node.id || hover.startsWith('link:') ? 1 : 0.55}
              style={{ transition: 'opacity .2s ease', cursor: 'default' }}
            >
              <rect x={chart.x2} y={node.y} width={barW} height={node.h} fill="var(--brass)" opacity="0.8" rx={1} />
              <text x={chart.x2 + barW + 7} y={node.y + node.h / 2 + 1} className="sankey-name">
                {node.name}
              </text>
              <text x={chart.x2 + barW + 7} y={node.y + node.h / 2 + 11} className="sankey-val">
                {fmt(node.value, 0)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------- 多线轨迹 ------------------------------- */

function FlowHistoryChart({ history, height = 430 }: { history: FlowPayload['history']; height?: number }) {
  const { ref, width } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const colorOf = (tone: string) =>
    tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : tone === 'steel' ? 'var(--steel)' : 'var(--brass)';

  const chart = useMemo(() => {
    if (!width) return null;
    const all = history.series.flatMap((s) => s.values).concat(0);
    let min = Math.min(...all);
    let max = Math.max(...all);
    const pad = (max - min) * 0.12 || 1;
    min -= pad;
    max += pad;
    const left = 6;
    const right = 34;
    const top = 12;
    const bottom = 22;
    const h = height - top - bottom;
    const x = (i: number) => left + (i / (history.dates.length - 1)) * (width - left - right);
    const y = (v: number) => top + (1 - (v - min) / (max - min)) * h;
    const zero = y(0);
    const series = history.series.map((s) => ({
      ...s,
      points: s.values.map((v, i) => ({ x: x(i), y: y(v) })),
      color: colorOf(s.tone),
    }));
    return {
      x,
      y,
      zero,
      h,
      top,
      series,
      ticks: ticksBetween(min, max, 4),
      labelIdx: [0, 5, 10, 15, 19].filter((i) => i < history.dates.length),
    };
  }, [width, history, height]);

  if (!chart) return <div ref={ref} className="chart-frame" style={{ height }} />;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left - 6) / (width - 40), 0, 1);
    setHover(Math.round(ratio * (history.dates.length - 1)));
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
          aria-label="行业资金 20 日轨迹"
        >
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={width - 34} y1={chart.y(tick)} y2={chart.y(tick)} className="grid-line" />
              <text x={width - 30} y={chart.y(tick) + 3} className="axis-label">
                {fmt(tick, 0)}
              </text>
            </g>
          ))}
          <line x1={0} x2={width - 34} y1={chart.zero} y2={chart.zero} className="grid-line dashed" stroke="rgba(var(--brass-rgb),.3)" />

          {chart.series.map((s) => (
            <path
              key={s.name}
              d={smoothPath(s.points, 0.14)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.4"
              strokeOpacity={hover === null ? 0.9 : 0.42}
              style={{ transition: 'stroke-opacity .2s' }}
            />
          ))}

          {hover !== null && (
            <g>
              <line
                x1={chart.x(hover)}
                x2={chart.x(hover)}
                y1={chart.top}
                y2={chart.top + chart.h}
                stroke="rgba(var(--ink-rgb),.3)"
                strokeDasharray="3 3"
              />
              {chart.series.map((s) => (
                <circle
                  key={s.name}
                  cx={chart.x(hover)}
                  cy={chart.y(s.values[hover])}
                  r="2.6"
                  fill="var(--ink-0)"
                  stroke={s.color}
                  strokeWidth="1.4"
                />
              ))}
            </g>
          )}

          {chart.labelIdx.map((i) => (
            <text key={i} x={chart.x(i)} y={height - 5} className="axis-label" textAnchor={i === 0 ? 'start' : 'middle'}>
              {history.dates[i].slice(5)}
            </text>
          ))}
        </svg>
      )}

      {hover !== null && (
        <div className="chart-tip" style={{ left: clamp(chart.x(hover), 90, width - 90), top: 112 }}>
          <div className="tip-title">{history.dates[hover]}</div>
          {chart.series.map((s) => (
            <div className="tip-row" key={s.name}>
              <span>
                <span className="tip-dot" style={{ background: s.color }} />
                {s.name}
              </span>
              <b className={toneOf(s.values[hover]) === 'up' ? 'text-up' : 'text-down'}>{signed(s.values[hover], 1)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- 页面 -------------------------------- */

export function FlowPage() {
  const { data } = useAsync(() => api.flow(), []);
  const [periodKey, setPeriodKey] = useState<FlowPeriodKey>('1d');

  if (!data) {
    return (
      <div className="page">
        <PageHeader
          serial="02"
          kicker="CAPITAL ROTATION / 资金"
          title="行业资金流"
          deck="主力资金的迁移方向，比涨跌幅更早暴露结构的拐点。"
        />
        <div className="grid">
          <Panel idx="01" title="资金迁徙" className="span-8" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 360 }} />
          </Panel>
          <Panel idx="02" title="资金水位" className="span-4" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 360 }} />
          </Panel>
        </div>
      </div>
    );
  }

  const period = data.periods.find((p) => p.key === periodKey) ?? data.periods[0];
  const rankRows = period.industries;
  const inflow = rankRows.filter((r) => r.mainNet > 0).slice(0, 8);
  const outflow = [...rankRows].filter((r) => r.mainNet < 0).sort((a, b) => a.mainNet - b.mainNet).slice(0, 8);
  const maxAbs = Math.max(...period.industries.map((r) => Math.abs(r.mainNet)), 1);
  const totalCapital = Math.abs(data.capital.superLarge) + Math.abs(data.capital.large) + Math.abs(data.capital.medium) + Math.abs(data.capital.small);

  return (
    <div className="page">
      <PageHeader
        serial="02"
        kicker="CAPITAL ROTATION / 资金"
        title="行业资金流"
        deck="主力资金的迁移方向，比涨跌幅更早暴露结构的拐点。看资金的「来路」与「去向」，而不是只看净流入排名。"
        asOf={data.source.asOf}
        source={data.source}
        note="主力 = 超大单 + 大单 · 单位：亿元"
      />

      <div className="stat-band">
        <div className="stat-band-item">
          <span className="label">今日主力净流入</span>
          <span className={cx('stat-band-value display', toneOf(period.totalMainNet) === 'up' ? 'text-up' : 'text-down')}>
            {signed(period.totalMainNet, 1)}
          </span>
          <span className="stat-band-note">亿元 · {period.label}</span>
        </div>
        <div className="stat-band-item">
          <span className="label">超大单</span>
          <span className={cx('stat-band-value num', toneOf(data.capital.superLarge) === 'up' ? 'text-up' : 'text-down')}>
            {signed(data.capital.superLarge, 1)}
          </span>
          <span className="stat-band-note">亿元 · 机构主战场</span>
        </div>
        <div className="stat-band-item">
          <span className="label">大单</span>
          <span className={cx('stat-band-value num', toneOf(data.capital.large) === 'up' ? 'text-up' : 'text-down')}>
            {signed(data.capital.large, 1)}
          </span>
          <span className="stat-band-note">亿元 · 游资与中型机构</span>
        </div>
        <div className="stat-band-item">
          <span className="label">北向成交额</span>
          <span className="stat-band-value num">{fmt(data.northboundTurnover, 0)}</span>
          <span className="stat-band-note">亿元 · 互联互通</span>
        </div>
        <div className="stat-band-item">
          <span className="label">两融余额</span>
          <span className="stat-band-value num">{fmt(data.marginBalance / 10000, 2)}</span>
          <span className="stat-band-note">万亿 · 杠杆水位</span>
        </div>
      </div>

      <div className="grid">
        <Panel
          idx="01"
          title="资金迁徙"
          sub="CAPITAL FLOW"
          className="span-8 panel--lead"
          bodyClass="tight"
          aside={<span className="panel-note">买入资金结构 · 亿元</span>}
          foot={
            <>
              <span>颜色对应资金类型 · 线宽对应流入规模</span>
              <span>电子 + 通信承接 {fmt((data.sankey.nodes.filter((n) => n.kind === 'target' && ['电子', '通信'].includes(n.name)).reduce((a, b) => a + b.value, 0)), 0)} 亿</span>
            </>
          }
        >
          <FlowSankey nodes={data.sankey.nodes} links={data.sankey.links} />
        </Panel>

        <Panel idx="02" title="资金水位" sub="LIQUIDITY" className="span-4" bodyClass="tight fill">
          <div className="capital-hero">
            <span className="label">主力净流入 · 今日</span>
            <span className={cx('capital-value display', toneOf(period.totalMainNet) === 'up' ? 'text-up' : 'text-down')}>
              {signed(period.totalMainNet, 1)}
            </span>
            <span className="capital-unit">亿元</span>
          </div>
          <div className="capital-split">
            {[
              { name: '超大单', value: data.capital.superLarge },
              { name: '大单', value: data.capital.large },
              { name: '中单', value: data.capital.medium },
              { name: '小单', value: data.capital.small },
            ].map((item) => (
              <div className="capital-row" key={item.name}>
                <span className="capital-name">{item.name}</span>
                <Meter
                  value={Math.abs(item.value)}
                  max={totalCapital / 2}
                  tone={item.value >= 0 ? 'up' : 'down'}
                  height={3}
                />
                <span className={cx('num', item.value >= 0 ? 'text-up' : 'text-down')}>{signed(item.value, 1)}</span>
              </div>
            ))}
          </div>
          <div className="capital-mix">
            <div className="capital-mix-head">
              <span className="label">资金结构占比</span>
              <span className="panel-note">按绝对额</span>
            </div>
            <div className="capital-mix-bar" role="img" aria-label="四类资金绝对额占比">
              {[
                { name: '超大单', value: data.capital.superLarge, tone: 'up' },
                { name: '大单', value: data.capital.large, tone: 'up' },
                { name: '中单', value: data.capital.medium, tone: 'down' },
                { name: '小单', value: data.capital.small, tone: 'down' },
              ].map((item) => (
                <span
                  key={item.name}
                  className={item.tone}
                  style={{ width: `${(Math.abs(item.value) / totalCapital) * 100}%` }}
                />
              ))}
            </div>
            <div className="capital-mix-legend">
              {[
                { name: '超大单', value: data.capital.superLarge },
                { name: '大单', value: data.capital.large },
                { name: '中单', value: data.capital.medium },
                { name: '小单', value: data.capital.small },
              ].map((item) => (
                <span key={item.name}>
                  {item.name}
                  <b className="num">{((Math.abs(item.value) / totalCapital) * 100).toFixed(0)}%</b>
                </span>
              ))}
            </div>
          </div>

          <div className="capital-foot">
            <div>
              <span className="label">5 日累计</span>
              <span className="num">{signed(data.periods[1].totalMainNet, 0)} 亿</span>
            </div>
            <div>
              <span className="label">净流入行业</span>
              <span className="num">
                {period.upCount} / {period.upCount + period.downCount}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="03"
          title="行业净流入排行"
          sub="RANKING"
          className="span-7"
          bodyClass="tight"
          aside={
            <div className="tabs">
              {data.periods.map((p) => (
                <button
                  key={p.key}
                  className={cx('tab', p.key === periodKey && 'active')}
                  onClick={() => setPeriodKey(p.key)}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          }
          foot={
            <>
              <span>按主力净流入排序 · {period.label}</span>
              <span>
                净流入 {period.upCount} 个 / 净流出 {period.downCount} 个
              </span>
            </>
          }
        >
          <div className="rank-group">
            <div className="rank-group-head">
              <span className="text-up">净流入</span>
              <span className="panel-note">亿元</span>
            </div>
            {inflow.map((row) => (
              <div className="rank-row" key={row.name}>
                <span className="rank-name">{row.name}</span>
                <div className="rank-track">
                  <span className="rank-zero" />
                  <span
                    className="rank-bar up"
                    style={{ left: '50%', width: `${(Math.abs(row.mainNet) / maxAbs) * 50}%` }}
                  />
                </div>
                <span className="rank-val num text-up">{signed(row.mainNet, 1)}</span>
              </div>
            ))}
          </div>
          <div className="rank-group">
            <div className="rank-group-head">
              <span className="text-down">净流出</span>
              <span className="panel-note">亿元</span>
            </div>
            {outflow.map((row) => (
              <div className="rank-row" key={row.name}>
                <span className="rank-name">{row.name}</span>
                <div className="rank-track">
                  <span className="rank-zero" />
                  <span
                    className="rank-bar down"
                    style={{ right: '50%', width: `${(Math.abs(row.mainNet) / maxAbs) * 50}%` }}
                  />
                </div>
                <span className="rank-val num text-down">{signed(row.mainNet, 1)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          idx="04"
          title="20 日资金轨迹"
          sub="20D TRACK"
          className="span-5"
          bodyClass="tight"
          aside={
            <div className="legend">
              {data.history.series.map((s) => (
                <span className="legend-item" key={s.name} style={{ color: s.tone === 'up' ? 'var(--up)' : s.tone === 'down' ? 'var(--down)' : s.tone === 'steel' ? 'var(--steel)' : 'var(--brass)' }}>
                  <span className="swatch" />
                  {s.name}
                </span>
              ))}
            </div>
          }
          foot={
            <>
              <span>每日主力净流入 · 亿元</span>
              <span>虚线为 0 轴</span>
            </>
          }
        >
          <FlowHistoryChart history={data.history} />
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="05"
          title="行业资金明细"
          sub="DETAIL"
          className="span-12"
          bodyClass="flush"
          aside={<span className="panel-note">{period.label} · 共 {period.industries.length} 个行业</span>}
        >
          <div className="tbl-wrap" style={{ maxHeight: 430 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>行业</th>
                  <th>涨跌幅</th>
                  <th>主力净流入</th>
                  <th>超大单</th>
                  <th>大单</th>
                  <th>区间累计</th>
                  <th>占成交额</th>
                  <th>领涨股</th>
                </tr>
              </thead>
              <tbody>
                {rankRows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td className={row.changePct >= 0 ? 'text-up' : 'text-down'}>{pct(row.changePct)}</td>
                    <td className={row.mainNet >= 0 ? 'text-up' : 'text-down'}>{signed(row.mainNet, 1)}</td>
                    <td className={row.superNet >= 0 ? 'text-up' : 'text-down'}>{signed(row.superNet, 1)}</td>
                    <td className={row.largeNet >= 0 ? 'text-up' : 'text-down'}>{signed(row.largeNet, 1)}</td>
                    <td className={row.mainNetRange >= 0 ? 'text-up' : 'text-down'}>{signed(row.mainNetRange, 1)}</td>
                    <td>{row.ratio.toFixed(2)}%</td>
                    <td>
                      <span className="name-cell">
                        <span>{row.leader}</span>
                        <Delta value={row.leaderPct} className="sub-cell" arrow={false} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
