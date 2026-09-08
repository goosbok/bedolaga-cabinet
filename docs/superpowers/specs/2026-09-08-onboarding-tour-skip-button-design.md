# Onboarding tour: soft skip button + start gate for established users

Date: 2026-09-08
Branch: `feature/onboarding-skip-button` (based on `feature/partner-commission-payment-limit`)

## Problem

Two related gaps in the onboarding tour (`src/components/Onboarding.tsx`,
`src/components/OnboardingRunner.tsx`, `src/store/onboarding.ts`,
`src/pages/Dashboard.tsx`):

1. **No visible way out, and the only way out is permanent.** The tooltip has
   no "Skip" button (removed in `b0d9a64 feat(onboarding): drop the visible
   skip button`). The only exit is the Escape key, which calls
   `useOnboardingStore.skip()` — this writes `onboarding_completed` to
   `localStorage` **forever**. There is no "not now" option; a user who wants
   to come back to the tour later has no way to say so.

2. **The tour restarts for users who are obviously not new.** `start()` in
   the store only checks `hasStarted` (this tab) and the persisted
   `onboarding_completed` flag (this browser). It never checks
   `hasEverConnected` (traffic on any subscription), which is already
   computed by `Dashboard.tsx` for both single- and multi-tariff accounts.
   Result: an established user opening the cabinet from a browser/device that
   has never run this tour shows it — reported live: a user with an active
   "Максимум" subscription (id 77) got the welcome tour on a computer he'd
   never used the cabinet from before, despite having used the VPN for a
   long time.

## Design

### 1. Soft skip — visible button, Escape becomes non-permanent too

- Add a visible button in `Onboarding.tsx`'s action row (next to
  "Next"/"Finish"), wired to the existing `onSkip` prop. Copy: "Пройти в
  другой раз" (ru) — reuses the existing-but-unused `onboarding.skip`
  translation key across all four locales (ru/en/zh/fa), with the text
  updated everywhere to the softer "do it another time" framing instead of
  "Skip"/"Пропустить".
- Shown on every step, including `awaitsUserAction` steps that currently hide
  "Next" — Escape already exits from those steps today, so this only makes
  an existing exit visible, it does not add a new one.
- Change `useOnboardingStore.skip()`: stop calling `writeFlag()`. It now just
  does `set({ isRunning: false })` — the tour is closed for this session but
  not marked done. Escape is already wired to this same action, so it
  inherits the new behavior with no separate change.
- Update the stale comments in `Onboarding.tsx` and `onboarding.ts` that
  document the old "Skip is forever, the only way out" contract.
- Net effect: `onboarding_completed` in `localStorage` is now written only by
  `complete()` (and only when `shouldPersistCompletion` is true — connect
  step reached AND real traffic). Skip/Escape no longer contribute to
  permanent dismissal. A user who exits early sees the tour again next visit
  unless they actually connect in the meantime — matching "skip until the
  next connection."

### 2. Don't start the tour for users who are already connected

- `start()` gains one more early-out: bail if `get().hasEverConnected` is
  already `true` at call time. `hasEverConnected` is already published by
  `Dashboard.tsx` for both tariff modes from data already being fetched — no
  new API calls.
- This is additive to the existing `readFlag()` check, not a replacement:
  `readFlag()` still matters for the case where `hasEverConnected` later
  becomes false again (e.g. a `traffic_reset_mode` period rollover) after the
  user genuinely finished the tour once — the persisted flag is the durable
  memory, `hasEverConnected` is the live "obviously not new" fast path.

### 3. Fix a load-order race that would undermine #2 in multi-tariff mode

- The 500ms start-timer effect in `Dashboard.tsx` currently gates only on
  `subLoading` (the single-tariff subscription query — disabled and always
  "not loading" in multi-tariff mode) and `refLoading`. It does not wait for
  `multiSubData` (`['subscriptions-list']`), which is what `hasEverConnected`
  is computed from in multi-tariff mode.
- Fix: capture that query's own `isLoading` and add it to the start-timer
  gate, so `hasEverConnected` is settled before the timer's 500ms fires and
  `start()` reads it.

## Out of scope

- Changing what "connected" means beyond the existing traffic-based
  `hasEverConnected` signal (e.g., a literal device-count check). The
  reported bug is fully explained and fixed by wiring up the signal that
  already exists; a device-count check would need a new per-subscription API
  call in multi-tariff mode with no evidence it is needed.
- Any change to `abort()` (engine gives up because a step's target never
  rendered) — already non-persistent, already correct for this design's
  goals.
- Reconciling local `main`/`prod` branches with `origin/main` or the
  upstream. This branch is based on `feature/partner-commission-payment-limit`,
  which is the only branch with the current onboarding tour code; the
  broader branch/sync situation is a separate, pre-existing problem not
  touched here.

## Testing

- Unit tests in the onboarding store test file:
  - `skip()` no longer persists `onboarding_completed`.
  - `start()` is a no-op when `hasEverConnected` is already `true`, even with
    no persisted flag and steps available.
- Manual check on cabinet staging (`max-vpn.online:8443`, shares prod
  backend/DB — memory: `reference_cabinet_staging`): an account with real
  historical traffic should not see the tour at all; a fresh account should
  see the new skip button, and using it should bring the tour back on the
  next load without connecting.
