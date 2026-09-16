import './style.css';
import '@fontsource/rajdhani/latin-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import favicon from '../assets/brand/hud-ini-icon.svg';

document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href = favicon;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
