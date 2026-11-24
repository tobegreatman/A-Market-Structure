import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/fonts.css';
import './design/tokens.css';
import './design/shell.css';
import './design/components.css';
import './design/modules.css';

const root = document.getElementById('root');
if (!root) throw new Error('未找到 root 节点');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
