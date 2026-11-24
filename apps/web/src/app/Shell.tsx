import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { applyTheme, readTheme, toggleTheme, type Theme } from '../lib/theme';
import { compactMoney } from '../lib/format';
import { Sparkline } from '../components/Sparkline';
import {
  BrandMark,
  CycleIcon,
  FlowIcon,
  MainlineIcon,
  MoonIcon,
  OverviewIcon,
  SearchIcon,
  StockIcon,
  SunIcon,
  UniverseIcon,
} from '../components/Icons';
import { CommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { path: '/', label: '盘面', idx: '01', icon: OverviewIcon, end: true },
  { path: '/flow', label: '资金', idx: '02', icon: FlowIcon },
  { path: '/mainlines', label: '主线', idx: '03', icon: MainlineIcon },
  { path: '/stocks', label: '个股', idx: '04', icon: StockIcon },
  { path: '/cycle', label: '周期', idx: '05', icon: CycleIcon },
  { path: '/universe', label: '宇宙', idx: '06', icon: UniverseIcon },
];

const MOTES = [
  { x: '5%', s: 2.6, dur: 32, delay: -12, drift: '42px', tone: 'brass' },
  { x: '13%', s: 1.8, dur: 26, delay: -21, drift: '-30px', tone: 'jade' },
  { x: '22%', s: 3, dur: 40, delay: -33, drift: '26px', tone: 'brass' },
  { x: '31%', s: 1.6, dur: 28, delay: -6, drift: '-38px', tone: 'jade' },
  { x: '41%', s: 2.4, dur: 36, delay: -27, drift: '34px', tone: 'brass' },
  { x: '52%', s: 1.7, dur: 24, delay: -15, drift: '-24px', tone: 'brass' },
  { x: '61%', s: 2.8, dur: 38, delay: -35, drift: '30px', tone: 'jade' },
  { x: '70%', s: 1.9, dur: 30, delay: -9, drift: '-32px', tone: 'brass' },
  { x: '79%', s: 2.2, dur: 34, delay: -23, drift: '24px', tone: 'brass' },
  { x: '87%', s: 1.5, dur: 27, delay: -18, drift: '-28px', tone: 'jade' },
  { x: '93%', s: 2.6, dur: 42, delay: -39, drift: '36px', tone: 'brass' },
  { x: '98%', s: 1.7, dur: 29, delay: -4, drift: '-22px', tone: 'jade' },
];

function Atmosphere() {
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reduced.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let px = 0;
    let py = 0;

    const onMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--atmo-x', `${px}px`);
        root.style.setProperty('--atmo-y', `${py}px`);
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="atmosphere" aria-hidden="true">
      <span className="atmo-base" />
      <span className="atmo-glow atmo-glow-a" />
      <span className="atmo-glow atmo-glow-b" />
      <span className="atmo-glow atmo-glow-c" />
      <span className="atmo-grid" />
      <span className="atmo-scan" />
      {MOTES.map((mote, index) => (
        <span
          key={index}
          className={`atmo-mote ${mote.tone}`}
          style={
            {
              '--x': mote.x,
              '--s': `${mote.s}px`,
              '--dur': `${mote.dur}s`,
              '--delay': `${mote.delay}s`,
              '--drift': mote.drift,
            } as CSSProperties
          }
        />
      ))}
      <span className="atmo-pointer" />
    </div>
  );
}

export function Shell() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const { data, loading } = useAsync(() => api.overview(), []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    api.health().then((ok) => alive && setOnline(ok));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const indices = data?.indices ?? [];
  const breadth = data?.breadth;

  return (
    <div className="app">
      <Atmosphere />
      <div className="grain" aria-hidden="true" />

      <aside className="rail">
        <NavLink to="/" className="rail-brand" aria-label="结构 · 首页">
          <BrandMark />
        </NavLink>
        <nav className="rail-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`}
                aria-label={item.label}
              >
                <span className="idx">{item.idx}</span>
                <Icon className="ico" />
                <span className="lbl">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="rail-foot">
          <button className="btn icon" onClick={() => setPaletteOpen(true)} aria-label="全局检索" title="全局检索 ⌘K">
            <SearchIcon size={14} />
          </button>
          <div className="rail-status">
            <span className="dot" style={online === false ? { background: 'var(--text-4)', animation: 'none' } : undefined} />
            <span>{online === null ? '…' : online ? 'API' : 'LOCAL'}</span>
          </div>
          <span className="rail-vertical">STRUCTURE · A-SHARE</span>
        </div>
      </aside>

      <div className="main">
        <div className="tape">
          <div className="tape-status">
            <span className="dot" />
            <span>{data?.sessionLabel ?? '接入中'} · 15:00</span>
          </div>
          <div className="tape-scroll">
            {loading && !data
              ? Array.from({ length: 5 }).map((_, index) => (
                  <div className="tape-item" key={index}>
                    <span className="skeleton" style={{ width: 48, height: 10 }} />
                    <span className="skeleton" style={{ width: 56, height: 12 }} />
                    <span className="skeleton" style={{ width: 40, height: 10 }} />
                  </div>
                ))
              : indices.map((index) => (
                  <div className="tape-item" key={index.code}>
                    <span className="nm">{index.name}</span>
                    <span className="val">{index.value.toFixed(2)}</span>
                    <span className={index.changePct >= 0 ? 'chg text-up' : 'chg text-down'}>
                      {index.changePct >= 0 ? '+' : ''}
                      {index.changePct.toFixed(2)}%
                    </span>
                    <Sparkline
                      className="spark"
                      data={index.spark}
                      width={54}
                      height={20}
                      tone={index.changePct >= 0 ? 'up' : 'down'}
                    />
                  </div>
                ))}
          </div>
          <div className="tape-breadth">
            <span>
              涨 <b className="text-up">{breadth?.up ?? '—'}</b>
            </span>
            <span>
              跌 <b className="text-down">{breadth?.down ?? '—'}</b>
            </span>
            <span className="sep" />
            <span>
              成交 <b>{breadth ? compactMoney(breadth.turnover) : '—'}</b>
            </span>
          </div>

          <div className="tape-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((prev) => toggleTheme(prev))}
              title={theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
              aria-label={theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
          </div>
        </div>

        <div key={location.pathname}>
          <Outlet />
        </div>
      </div>

      <nav className="mobile-nav" aria-label="移动端导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.path} to={item.path} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
