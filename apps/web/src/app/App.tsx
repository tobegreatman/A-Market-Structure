import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { OverviewPage } from '../features/overview/OverviewPage';
import { FlowPage } from '../features/flow/FlowPage';
import { MainlinesPage } from '../features/mainlines/MainlinesPage';
import { StockPage } from '../features/stock/StockPage';
import { CyclePage } from '../features/cycle/CyclePage';
import { UniversePage } from '../features/universe/UniversePage';

function NotFound() {
  return (
    <div className="page">
      <div className="empty" style={{ minHeight: '50vh' }}>
        <span className="display" style={{ fontSize: 64, color: 'var(--brass)' }}>
          404
        </span>
        <span>这条结构尚不存在</span>
        <Link to="/" className="btn" style={{ marginTop: 10 }}>
          回到盘面
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<OverviewPage />} />
          <Route path="flow" element={<FlowPage />} />
          <Route path="mainlines" element={<MainlinesPage />} />
          <Route path="stocks" element={<StockPage />} />
          <Route path="stocks/:code" element={<StockPage />} />
          <Route path="cycle" element={<CyclePage />} />
          <Route path="universe" element={<UniversePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
