/**
 * Entry point
 * ---------------------------------------------------------------------------
 * Mounts the app and pulls in the global stylesheet (which itself imports the
 * design tokens). Every other stylesheet in the project is a CSS Module,
 * imported by the component that uses it.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  // StrictMode double-invokes effects in development to surface bugs. The
  // hooks in this app are written to tolerate that — see the tracking guard
  // in `useBackground`.
  <StrictMode>
    <App />
  </StrictMode>,
);
