import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import './styles/landing.css';
import './styles/workspace.css';
import './styles/doc-base.css';
import './styles/layouts.css';
import './styles/print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
