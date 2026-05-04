# RelayNest 076

RelayNest is a wallet-first neighborhood dispatch relay for shared errands and resource handoffs. Dispatchers intake requests, volunteers publish live availability windows, and operators sweep overdue relays into escalation lanes.

## Capabilities

- Wallet/SIWS-shaped sign-in with a demo wallet fallback for non-wallet browsers.
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
- `DATABASE_PATH` defaults to `./relaynest.db`

Health: `/api/health`
Bootstrap: `/api/bootstrap`
