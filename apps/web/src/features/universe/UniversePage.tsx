import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { UniverseLayer, UniverseNode } from '@am/contracts';
import { api } from '../../lib/api';
import { useAsync, useSize } from '../../lib/hooks';
import { clamp, forceLayout } from '../../lib/geometry';
import { cx } from '../../lib/format';
import { Panel } from '../../components/Panel';
import { PageHeader } from '../../components/PageHeader';
import { PageFoot } from '../../components/PageFoot';
import { MinusIcon, PlusIcon, ResetIcon, SearchIcon } from '../../components/Icons';

const LAYER_META: Record<UniverseLayer, { label: string; desc: string; color: string }> = {
  macro: { label: '宏观', desc: '流动性、信用与周期的底层变量', color: 'var(--brass)' },
  meso: { label: '中观', desc: '产业趋势与行业景气', color: 'var(--clay)' },
  micro: { label: '微观', desc: '产业链环节与关键材料', color: 'var(--steel)' },
  method: { label: '方法', desc: '判断主线与风险的框架', color: '#a8a293' },
  stock: { label: '标的', desc: '主线中的核心公司', color: 'var(--text)' },
};

const LAYER_ORDER: UniverseLayer[] = ['macro', 'meso', 'micro', 'method', 'stock'];
const STOCK_BY_NODE: Record<string, string> = {
  zjxc: '300308',
  catl: '300750',
  cambricon: '688256',
  zijin: '601899',
};

function Graph({
  nodes,
  edges,
  selected,
  onSelect,
  query,
  layers,
}: {
  nodes: UniverseNode[];
  edges: Array<{ source: string; target: string; kind: string }>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  query: string;
  layers: Set<UniverseLayer>;
}) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef({ active: false, x: 0, y: 0, startX: 0, startY: 0, moved: false });

  const layout = useMemo(() => {
    const w = width || 900;
    const h = height || 580;
    const byLayer = new Map<UniverseLayer, UniverseNode[]>();
    LAYER_ORDER.forEach((layer) => byLayer.set(layer, []));
    nodes.forEach((node) => byLayer.get(node.layer)?.push(node));
    const anchorX: Record<UniverseLayer, number> = { macro: 0.11, meso: 0.34, micro: 0.62, method: 0.47, stock: 0.88 };
    const seeds = nodes.map((node) => {
      if (node.layer === 'method') {
        const group = byLayer.get('method') ?? [];
        const index = group.findIndex((n) => n.id === node.id);
        return { id: node.id, weight: node.weight, anchorX: 0.2 + (index / Math.max(1, group.length - 1)) * 0.6, anchorY: 0.88 };
      }
      const group = byLayer.get(node.layer) ?? [];
      const index = group.findIndex((n) => n.id === node.id);
      return {
        id: node.id,
        weight: node.weight,
        anchorX: anchorX[node.layer],
        anchorY: 0.12 + (index / Math.max(1, group.length - 1)) * 0.7,
      };
    });
    return forceLayout(seeds, edges, w, h);
  }, [nodes, edges, width, height]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    nodes.forEach((node) => map.set(node.id, new Set()));
    edges.forEach((edge) => {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    });
    return map;
  }, [nodes, edges]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      nodes.filter((node) => `${node.name}${node.tags.join('')}${node.note}`.toLowerCase().includes(q)).map((n) => n.id),
    );
  }, [nodes, query]);

  const focus = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    neighbors.get(selected)?.forEach((id) => set.add(id));
    return set;
  }, [selected, neighbors]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setView((prev) => {
        const nextK = clamp(prev.k * (event.deltaY > 0 ? 0.88 : 1.12), 0.55, 2.4);
        const factor = nextK / prev.k;
        return { k: nextK, x: mx - (mx - prev.x) * factor, y: my - (my - prev.y) * factor };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);

  const zoomBy = (factor: number) => {
    setView((prev) => {
      const nextK = clamp(prev.k * factor, 0.55, 2.4);
      const f = nextK / prev.k;
      const cx = (width || 900) / 2;
      const cy = (height || 580) / 2;
      return { k: nextK, x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f };
    });
  };

  const visibleNodes = nodes.filter((node) => layers.has(node.layer));
  const visibleSet = new Set(visibleNodes.map((n) => n.id));

  const nodeScale = 1;
  const showLabel = (node: UniverseNode) =>
    node.weight >= 0.7 || node.id === selected || node.id === hover || focus?.has(node.id) || matches?.has(node.id);

  return (
    <div
      ref={ref}
      className={cx('graph-canvas', drag.current.active && 'dragging')}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        drag.current = { active: true, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current.active) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        if (Math.abs(event.clientX - drag.current.startX) + Math.abs(event.clientY - drag.current.startY) > 4) {
          drag.current.moved = true;
        }
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
        setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      }}
      onPointerUp={(event) => {
        if (!drag.current.active) return;
        drag.current.active = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!drag.current.moved) onSelect(null);
        drag.current.moved = false;
      }}
      onPointerLeave={() => {
        drag.current.active = false;
        drag.current.moved = false;
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${width || 900} ${height || 580}`} role="img" aria-label="知识宇宙图谱">
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((edge, index) => {
            if (!visibleSet.has(edge.source) || !visibleSet.has(edge.target)) return null;
            const a = layout[edge.source];
            const b = layout[edge.target];
            if (!a || !b) return null;
            const related =
              (!focus && !matches) ||
              (focus && (focus.has(edge.source) || focus.has(edge.target))) ||
              (matches && (matches.has(edge.source) || matches.has(edge.target)));
            const kindColor =
              edge.kind === 'supply'
                ? 'rgba(var(--brass-rgb),.34)'
                : edge.kind === 'capital'
                  ? 'rgba(236,97,73,.3)'
                  : edge.kind === 'method'
                    ? 'rgba(127,166,196,.3)'
                    : 'rgba(var(--ink-rgb),.24)';
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={related ? kindColor : 'rgba(var(--ink-rgb),.08)'}
                strokeWidth="1"
              />
            );
          })}

          {visibleNodes.map((node) => {
            const p = layout[node.id];
            if (!p) return null;
            const color = LAYER_META[node.layer].color;
            const dim = (focus && !focus.has(node.id)) || (matches && !matches.has(node.id) && node.id !== selected);
            const active = node.id === selected;
            const r = (3.4 + node.weight * 6.4) * nodeScale;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.42 : 1}
                style={{ cursor: 'pointer', transition: 'opacity .25s ease' }}
                onPointerEnter={() => setHover(node.id)}
                onPointerLeave={() => setHover(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (drag.current.moved) return;
                  onSelect(node.id);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {(active || matches?.has(node.id)) && (
                  <circle r={r + 7} fill="none" stroke={active ? 'var(--brass)' : color} strokeWidth="1" opacity={active ? 0.7 : 0.4} />
                )}
                <circle r={r + 2.5} fill={color} opacity="0.1" />
                <circle r={r} fill={color} opacity={active ? 0.95 : 0.72} stroke="var(--ink-0)" strokeWidth="1.2" />
                {showLabel(node) && (
                  <text
                    x={r + 6}
                    y={3.5}
                    className={cx('graph-label', active && 'active')}
                    onPointerEnter={() => setHover(node.id)}
                  >
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="graph-zoom">
        <button type="button" className="btn icon" onClick={() => zoomBy(1.18)} aria-label="放大">
          <PlusIcon size={13} />
        </button>
        <button type="button" className="btn icon" onClick={() => zoomBy(0.85)} aria-label="缩小">
          <MinusIcon size={13} />
        </button>
        <button type="button" className="btn icon" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="重置视图">
          <ResetIcon size={13} />
        </button>
      </div>
      <div className="graph-hint">拖拽平移 · 滚轮缩放 · 点击节点</div>
    </div>
  );
}

export function UniversePage() {
  const { data } = useAsync(() => api.universe(), []);
  const [params, setParams] = useSearchParams();
  const [selectedNode, setSelectedNode] = useState<string | null>('ai');
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<Set<UniverseLayer>>(new Set(LAYER_ORDER));

  if (!data) {
    return (
      <div className="page">
        <PageHeader
          serial="06"
          kicker="KNOWLEDGE GRAPH / 知识"
          title="知识宇宙"
          deck="宏观、产业、公司与方法，在同一个坐标系里彼此连接。"
        />
        <div className="grid">
          <Panel idx="01" title="知识图谱" className="span-8" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 560 }} />
          </Panel>
          <Panel idx="02" title="节点详情" className="span-4" bodyClass="center">
            <div className="skeleton" style={{ width: '100%', height: 560 }} />
          </Panel>
        </div>
      </div>
    );
  }

  const topic = params.get('topic');
  const selectedTopic = data.topics.find((t) => t.id === topic) ?? null;
  const node = data.nodes.find((n) => n.id === selectedNode) ?? null;
  const neighbors = selectedNode
    ? data.edges
        .filter((e) => e.source === selectedNode || e.target === selectedNode)
        .map((e) => (e.source === selectedNode ? e.target : e.source))
        .map((id) => data.nodes.find((n) => n.id === id))
        .filter((n): n is UniverseNode => Boolean(n))
    : [];
  const relatedTopics = node ? data.topics.filter((t) => t.related.includes(node.id)) : [];
  const layerCounts = LAYER_ORDER.map((layer) => ({ layer, count: data.nodes.filter((n) => n.layer === layer).length }));

  const selectNode = (id: string | null) => {
    setSelectedNode(id);
    if (params.has('topic')) setParams({}, { replace: true });
  };

  const selectTopic = (id: string | null) => {
    if (id) setParams({ topic: id }, { replace: true });
    else setParams({}, { replace: true });
  };

  const toggleLayer = (layer: UniverseLayer) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  return (
    <div className="page">
      <PageHeader
        serial="06"
        kicker="KNOWLEDGE GRAPH / 知识"
        title="知识宇宙"
        deck="宏观、产业、公司与方法，在同一个坐标系里彼此连接。沿着一条边走下去，就是一次完整的研究路径。"
        asOf={data.source.asOf}
        source={data.source}
        note={`${data.nodes.length} 个节点 · ${data.edges.length} 条关系 · 点击任意节点展开`}
      />

      <div className="universe-layout">
        <Panel
          idx="01"
          title="知识图谱"
          sub="CONSTELLATION"
          className="universe-graph-panel panel--lead"
          bodyClass="flush"
          aside={
            <>
              <span className="graph-count">
                <b>{layerCounts.reduce((a, b) => a + b.count, 0)}</b> 节点
              </span>
              <span className="graph-count">
                <b>{data.edges.length}</b> 关系
              </span>
            </>
          }
        >
          <div className="graph-toolbar">
            <div className="layer-filters">
              {layerCounts.map(({ layer, count }) => (
                <button
                  key={layer}
                  type="button"
                  className={cx('layer-chip', layers.has(layer) && 'active')}
                  onClick={() => toggleLayer(layer)}
                  style={{ color: layers.has(layer) ? LAYER_META[layer].color : undefined }}
                >
                  <span className="dot" style={{ background: LAYER_META[layer].color }} />
                  {LAYER_META[layer].label}
                  <span className="layer-count">{count}</span>
                </button>
              ))}
            </div>
            <label className="graph-search">
              <SearchIcon size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="定位节点…" />
            </label>
          </div>
          <Graph
            nodes={data.nodes}
            edges={data.edges}
            selected={selectedNode}
            onSelect={selectNode}
            query={query}
            layers={layers}
          />
        </Panel>

        <Panel
          idx="02"
          title={selectedTopic ? '课题详情' : node ? '节点详情' : '图谱导览'}
          sub="DETAIL"
          className="universe-side"
          bodyClass="tight"
          aside={
            selectedTopic ? (
              <button className="btn" type="button" onClick={() => selectTopic(null)}>
                返回导览
              </button>
            ) : (
              <span className="panel-note">{node ? LAYER_META[node.layer].label : '产业研究'}</span>
            )
          }
        >
          {selectedTopic ? (
            <div className="topic-detail">
              <span className="chip chip--brass">{selectedTopic.kind}</span>
              <h3 className="serif topic-detail-title">{selectedTopic.title}</h3>
              <p className="topic-detail-summary">{selectedTopic.summary}</p>
              <ul className="topic-points">
                {selectedTopic.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <div className="node-section">
                <span className="label">关联节点</span>
                <div className="node-chips">
                  {selectedTopic.related.map((id) => {
                    const rel = data.nodes.find((n) => n.id === id);
                    if (!rel) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="node-chip"
                        onClick={() => {
                          selectTopic(null);
                          selectNode(id);
                        }}
                      >
                        <span className="dot" style={{ background: LAYER_META[rel.layer].color }} />
                        {rel.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="node-section">
                <span className="label">延伸阅读</span>
                <div className="related-topic-list">
                  {data.topics
                    .filter((t) => t.id !== selectedTopic.id)
                    .slice(0, 3)
                    .map((t) => (
                      <button key={t.id} type="button" onClick={() => selectTopic(t.id)}>
                        <span>{t.title}</span>
                        <span className="num">{t.kind}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : node ? (
            <div className="node-detail">
              <div className="node-detail-head">
                <span className="chip" style={{ color: LAYER_META[node.layer].color, borderColor: 'currentColor' }}>
                  <span className="dot" />
                  {LAYER_META[node.layer].label}
                </span>
                <button className="btn" type="button" onClick={() => selectNode(null)}>
                  清除选择
                </button>
              </div>
              <h3 className="serif node-detail-name">{node.name}</h3>
              <p className="node-detail-note">{node.note}</p>
              <div className="node-tags">
                {node.tags.map((tag) => (
                  <span className="chip chip--ghost" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              <div className="node-section">
                <span className="label">关联节点 · {neighbors.length}</span>
                <div className="node-chips">
                  {neighbors.slice(0, 10).map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      className="node-chip"
                      onClick={() => selectNode(rel.id)}
                    >
                      <span className="dot" style={{ background: LAYER_META[rel.layer].color }} />
                      {rel.name}
                    </button>
                  ))}
                </div>
              </div>

              {relatedTopics.length > 0 && (
                <div className="node-section">
                  <span className="label">相关课题</span>
                  <div className="related-topic-list">
                    {relatedTopics.map((t) => (
                      <button key={t.id} type="button" onClick={() => selectTopic(t.id)}>
                        <span>{t.title}</span>
                        <span className="num">{t.kind}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {STOCK_BY_NODE[node.id] && (
                <Link className="btn primary node-stock-link" to={`/stocks/${STOCK_BY_NODE[node.id]}`}>
                  查看个股结构 →
                </Link>
              )}

              <div className="node-footnote">
                沿着关系继续探索，直到落到可以验证的数据与公司。
              </div>
            </div>
          ) : (
            <div className="universe-intro">
              <span className="label">GRAPH OVERVIEW</span>
              <h3 className="serif">从宏观到公司</h3>
              <p>
                知识宇宙把研究拆成五个层次：宏观变量决定估值环境，中观产业决定景气方向，微观环节决定利润分配，方法帮助判断节奏，最终落到可交易的公司。
              </p>
              <div className="layer-list">
                {LAYER_ORDER.map((layer) => (
                  <div className="layer-row" key={layer}>
                    <span className="dot" style={{ background: LAYER_META[layer].color }} />
                    <span className="layer-name">{LAYER_META[layer].label}</span>
                    <span className="layer-desc">{LAYER_META[layer].desc}</span>
                    <span className="num layer-count">{layerCounts.find((l) => l.layer === layer)?.count}</span>
                  </div>
                ))}
              </div>
              <div className="universe-topics">
                <span className="label">精选课题</span>
                {data.topics.map((t) => (
                  <button key={t.id} type="button" className="universe-topic-row" onClick={() => selectTopic(t.id)}>
                    <span>{t.title}</span>
                    <span className="num">{t.kind}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="topic-grid">
        {data.topics.map((t) => (
          <button type="button" className="topic-card" key={t.id} onClick={() => selectTopic(t.id)}>
            <div className="topic-card-head">
              <span className="label">{t.kind}</span>
              <span className="num topic-card-count">{t.related.length} 关联</span>
            </div>
            <h4 className="serif">{t.title}</h4>
            <p>{t.summary}</p>
            <span className="topic-card-link">进入课题 →</span>
          </button>
        ))}
      </div>

      <PageFoot source={data.source.provider} />
    </div>
  );
}
