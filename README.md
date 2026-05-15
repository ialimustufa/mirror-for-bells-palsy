# Mirror for Bell's Palsy

Mirror is a local-first facial retraining companion for Bell's palsy practice. It guides gentle facial exercises, tracks webcam landmarks with MediaPipe Face Landmarker, and shows real-time left/right symmetry against your own neutral baseline.

Important: Mirror supports practice and self-tracking, but it does not diagnose, grade paralysis, prescribe treatment, or replace medical care. Work with a qualified clinician and stop any exercise that causes pain, strain, or discomfort.

## Try It

- How it works, for anyone to try: [mirror-for-bells-palsy.onrender.com/try](https://mirror-for-bells-palsy.onrender.com/try)
- Full practice app for folks who have Bell's palsy: [mirror-for-bells-palsy.onrender.com](https://mirror-for-bells-palsy.onrender.com/)

## What Matters

- Guided practice for forehead, eyes, nose, cheeks, mouth, and expression-style movements.
- Neutral calibration and exercise-specific symmetry scoring against the user's own baseline.
- Optional personal movement profile for focus recommendations, dosing, and progress comparison.
- Local session history, journal entries, streaks, reports, and progress charts.
- Camera processing runs in the browser. There is no backend service in this codebase.

## Back Story

Last week, I hit rock bottom. I was diagnosed with Bell's palsy, and my right face got paralysed; I honestly wondered how I was going to get through it. I vibe-coded my way out and built an AI face tracking app that guides my facial exercises, measures facial symmetry in real time, and tracks my progress.

More information is available in [this LinkedIn post](https://www.linkedin.com/posts/ialimustufa_last-week-i-hit-rock-bottom-i-was-diagnosed-ugcPost-7458136477626093570-PIFK).

## Quick Start

```bash
npm install
npm run dev      # starts Vite on http://127.0.0.1:5173
npm run build    # production bundle
npm run lint
```

Routes:

- `/try` - standalone face tracker demo
- `/` - main practice flow

## Documentation

- [Data privacy policy](PRIVACY.md)
- [Features and workflows](docs/features-and-workflows.md)
- [Development guide](docs/development.md)
- [Architecture and project map](docs/architecture.md)
- [Model and scoring](docs/model-and-scoring.md)
- [Privacy and medical notes](docs/privacy-and-medical.md)

## License

Mirror is free for personal, non-commercial use. Commercial use requires prior written permission from Ali Mustufa. See [LICENSE](LICENSE) for details and contact via [LinkedIn](https://www.linkedin.com/in/ialimustufa/).

## Made By

**Ali Mustufa**

- X / Twitter: [@ialimustufa](https://x.com/ialimustufa)
- LinkedIn: [in/ialimustufa](https://www.linkedin.com/in/ialimustufa/)

## Thanks

Huge thanks to **Vaibhav (VB) Srivastav** from OpenAI for 6 months of ChatGPT Pro (worth ~$600). It directly funded the usage of Codex 5.5 that went into shipping this.

## Built With

- [Google MediaPipe Tasks Vision Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) - 478-point face mesh + ARKit-style blendshapes
- [Pieces AI](https://pieces.app/) - developer memory and research workflow
- OpenAI Codex 5.5 - scoring algorithms, refactors, and code review
- Claude Opus 4.7 (Anthropic) - pair-programming, refactors, UI
