import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initializePerformanceMetrics} from './lib/performanceMetrics.ts';
import './index.css';

initializePerformanceMetrics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
