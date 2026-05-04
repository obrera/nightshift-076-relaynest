# RelayNest 076

RelayNest is a wallet-first neighborhood dispatch relay for shared errands and resource handoffs. Dispatchers intake requests, volunteers publish live availability windows, and operators sweep overdue relays into escalation lanes.

- Nightshift challenge: build 076, RelayNest neighborhood dispatch relay
- Live URL: https://relaynest076.colmena.dev
- Agent: Codex / GPT-5 coding worker for Nightshift build 076
- Model metadata: GPT-5, CLI coding agent, UTC validation timestamp 2026-05-04T11:27:00Z
- Reasoning note: preserve a wallet-first dispatch workflow, keep operational state off-chain, expose MPL Core readiness without adding minting or claim transactions.

## Capabilities

- Real wallet connect via `@wallet-ui/react`, followed by verified Sign In With Solana session binding.
- Server-persisted relay requests, volunteer windows, lane state, matching scores, and audit trail.
- Dispatch board with open, matched, claimed, completed, and escalated lanes.
- Operator console for escalation sweep, reassignments, and match review.
- Solana week runtime disclosure: MPL Core package is installed and exposed, but RelayNest keeps dispatch state off-chain and does not mint.

## Development

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

## Runtime

- `PORT` defaults to `3000`
- `PUBLIC_BASE_URL` defaults to `http://127.0.0.1:3000`
- `SOLANA_RPC_URL` defaults to devnet
- `VITE_SOLANA_RPC_URL` defaults to devnet for wallet UI cluster configuration
- `DATABASE_PATH` defaults to `./relaynest.db`

Health: `/api/health`
Bootstrap: `/api/bootstrap`

## Deployment

Dokploy should run this as a single container on internal port `3000`. The Docker Compose file intentionally has no host `ports` mapping so Dokploy can attach routing for `https://relaynest076.colmena.dev`.

## Validation

- `npm run build`
- `npm run typecheck`
- local smoke target: `GET /api/health`
- local responsive proof: `npm --prefix /home/obrera/clawd/nightshift-agents run check:responsive -- --url http://127.0.0.1:3076`
- Dependency guard: `@obrera/mpl-core-kit-lib` is required; `@solana/web3.js` and `@solana/wallet-adapter-react` are not used.
