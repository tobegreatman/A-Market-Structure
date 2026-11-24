import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MarketTheme, ThemeStage } from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync, useSize } from '../../lib/hooks';
import { clamp } from '../../lib/geometry';
import { cx, pct, signed, stageTone } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { Sparkline } from '../../components/Sparkline';
import { Meter } from '../../components/Meter';
import { ArrowUpRight } from '../../components/Icons';

const STAGES: ThemeStage[] = ['萌芽', '发酵', '加速', '分歧', '退潮'];
const LINKABLE = new Set(['300308', '300750', '688256', '601899', '600036', '600519']);

const STAGE_COLOR: Record<ThemeStage, string> = {
  萌芽: 'var(--steel)',
  发酵: 'var(--brass)',
  加速: 'var(--up)',
  分歧: 'var(--clay)',
  退潮: 'var(--down)',
};

function shortName(theme: MarketTheme) {
  return theme.name.split(' · ')[0];
}

/** 估算 SVG 文本宽度：中文按字号，ASCII 按 0.58 字号 */
function estimateTextWidth(text: string, size = 10.5): number {
  let width = 0;
  for (const char of text) width += /[\u4e00-\u9fa5]/.test(char) ? size : size * 0.58;
  return width;
}

interface LabelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function overlaps(a: LabelBox, b: LabelBox, pad = 2): boolean {
  return !(a.x2 < b.x1 - pad || a.x1 > b.x2 + pad || a.y2 < b.y1 - pad || a.y1 > b.y2 + pad);
}

function ThemeMatrix({
  themes,
  selected,
  onSelect,
}: {
  themes: MarketTheme[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { ref, width } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const height = 532;
  const pad = { left: 34, right: 20, top: 30, bottom: 34 };
  const maxHeat = Math.max(...themes.map((theme) => theme.heat), 1);

  const pos = (theme: MarketTheme) => ({
    x: pad.left + (theme.crowding / 100) * (width - pad.left - pad.right),
    y: pad.top + (1 - theme.strength / 100) * (height - pad.top - pad.bottom),
  });

  if (!width) return <div ref={ref} className="chart-frame" style={{ height }} />;
  const hovered = themes.find((t) => t.id === hover?.id);

  const plotLeft = pad.left;
  const plotRight = width - pad.right;
  const plotTop = pad.top;
  const plotBottom = height - pad.bottom;
  const radiusOf = (theme: MarketTheme) => 5 + Math.sqrt(theme.heat / maxHeat) * 9;

  // 标签避让：先占住四个象限标题和所有气泡，再按强度顺序尝试右/左/上/下四个位置
  const obstacles: LabelBox[] = [
    { x1: plotLeft + 4, y1: plotTop + 2, x2: plotLeft + 140, y2: plotTop + 20 },
    { x1: plotRight - 120, y1: plotTop + 2, x2: plotRight - 2, y2: plotTop + 20 },
    { x1: plotLeft + 4, y1: plotBottom - 20, x2: plotLeft + 140, y2: plotBottom - 2 },
    { x1: plotRight - 120, y1: plotBottom - 20, x2: plotRight - 2, y2: plotBottom - 2 },
  ];
  const bubbles = themes.map((theme) => {
    const p = pos(theme);
    const r = radiusOf(theme);
    return { id: theme.id, x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r };
  });

  const labels = new Map<string, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }>();
  for (const theme of [...themes].sort((a, b) => b.strength - a.strength)) {
    const p = pos(theme);
    const r = radiusOf(theme);
    const name = shortName(theme);
    const sub = `${theme.strength} / ${theme.crowding}`;
    const boxW = Math.max(estimateTextWidth(name), estimateTextWidth(sub, 9.5)) + 6;
    const boxH = 27;
    const candidates = [
      { x: p.x + r + 5, y: p.y - 4, anchor: 'start' as const },
      { x: p.x - r - 5, y: p.y - 4, anchor: 'end' as const },
      { x: p.x, y: p.y - r - boxH - 4, anchor: 'middle' as const },
      { x: p.x, y: p.y + r + 6, anchor: 'middle' as const },
      { x: p.x + r * 0.7 + 4, y: p.y - r * 0.7 - boxH - 2, anchor: 'start' as const },
      { x: p.x - r * 0.7 - 4, y: p.y - r * 0.7 - boxH - 2, anchor: 'end' as const },
      { x: p.x + r * 0.7 + 4, y: p.y + r * 0.7 + 4, anchor: 'start' as const },
      { x: p.x - r * 0.7 - 4, y: p.y + r * 0.7 + 4, anchor: 'end' as const },
    ];
    const placed = candidates.find((candidate) => {
      const x1 =
        candidate.anchor === 'start'
          ? candidate.x
          : candidate.anchor === 'end'
            ? candidate.x - boxW
            : candidate.x - boxW / 2;
      const box: LabelBox = { x1, y1: candidate.y, x2: x1 + boxW, y2: candidate.y + boxH };
      if (box.x1 < plotLeft + 2 || box.x2 > plotRight - 2 || box.y1 < plotTop + 2 || box.y2 > plotBottom - 2) {
        return false;
      }
      if (obstacles.some((b) => overlaps(box, b))) return false;
      return !bubbles.some((b) => b.id !== theme.id && overlaps(box, b));
    });
    if (placed) {
      const x1 =
        placed.anchor === 'start' ? placed.x : placed.anchor === 'end' ? placed.x - boxW : placed.x - boxW / 2;
      obstacles.push({ x1, y1: placed.y, x2: x1 + boxW, y2: placed.y + boxH });
      labels.set(theme.id, placed);
    } else {
      labels.set(theme.id, { x: p.x + r + 5, y: p.y - 4, anchor: 'start' });
    }
  }

  return (
    <div ref={ref} className="chart-frame" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="主线强度与拥挤度矩阵">
        <rect
          x={pad.left}
          y={pad.top}
          width={width - pad.left - pad.right}
          height={height - pad.top - pad.bottom}
          fill="rgba(var(--ink-rgb),.012)"
          stroke="var(--line)"
        />
        <line
          x1={pad.left + (width - pad.left - pad.right) / 2}
          x2={pad.left + (width - pad.left - pad.right) / 2}
          y1={pad.top}
          y2={height - pad.bottom}
          className="grid-line dashed"
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + (height - pad.top - pad.bottom) / 2}
          y2={pad.top + (height - pad.top - pad.bottom) / 2}
          className="grid-line dashed"
        />
        <text x={pad.left + 7} y={pad.top + 14} className="matrix-quadrant">
          主升区 · 强而不过热
        </text>
        <text x={width - pad.right - 7} y={pad.top + 14} className="matrix-quadrant" textAnchor="end">
          高位区 · 强而拥挤
        </text>
        <text x={pad.left + 7} y={height - pad.bottom - 8} className="matrix-quadrant">
          低位区 · 低强低拥挤
        </text>
        <text x={width - pad.right - 7} y={height - pad.bottom - 8} className="matrix-quadrant" textAnchor="end">
          退潮区 · 低强高拥挤
        </text>

        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <text
              x={pad.left + (tick / 100) * (width - pad.left - pad.right)}
              y={height - pad.bottom + 17}
              className="axis-label"
              textAnchor="middle"
            >
              {tick}
            </text>
            <text
              x={pad.left - 9}
              y={pad.top + (1 - tick / 100) * (height - pad.top - pad.bottom) + 3}
              className="axis-label"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}
        <text x={width - pad.right} y={height - 3} className="axis-label" textAnchor="end">
          拥挤度 →
        </text>
        <text x={4} y={pad.top - 16} className="axis-label">
          ↑ 强度
        </text>

        {themes.map((theme) => {
          const p = pos(theme);
          const r = radiusOf(theme);
          const label = labels.get(theme.id) ?? { x: p.x + r + 5, y: p.y - 4, anchor: 'start' as const };
          const active = theme.id === selected;
          const color = STAGE_COLOR[theme.stage];
          return (
            <g
              key={theme.id}
              data-theme={theme.id}
              onClick={() => onSelect(theme.id)}
              onMouseEnter={() => setHover({ id: theme.id, x: p.x, y: p.y })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={p.x} cy={p.y} r={r + 5} fill={color} opacity={active ? 0.12 : 0} />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={color}
                fillOpacity={active ? 0.52 : 0.24}
                stroke={active ? 'var(--brass)' : color}
                strokeWidth={active ? 1.5 : 1}
              />
              <text
                x={label.x}
                y={label.y + 10}
                textAnchor={label.anchor}
                className={active ? 'matrix-label active' : 'matrix-label'}
              >
                {shortName(theme)}
              </text>
              <text x={label.x} y={label.y + 21} textAnchor={label.anchor} className="matrix-label-sub">
                {theme.strength} / {theme.crowding}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && hover && (
        <div className="chart-tip" style={{ left: clamp(hover.x, 82, width - 82), top: Math.max(hover.y - 8, 112) }}>
          <div className="tip-title">
            {hovered.name} <span className="num">{hovered.stage}期</span>
          </div>
          <div className="tip-row">
            <span>强度</span>
            <b>{hovered.strength}</b>
          </div>
          <div className="tip-row">
            <span>拥挤度</span>
            <b>{hovered.crowding}</b>
          </div>
          <div className="tip-row">
            <span>成交占比</span>
            <b>{hovered.heat.toFixed(1)}%</b>
          </div>
          <div className="tip-row">
            <span>主力净流入</span>
            <b className={hovered.inflow >= 0 ? 'text-up' : 'text-down'}>{signed(hovered.inflow, 1)} 亿</b>
          </div>
        </div>
      )}
    </div>
  );
}

function StageTrack({ stage }: { stage: ThemeStage }) {
  const index = STAGES.indexOf(stage);
  return (
    <div className="stage-track">
      <span className="stage-line" />
      <span className="stage-line-fill" style={{ width: `${(index / (STAGES.length - 1)) * 100}%` }} />
      {STAGES.map((s, i) => (
        <div className={cx('stage-node', i <= index && 'passed', i === index && 'active')} key={s}>
          <span className="stage-dot" />
          <span className="stage-label">{s}</span>
        </div>
      ))}
    </div>
  );
}

function ThemeDetail({ theme, events }: { theme: MarketTheme; events: { date: string; title: string }[] }) {
  return (
    <div className="theme-detail">
      <div className="theme-detail-head">
        <div>
          <div className="theme-detail-kicker">
            <span className="chip" style={{ color: STAGE_COLOR[theme.stage], borderColor: 'currentColor' }}>
              <span className="dot" />
              {theme.stage}期
            </span>
            <span className="label">{theme.alias}</span>
          </div>
          <h3 className="theme-detail-name serif">{theme.name}</h3>
        </div>
        <span className="theme-heat">
          <span className="label">成交占比 · {theme.turnover} 亿</span>
          <span className="display">{theme.heat}%</span>
        </span>
      </div>

      <StageTrack stage={theme.stage} />
      <p className="theme-stage-reason">{theme.model.stageReason}</p>

      <p className="theme-desc">{theme.description}</p>

      <div className="theme-metrics">
        <div>
          <span className="label">强度</span>
          <span className="num">{theme.strength}</span>
          <Meter value={theme.strength} tone="brass" />
        </div>
        <div>
          <span className="label">拥挤度</span>
          <span className="num">{theme.crowding}</span>
          <Meter value={theme.crowding} tone={theme.crowding > 70 ? 'up' : 'steel'} />
        </div>
        <div>
          <span className="label">主力净流入</span>
          <span className={cx('num', theme.inflow >= 0 ? 'text-up' : 'text-down')}>{signed(theme.inflow, 1)} 亿</span>
        </div>
        <div>
          <span className="label">相关 ETF</span>
          <span className="num theme-etf">{theme.etf}</span>
        </div>
      </div>

      <div className="theme-score-notes">
        <p>
          <span className="label">强度构成</span>
          {theme.model.strengthParts.map((part, index) => (
            <span key={part.key} title={`${part.formula}${part.note ? ` · ${part.note}` : ''}`}>
              {index > 0 && <span className="dim"> · </span>}
              {part.label} <b>{Math.round(part.score)}</b>×{Math.round(part.weight * 100)}%
            </span>
          ))}
        </p>
        <p>
          <span className="label">拥挤构成</span>
          {theme.model.crowdingParts.map((part, index) => (
            <span key={part.key} title={`${part.formula}${part.note ? ` · ${part.note}` : ''}`}>
              {index > 0 && <span className="dim"> · </span>}
              {part.label} <b>{Math.round(part.score)}</b>×{Math.round(part.weight * 100)}%
            </span>
          ))}
        </p>
      </div>

      <div className="theme-columns">
        <div>
          <span className="label">龙头梯队</span>
          <div className="leader-list">
            {theme.leaders.map((leader) => (
              <div className="leader-row" key={leader.code}>
                <span className="leader-name">
                  {LINKABLE.has(leader.code) ? (
                    <Link to={`/stocks/${leader.code}`} className="leader-link">
                      {leader.name}
                    </Link>
                  ) : (
                    leader.name
                  )}
                  <span className="leader-code">{leader.code}</span>
                </span>
                {leader.tag && <span className="chip chip--ghost">{leader.tag}</span>}
                <span className={cx('num', leader.changePct >= 0 ? 'text-up' : 'text-down')}>{pct(leader.changePct)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="label">核心催化</span>
          <ul className="catalyst-list">
            {theme.catalysts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="theme-risk">
        <span className="label">风险提示</span>
        <p>{theme.risk}</p>
      </div>

      {events.length > 0 && (
        <div className="theme-near-events">
          <span className="label">近期节点</span>
          <div className="near-event-list">
            {events.slice(0, 3).map((event) => (
              <div className="near-event" key={`${event.date}-${event.title}`}>
                <span className="num">{event.date}</span>
                <span>{event.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MainlinesPage() {
  const { data } = useAsync(() => api.mainlines(), []);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('theme') ?? 'ai-optics';

  const themes = useMemo(() => (data ? [...data.themes].sort((a, b) => b.strength - a.strength) : []), [data]);
  const selected = themes.find((t) => t.id === selectedId) ?? themes[0];
  const selectedEvents = data?.events.filter((e) => e.themeId === selected?.id) ?? [];

  if (!data || !selected) {
    return (
      <div className="page">
        <PageHeader
          serial="03"
          kicker="DOMINANT NARRATIVE / 主线"
          title="市场主线"
          deck="主线不是涨幅榜，而是资金、逻辑与情绪在同一方向上持续共振。"
        />
        <div className="grid">
          <Panel idx="01" title="主线强度矩阵" className="span-5" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 380 }} />
          </Panel>
          <Panel idx="02" title="主线解剖" className="span-7" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 380 }} />
          </Panel>
        </div>
      </div>
    );
  }

  const select = (id: string) => setParams({ theme: id }, { replace: true });

  return (
    <div className="page">
      <PageHeader
        serial="03"
        kicker="DOMINANT NARRATIVE / 主线"
        title="市场主线"
        deck="主线不是涨幅榜，而是资金、逻辑与情绪在同一方向上持续共振。用强度 × 拥挤度判断它在周期的哪一段。"
        asOf={data.source.asOf}
        source={data.source}
        note="强度/拥挤度公式化 · 阶段由 5 日动量派生"
      />

      <div className="brief-band">
        {data.summary.map((text, index) => (
          <div className="brief-item" key={text}>
            <span className="brief-idx">0{index + 1}</span>
            <p>{text}</p>
          </div>
        ))}
      </div>

      <div className="grid">
        <Panel
          idx="01"
          title="主线强度矩阵"
          sub="STRENGTH × CROWDING"
          className="span-5 panel--lead"
          bodyClass="tight"
          aside={<span className="panel-note">气泡 = 成交占比 · 公式 {themes[0]?.model.version}</span>}
          foot={
            <>
              <span>点击气泡切换右侧解剖</span>
              <span>横轴拥挤度 · 纵轴强度 · 气泡=成交占比（成分可重叠，不做加总）</span>
            </>
          }
        >
          <ThemeMatrix themes={themes} selected={selected.id} onSelect={select} />
        </Panel>

        <Panel
          idx="02"
          title="主线解剖"
          sub="ANATOMY"
          className="span-7"
          bodyClass="tight"
          aside={<span className="panel-note">{selected.alias}</span>}
        >
          <ThemeDetail theme={selected} events={selectedEvents} />
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="03"
          title="主线全景"
          sub="ALL THEMES"
          className="span-12"
          bodyClass="flush"
          aside={<span className="panel-note">按强度排序 · 点击卡片切换</span>}
        >
          <div className="theme-grid">
            {themes.map((theme, index) => {
              const active = theme.id === selected.id;
              return (
                <button
                  type="button"
                  key={theme.id}
                  className={cx('theme-card', active && 'active')}
                  onClick={() => select(theme.id)}
                >
                  <div className="theme-card-top">
                    <span className="theme-rank num">#{String(index + 1).padStart(2, '0')}</span>
                    <span className="chip" style={{ color: STAGE_COLOR[theme.stage], borderColor: 'currentColor' }}>
                      <span className="dot" />
                      {theme.stage}
                    </span>
                  </div>
                  <div className="theme-card-name serif">{shortName(theme)}</div>
                  <div className="theme-card-alias">{theme.alias}</div>
                  <Sparkline data={theme.spark} height={30} tone={stageTone(theme.stage) === 'up' ? 'up' : stageTone(theme.stage) === 'down' ? 'down' : 'brass'} />
                  <div className="theme-card-stats">
                    <span>
                      <span className="label">强度</span>
                      <span className="num">{theme.strength}</span>
                    </span>
                    <span>
                      <span className="label">拥挤</span>
                      <span className="num">{theme.crowding}</span>
                    </span>
                    <span>
                      <span className="label">净流入</span>
                      <span className={cx('num', theme.inflow >= 0 ? 'text-up' : 'text-down')}>{signed(theme.inflow, 0)}</span>
                    </span>
                  </div>
                  <div className="theme-card-leaders">
                    {theme.leaders.slice(0, 2).map((l) => (
                      <span key={l.code}>
                        {l.name}
                        <b className={l.changePct >= 0 ? 'text-up' : 'text-down'}>{pct(l.changePct, 1)}</b>
                      </span>
                    ))}
                    <ArrowUpRight size={12} className="theme-card-arrow" />
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="04"
          title="叙事时间轴"
          sub="NARRATIVE TIMELINE"
          className="span-12"
          bodyClass="tight"
          aside={<span className="panel-note">近 3 个月关键催化</span>}
        >
          <div className="event-rail">
            <span className="event-line" />
            {data.events.map((event) => {
              const theme = data.themes.find((t) => t.id === event.themeId);
              return (
                <button
                  type="button"
                  className="event-item"
                  key={`${event.date}-${event.title}`}
                  onClick={() => theme && select(theme.id)}
                >
                  <span className="event-date num">{event.date}</span>
                  <span className={cx('event-dot', event.tone)} />
                  <span className="event-title">{event.title}</span>
                  <span className="event-theme">{theme ? shortName(theme) : '—'}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
