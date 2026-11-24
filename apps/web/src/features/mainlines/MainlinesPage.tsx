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
  const height = 452;
  const pad = { left: 34, right: 20, top: 18, bottom: 34 };

  const pos = (theme: MarketTheme) => ({
    x: pad.left + (theme.crowding / 100) * (width - pad.left - pad.right),
    y: pad.top + (1 - theme.strength / 100) * (height - pad.top - pad.bottom),
  });

  if (!width) return <div ref={ref} className="chart-frame" style={{ height }} />;
  const hovered = themes.find((t) => t.id === hover?.id);

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
          过热区 · 警惕分歧
        </text>
        <text x={pad.left + 7} y={height - pad.bottom - 8} className="matrix-quadrant">
          观察区 · 等待催化
        </text>
        <text x={width - pad.right - 7} y={height - pad.bottom - 8} className="matrix-quadrant" textAnchor="end">
          退潮区 · 降低暴露
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
        <text x={4} y={pad.top - 5} className="axis-label">
          ↑ 强度
        </text>

        {themes.map((theme) => {
          const p = pos(theme);
          const r = 5 + Math.sqrt(theme.heat / 18.6) * 11;
          const active = theme.id === selected;
          const color = STAGE_COLOR[theme.stage];
          return (
            <g
              key={theme.id}
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
                x={p.x + r + 5}
                y={p.y + 3}
                className={active ? 'matrix-label active' : 'matrix-label'}
              >
                {shortName(theme)}
              </text>
              <text x={p.x + r + 5} y={p.y + 14} className="matrix-label-sub">
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
          <span className="label">成交占比</span>
          <span className="display">{theme.heat}%</span>
        </span>
      </div>

      <StageTrack stage={theme.stage} />

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
        note="强度：资金与涨幅的综合得分 · 拥挤度：成交与持仓的一致性"
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
          aside={<span className="panel-note">气泡 = 成交占比</span>}
          foot={
            <>
              <span>点击气泡切换右侧解剖</span>
              <span>数据显示四位整数 0-100</span>
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
