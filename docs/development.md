# Development Guide

## Local Development

```bash
npm install
npm run dev      # starts Vite on http://127.0.0.1:5173
npm run build    # production bundle
npm run lint
```

Routes:

- `/` - main practice flow
- `/trial` - standalone tracker demo

## Browser Requirements

- A modern browser with camera access.
- Permission for the front camera.
- WebAssembly support.
- WebGL / GPU support recommended for MediaPipe runtime performance.

If the model or camera is unavailable, the app still allows unscored guided practice.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Recharts for progress charts
- Lucide React for icons
- Google MediaPipe Tasks Vision Face Landmarker, loaded at runtime from CDN
- IndexedDB for local persistence of sessions, profiles, and report images
