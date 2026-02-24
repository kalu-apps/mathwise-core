# Reliability / Performance Phase 12

## Objective

Add deterministic smoke coverage for degraded network conditions:

1. slow 3G
2. offline -> reconnect
3. lossy API transport

This phase validates resilience behavior end-to-end in browser runtime without changing business logic.

## Added

### Network smoke runner

File: `scripts/reliability-network-smoke.mjs`

Scenarios:

1. `slow-3g`
   - applies Chromium network emulation (`latency + low throughput`)
   - verifies key pages remain interactive
2. `offline-recover`
   - forces offline mode
   - verifies offline connectivity banner visibility
   - restores connection and verifies recovery path
3. `lossy-api`
   - aborts ~20% of `/api/**` requests
   - verifies degraded/offline connectivity signal appears

### npm command

`package.json`:

- `smoke:network` -> `node scripts/reliability-network-smoke.mjs`

## Notes

- Runner supports:
  - internal server mode (`dev` / `preview`)
  - external mode (`NETWORK_SMOKE_SERVER=external` + `NETWORK_SMOKE_BASE_URL`)
- No domain-state transitions or UI contracts were changed.
- This phase complements Phase 11 SLO gate; it does not replace it.

## Run

```bash
npm run smoke:network
```

External server example:

```bash
NETWORK_SMOKE_SERVER=external NETWORK_SMOKE_BASE_URL=http://127.0.0.1:5173 npm run smoke:network
```
