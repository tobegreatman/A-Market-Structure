import type { CycleIndicator, CyclePayload } from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { cx, fmt, pct, signed, toneOf } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { Sparkline } from '../../components/Sparkline';
import { Meter } from '../../components/Meter';
import { Delta } from '../../components/Delta';

const QUADRANTS = [
  { id: 'recovery', name: '复苏', start: -180, end: -90, color: 'var(--brass)' },
  { id: 'overheat', name: '过热', start: -90, end: 0, color: 'var(--up)' },
  { id: 'stagflation', name: '滞胀', start: 0, end: 90, color: 'var(--clay)' },
  { id: 'recession', name: '衰退', start: 90, end: 180, color: 'var(--steel)' },
];

function Clock({ clock }: { clock: CyclePayload['clock'] }) {
  const size = 348;
  const c = size / 2;
  const r = size / 2 - 30;
  const active = clock.quadrants.find((q) => q.active) ?? clock.quadrants[0];

  const point = (angle: number, radius: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: c + radius * Math.cos(rad), y: c + radius * Math.sin(rad) };
  };

  const needleAngle = (Math.atan2(-clock.y, clock.x) * 180) / Math.PI;
  const tip = point(needleAngle, r * 0.58);
  const tail = point(needleAngle + 180, 22);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="美林时钟周期定位">
      <defs>
        <radialGradient id="clock-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--brass)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--brass)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r + 8} fill="url(#clock-glow)" />

      {QUADRANTS.map((q) => {
        const p1 = point(q.start, r);
        const p2 = point(q.end, r);
        const isActive = active?.id === q.id;
        return (
          <path
            key={q.id}
            d={`M${c},${c} L${p1.x.toFixed(2)},${p1.y.toFixed(2)} A${r},${r} 0 0 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)} Z`}
            fill={q.color}
            fillOpacity={isActive ? 0.24 : 0.04}
            stroke={isActive ? q.color : 'var(--line-2)'}
            strokeWidth={isActive ? 1.6 : 1}
            strokeOpacity={isActive ? 0.95 : 0.7}
          />
        );
      })}

      {[64, 104].map((radius) => (
        <circle key={radius} cx={c} cy={c} r={radius} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
      ))}

      {Array.from({ length: 36 }).map((_, i) => {
        const angle = i * 10;
        const outer = point(angle, r + 6);
        const inner = point(angle, i % 3 === 0 ? r - 2 : r + 1);
        return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--line-2)" strokeWidth="1" />;
      })}

      {QUADRANTS.map((q) => {
        const mid = (q.start + q.end) / 2;
        const labelPoint = point(mid, r - 48);
        const isActive = active?.id === q.id;
        return (
          <g key={`label-${q.id}`} opacity={isActive ? 1 : 0.55}>
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              className={isActive ? 'clock-label active' : 'clock-label'}
            >
              {q.name}
            </text>
            {isActive && (
              <text x={labelPoint.x} y={labelPoint.y + 15} textAnchor="middle" className="clock-sublabel">
                当前象限
              </text>
            )}
          </g>
        );
      })}

      <text x={c} y={14} textAnchor="middle" className="clock-axis">
        增长 ↑
      </text>
      <text x={size - 4} y={c + 3} textAnchor="end" className="clock-axis">
        通胀 →
      </text>

      <line
        x1={tail.x}
        y1={tail.y}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--brass)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx={tip.x} cy={tip.y} r="4" fill="var(--brass)" />
      <circle cx={tip.x} cy={tip.y} r="9" fill="none" stroke="var(--brass)" opacity="0.32" />

      <circle cx={c} cy={c} r="58" fill="var(--clock-core)" stroke="var(--line-2)" />
      <text x={c} y={c - 2} textAnchor="middle" className="clock-center-phase">
        {clock.phase}
      </text>
      <text x={c} y={c + 18} textAnchor="middle" className="clock-sublabel">
        {clock.x < 0 ? '低通胀' : '高通胀'} · {clock.y > 0 ? '增长上行' : '增长下行'}
      </text>
      <circle cx={c} cy={c} r="2" fill="var(--brass)" />
    </svg>
  );
}

function IndicatorRow({ indicator }: { indicator: CycleIndicator }) {
  return (
    <div className="indicator-card">
      <div className="indicator-head">
        <span className="indicator-name">{indicator.name}</span>
        <span className="chip chip--ghost">{indicator.stage}</span>
      </div>
      <div className="indicator-main">
        <span className="indicator-value display">
          {fmt(indicator.latest, 1)}
          <span className="indicator-unit">{indicator.unit}</span>
        </span>
        <Delta value={indicator.delta} suffix={indicator.unit} digits={1} arrow={false} />
      </div>
      <Sparkline data={indicator.series} height={56} tone={indicator.key === 'ppi' ? 'down' : 'brass'} />
      <div className="indicator-foot">
        <span className="panel-note">{indicator.note}</span>
        <span className="indicator-pct num">分位 {indicator.percentile}%</span>
      </div>
    </div>
  );
}

export function CyclePage() {
  const { data } = useAsync(() => api.cycle(), []);

  if (!data) {
    return (
      <div className="page">
        <PageHeader
          serial="05"
          kicker="CYCLE POSITION / 周期"
          title="经济周期"
          deck="先定位周期，再谈风格；先看信用，再谈估值。"
        />
        <div className="grid">
          <Panel idx="01" title="美林时钟" className="span-5" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 420 }} />
          </Panel>
          <Panel idx="02" title="宏观刻度" className="span-7" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 420 }} />
          </Panel>
        </div>
      </div>
    );
  }

  const active = data.clock.quadrants.find((q) => q.active) ?? data.clock.quadrants[0];
  const maxStyle = Math.max(...data.styleMatrix.map((s) => Math.abs(s.value)), 1);

  return (
    <div className="page">
      <PageHeader
        serial="05"
        kicker="CYCLE POSITION / 周期"
        title="经济周期"
        deck="先定位周期，再谈风格；先看信用，再谈估值。美林时钟给出象限，信用与库存给出斜率。"
        asOf={data.source.asOf}
        source={data.source}
        note="宏观指标采用近 48 个月 · 演示数据"
      />

      <div className="grid">
        <Panel
          idx="01"
          title="美林时钟"
          sub="MERRILL CLOCK"
          className="span-5 panel--lead"
          bodyClass="tight fill"
          aside={<span className="chip chip--brass">增长 × 通胀</span>}
          foot={
            <>
              <span>当前：{data.clock.phase}</span>
              <span>下一阶段：{data.clock.next.split('，')[0]}</span>
            </>
          }
        >
          <div className="clock-wrap">
            <Clock clock={data.clock} />
          </div>
          <div className="clock-note">
            <p>{data.clock.note}</p>
            <div className="clock-assets">
              <span className="label">配置倾向</span>
              {active.assets.map((asset) => (
                <span className="chip chip--brass" key={asset}>
                  {asset}
                </span>
              ))}
            </div>
            <p className="clock-next">{data.clock.next}</p>
          </div>
        </Panel>

        <Panel
          idx="02"
          title="宏观刻度"
          sub="MACRO DIALS"
          className="span-7"
          bodyClass="tight fill"
          aside={<span className="panel-note">环比方向与历史分位</span>}
        >
          <div className="indicator-grid">
            {data.indicators.map((indicator) => (
              <IndicatorRow key={indicator.key} indicator={indicator} />
            ))}
          </div>
          <div className="credit-band">
            <div>
              <span className="label">信用周期</span>
              <span>{data.credit.stage}</span>
            </div>
            <div>
              <span className="label">库存周期</span>
              <span>{data.credit.inventory}</span>
            </div>
            <div>
              <span className="label">流动性</span>
              <span>{data.credit.liquidity}</span>
            </div>
            <div>
              <span className="label">盈利</span>
              <span>{data.credit.earnings}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="03"
          title="宏观指标 · 48 个月"
          sub="SMALL MULTIPLES"
          className="span-7"
          bodyClass="tight"
          aside={<span className="panel-note">2022.11 — 2026.10</span>}
          foot={
            <>
              <span>PMI / CPI / PPI / 社融存量同比</span>
              <span>图形为月度序列</span>
            </>
          }
        >
          <div className="mini-grid">
            {data.indicators.map((indicator) => (
              <div className="mini-chart" key={indicator.key}>
                <div className="mini-chart-head">
                  <span>{indicator.name}</span>
                  <span className="num">{fmt(indicator.latest, 1)}{indicator.unit}</span>
                </div>
                <Sparkline data={indicator.series} height={72} tone={indicator.key === 'ppi' ? 'down' : 'brass'} />
                <div className="mini-chart-foot">
                  <span className="num">{fmt(Math.min(...indicator.series), 1)}</span>
                  <span className="num">{fmt(Math.max(...indicator.series), 1)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          idx="04"
          title="风格矩阵"
          sub="STYLE ROTATION"
          className="span-5"
          bodyClass="tight"
          aside={<span className="panel-note">近 20 个交易日</span>}
          foot={<span>相对收益 = 风格指数 − 万得全A</span>}
        >
          <div className="style-matrix">
            <div className="style-axis-x">
              <span />
              <span>成长</span>
              <span>价值</span>
            </div>
            <div className="style-row">
              <span className="style-axis-y">大盘</span>
              {['大盘成长', '大盘价值'].map((name) => {
                const item = data.styleMatrix.find((s) => s.name === name);
                if (!item) return null;
                const tone = toneOf(item.value);
                return (
                  <div className={cx('style-cell', tone)} key={name}>
                    <span className="style-name">{name}</span>
                    <span className={cx('style-value display', `text-${tone}`)}>{signed(item.value, 1)}%</span>
                    <Meter value={Math.abs(item.value)} max={maxStyle} tone={tone === 'up' ? 'up' : 'down'} height={3} />
                    <span className="style-note">{item.note}</span>
                  </div>
                );
              })}
            </div>
            <div className="style-row">
              <span className="style-axis-y">小盘</span>
              {['小盘成长', '小盘价值'].map((name) => {
                const item = data.styleMatrix.find((s) => s.name === name);
                if (!item) return null;
                const tone = toneOf(item.value);
                return (
                  <div className={cx('style-cell', tone)} key={name}>
                    <span className="style-name">{name}</span>
                    <span className={cx('style-value display', `text-${tone}`)}>{signed(item.value, 1)}%</span>
                    <Meter value={Math.abs(item.value)} max={maxStyle} tone={tone === 'up' ? 'up' : 'down'} height={3} />
                    <span className="style-note">{item.note}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="style-read">
            <span className="label">结构解读</span>
            <p>小盘成长领先、大盘价值休整，对应「宽货币 + 产业主题活跃」的组合；若信用继续扩张，风格有望向大盘成长扩散。</p>
          </div>
        </Panel>
      </div>

      <div className="grid">
        <Panel
          idx="05"
          title="历史类比"
          sub="HISTORICAL ANALOG"
          className="span-12"
          bodyClass="tight"
          aside={<span className="panel-note">基于增长、通胀、信用与风格的四维相似度</span>}
        >
          <div className="analog-grid">
            {data.analogs.map((analog) => (
              <div className="analog-card" key={analog.period}>
                <div className="analog-head">
                  <span className="analog-period display">{analog.period}</span>
                  <span className="chip chip--brass">相似度 {analog.similarity}%</span>
                </div>
                <div className="analog-bar">
                  <Meter value={analog.similarity} tone="brass" height={4} />
                </div>
                <p>{analog.note}</p>
                <div className="analog-foot">
                  <span className="label">对照维度</span>
                  <span className="num">增长 / 通胀 / 信用 / 风格</span>
                </div>
              </div>
            ))}
            <div className="analog-card analog-summary">
              <span className="label">周期结论</span>
              <p className="serif">当前更像「复苏前段」，而非全面过热。结构上优先选择对信用敏感、且产业趋势独立的成长方向。</p>
              <span className="panel-note">PPI 同比转正与社融回升，是切换到「过热」的两个确认信号。</span>
            </div>
          </div>
        </Panel>
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
