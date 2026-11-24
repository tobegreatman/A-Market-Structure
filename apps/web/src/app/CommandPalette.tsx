import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchItem } from '@am/contracts';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { CloseIcon, SearchIcon } from '../components/Icons';

const TYPE_LABEL: Record<SearchItem['type'], string> = {
  module: '页面',
  stock: '个股',
  theme: '主线',
  topic: '课题',
};

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    api.search('').then((result) => setItems(result));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      api.search(query).then((result) => {
        if (alive) {
          setItems(result);
          setActive(0);
        }
      });
    }, 90);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.palette-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    navigate(item.href);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (items.length ? (prev + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[active]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  const grouped = useMemo(() => items, [items]);
  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="全局检索">
        <div className="palette-input-row">
          <SearchIcon size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索股票、主线、课题或页面…"
            aria-label="搜索"
          />
          <button className="btn icon" onClick={onClose} aria-label="关闭" type="button">
            <CloseIcon size={13} />
          </button>
        </div>
        <div className="palette-list" ref={listRef}>
          {grouped.length === 0 && <div className="empty">没有匹配的结果，试试「光模块」或「300308」</div>}
          {grouped.map((item, index) => (
            <div
              key={item.id}
              className={cx('palette-item', index === active && 'active')}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item)}
              role="button"
              tabIndex={-1}
            >
              <span className="palette-type">{TYPE_LABEL[item.type]}</span>
              <span className="palette-label">{highlight(item.label, query)}</span>
              <span className="palette-sub">{item.sub}</span>
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span>STRUCTURE / COMMAND</span>
          <span className="keys">
            <span>↑↓ 选择</span>
            <span>↵ 打开</span>
            <span>ESC 关闭</span>
          </span>
        </div>
      </div>
    </div>
  );
}
