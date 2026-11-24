import type { ReactNode } from 'react';
import type { SourceMeta } from '@am/contracts';
import { timeLabel } from '../lib/format';

interface PageHeaderProps {
  serial: string;
  kicker: string;
  title: string;
  deck: ReactNode;
  asOf?: string;
  source?: SourceMeta;
  note?: string;
}

const MODE_LABEL: Record<SourceMeta['mode'], string> = {
  demo: '演示数据',
  live: '实时行情',
  mixed: '混合数据源',
};

export function PageHeader({ serial, kicker, title, deck, asOf, source, note }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        <div className="kicker">
          <span>{serial}</span>
          <span className="slash">/</span>
          <span>{kicker}</span>
        </div>
        <h1 className="page-title">{title}</h1>
        <p className="page-deck">{deck}</p>
      </div>
      <span className="page-ghost" aria-hidden="true">
        {serial}
      </span>
      <div className="head-meta">
        {source && (
          <span className={source.mode === 'live' ? 'data-badge live' : 'data-badge'} title={`渠道：${source.provider}`}>
            <span className="dot" />
            {source.mode === 'demo' ? '演示数据' : `${MODE_LABEL[source.mode]} · ${source.provider}`}
          </span>
        )}
        <span className="head-time">{asOf ? timeLabel(asOf) : '正在接入数据…'}</span>
        {note && <span className="head-note">{note}</span>}
      </div>
    </header>
  );
}
