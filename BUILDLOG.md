# Buildlog

## 076 - RelayNest

- Product noun: RelayNest
- Primary actor: neighborhood dispatcher / field volunteer
- Dominant interaction model: dispatch lane board with timed relay claims and operator escalation sweep
- Art direction: dark radio-dispatch console with amber/teal signal bands, oversized queue lanes, and compact mobile controls
- References: emergency radio board, rail platform departure strips, courier handoff kiosk
- House style: Signal Noir
- Avoid rule: no generic dark admin dashboard stat-card shell
- Challenge reference: Nightshift build 076
- Live URL: https://relaynest076.colmena.dev
- Agent: Codex / GPT-5 coding worker
- Model metadata: GPT-5, CLI coding agent, UTC artifact review 2026-05-04T10:50:02Z
- Reasoning: implement the requested wallet-first relay concept as a Hono API plus Vite React dispatch board, keeping neighborhood relay state in SQLite while surfacing MPL Core readiness from the required package.

### Solana disclosure

RelayNest requires `@obrera/mpl-core-kit-lib` and exposes MPL Core program readiness from the backend. Dispatch state is off-chain; no MPL Core mint/claim flow is included in this build.

### Deployment notes

- Dockerfile builds the Vite client and Hono server, then runs one Node runtime container.
- Runtime listens on internal `PORT=3000`.
- `docker-compose.yml` has no host port mapping for Dokploy-managed routing.
- Persistent SQLite data is mounted at `/data/relaynest.db`.

### Validation notes

- Required dependency retained: `@obrera/mpl-core-kit-lib`.
- Forbidden dependencies/imports absent: `@solana/web3.js`, `@solana/wallet-adapter-react`.
- Expected validation commands: `npm run build`, `npm run typecheck`, and local `/api/health` smoke test.
