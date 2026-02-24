# Reliability Phase 19: Local Storage Governance

## Goal
Harden client-side persistence for reliability-sensitive flows without changing domain behavior.

## Implemented
- Added resilient storage envelope in `/src/shared/lib/localDb.ts`:
  - Versioned payload format (`__storageVersion: 1`)
  - Optional `expiresAt` for TTL-based invalidation
  - `updatedAt` timestamp for diagnostics and future migrations
- Added safe storage operations:
  - Parse/storage failures return fallback values
  - Expired entries are removed automatically
  - Quota/storage errors are swallowed to avoid UX crashes
- Preserved backward compatibility:
  - Legacy plain JSON entries are still readable
- Added auth cache TTL policy:
  - `AUTH_STORAGE_TTL_MS = 12h` in `/src/features/auth/model/constants.ts`
  - Applied to all auth writes in `/src/features/auth/model/AuthProvider.tsx`

## Why this matters
- Prevents stale auth/session residue from living forever in localStorage.
- Reduces reliability issues caused by malformed/old entries.
- Establishes a migration-ready storage shape for future phases.

## Non-goals in this phase
- No server/session behavior changes.
- No role or entitlement logic changes.
- No UI flow changes.

## Next candidates
- Optional TTL for selected non-critical caches.
- Background cleanup sweep for known volatile keys.
