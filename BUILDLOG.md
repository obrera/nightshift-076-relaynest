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
- Model metadata: GPT-5, CLI coding agent, UTC artifact review 2026-05-04T11:27:00Z
- Reasoning: implement the requested wallet-first relay concept as a Hono API plus Vite React dispatch board, keeping neighborhood relay state in SQLite while surfacing MPL Core readiness from the required package.

### Solana disclosure

RelayNest requires `@obrera/mpl-core-kit-lib` and exposes MPL Core program readiness from the backend. Dispatch state is off-chain; no MPL Core mint/claim flow is included in this build.

### Wallet-auth correction

The initial 076 shipment mislabeled hardcoded demo wallet buttons as a wallet-first SIWS path. The correction removes those demo buttons, adds `@wallet-ui/react`, renders a real wallet selector, and verifies native `solana:signIn` payloads on `/api/auth/verify` before creating the session cookie.

### Deployment notes

- Dockerfile builds the Vite client and Hono server, then runs one Node runtime container.
- Runtime listens on internal `PORT=3000`.
- `docker-compose.yml` has no host port mapping for Dokploy-managed routing.
- Persistent SQLite data is mounted at `/data/relaynest.db`.

### Validation notes

- Required dependency retained: `@obrera/mpl-core-kit-lib`.
- Wallet UI dependency added: `@wallet-ui/react`.
- Forbidden dependencies/imports absent: `@solana/web3.js`, `@solana/wallet-adapter-react`.
- Validation commands run for correction: `npm run typecheck`, `npm run build`, local `/api/bootstrap` and `/api/auth/nonce` smoke tests, and local responsive check at `http://127.0.0.1:3076`.
