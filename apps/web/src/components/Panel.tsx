import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/format';

interface PanelProps {
  title: ReactNode;
  idx?: string;
  sub?: string;
  aside?: ReactNode;
  foot?: ReactNode;
  className?: string;
  bodyClass?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function Panel({ title, idx, sub, aside, foot, className, bodyClass, children, style }: PanelProps) {
  return (
    <section className={cx('panel', className)} style={style}>
      <header className="panel-head">
        <h2 className="panel-title">
          {idx && <span className="idx">{idx}</span>}
          <span>{title}</span>
          {sub && <span className="sub">{sub}</span>}
        </h2>
        {aside && <div className="panel-aside">{aside}</div>}
      </header>
      <div className={cx('panel-body', bodyClass)}>{children}</div>
      {foot && <footer className="panel-foot">{foot}</footer>}
    </section>
  );
}
