export function PageFoot({ source = '演示数据' }: { source?: string }) {
  return (
    <footer className="page-foot">
      <span>STRUCTURE TERMINAL · {source} · 仅供研究，不构成投资建议</span>
      <span className="hint">
        <kbd className="kbd">⌘</kbd>
        <kbd className="kbd">K</kbd>
        全局检索
      </span>
    </footer>
  );
}
