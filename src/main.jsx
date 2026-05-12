import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Polyfill window.storage using localStorage so the app
// can persist data without needing a native storage bridge.
if (!window.storage) {
  window.storage = {
    get: (key) =>
      Promise.resolve({ value: localStorage.getItem(key) }),
    set: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      localStorage.removeItem(key);
      return Promise.resolve();
    },
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
