# Mesa · PAPER desk

A plain HTML/CSS/JavaScript, mobile-first dashboard for the **simulated** Solana trading desk. Deployed with GitHub Pages from `main` at the repository root. There is no framework, chart library, build step, backend, order-placement code, analytics, or third-party browser script.

## Public app and private data link

**App:** <https://miguel-barros.github.io/mesa-paper/>

Live numbers are not embedded in the app shell. The exporter stores them under a random, URL-safe `d/<private-path>/` directory. Open the app with the separately supplied `#d=<private-path>` fragment. JavaScript saves that key to this browser's `localStorage` and removes the fragment from the visible URL/history where the browser permits it.

### This is obscurity, not true access control

GitHub Pages is public and static. It **cannot authenticate users or return 401/404 based on a secret**. Anyone who has the full app link or private data URL can read the simulated data. The app shell, repository, file paths, and JSON are publicly retrievable. Do not publish or forward the private link. Bare `/d/` serves a static explanatory page, not a directory listing.

The private path is generated once and stored at `/workspace/desk/private/data_path` with mode `0600`, outside this repository. It must not be pasted into tracked file contents, commit messages, issue reports, logs, or screenshots. The random directory name itself is necessarily present in the public Git tree because Pages serves files from that tree.

## Data and update loop

The desk module `/workspace/desk/exporter.py` opens the existing SQLite WAL database read-only and writes `state.json`, `chart.json`, `activity.json`, and `coin/{mint}.json` atomically using temporary files and rename. Snapshots refresh every 15 seconds. A serialized Git publisher stages only the private data directory, commits meaningful changes, and coalesces pushes to about once per minute; unchanged snapshots do not create commits. The process-local publisher and `.exporter-push.lock` protect concurrent Git operations. Credentials are removed from Git subprocess environments. Git identity is repository-local.

- `state.json`: balance, today percentage, multiplier, PAPER mode, night boundary, timestamps, five agents with counts/current metrics/last decision/up to 20 recent decisions, positions, and allow-listed settings.
- `chart.json`: stored balance samples and buy/sell marks. One sample produces a baseline, not invented history.
- `activity.json`: latest 30 activity rows with coin links constructed from the mint.
- `coin/{mint}.json`: last stored price, one-minute OHLC candles aggregated from stored prices, available scanner stats, position and entry/stop/exit lines, audit layers, and analyst rules scores.

Missing records stay `null`, empty arrays, or explicit empty states. No trades, balances, candles, or decisions are fabricated. The frontend polls with cache busting every 15 seconds. On an error it retains the last valid snapshot; without one it shows a clear error/empty state.

## Browser behavior

Bottom tabs: **Home**, **Agents**, **Activity**, and **Account**. Home contains balance, daily change, multiplier, responsive device-pixel-ratio-aware canvas charts/ranges, an agent carousel, and recent activity. Agents is read-only. Activity opens coin/audit detail. FOMO buttons are external links only; they never place orders. Account shows read-only PAPER settings, the simulated stack, the Telegram owner-control bot, and the direct FOMO profile link.

The app uses a black iPhone-style layout with safe-area padding, loading/empty/error states, PWA manifest/icons, and `prefers-reduced-motion` support. Web push is **not available in plan B**; notifications stay in Telegram. There are no referral or invite parameters.

## Local verification

```bash
node --check app.js
cd /workspace/desk && /workspace/desk-venv/bin/python -m pytest -q
```

The browser can be tested with any headless Chromium-compatible runner at a 390 px viewport. Test fixtures must be clearly synthetic and must never be published as live desk data.
