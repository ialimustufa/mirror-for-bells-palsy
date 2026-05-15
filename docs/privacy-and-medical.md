# Privacy And Medical Notes

For the public-facing policy, see [Data Privacy Policy](../PRIVACY.md).

## Data And Privacy

- Camera frames are processed in the browser by the MediaPipe model. No video, landmarks, or scores are sent to any server.
- Session records persist exercise scores, timestamps, dose settings, and snapshot counts.
- Report images are stored locally in IndexedDB as separate image blobs so past physiotherapy PDFs can be regenerated without bloating session JSON.
- Movement profiles include neutral landmark data, noise floor data, and per-exercise baseline metrics.
- The first saved profile is kept as `initialMovementProfile` for long-term recovery comparison; the current `movementProfile` can be updated through full or partial retakes.
- When the full profile is retaken, the previous profile is kept as a compact history record. Raw neutral landmarks and noise-floor arrays are not duplicated into history.
- When only weak exercise baselines are retaken, those entries are merged into the current profile without archiving or replacing the rest of the baseline.
- App state is persisted locally in IndexedDB under `mirror-db`, with `appState`, `sessions`, and `sessionImages` stores.
- The legacy `mirror-app-data` localStorage record is migrated once and removed after a successful migration.
- There is no backend service in this codebase.

## Medical Disclaimer

Mirror is designed for guided practice and self-tracking. It does not diagnose Bell's palsy, grade facial paralysis, prescribe treatment, or replace professional care.

Users should work with a qualified clinician and stop any exercise that causes pain, strain, or discomfort.
