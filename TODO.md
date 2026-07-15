# TODO

## In progress

## Todo

### Parla Pro — real in-app purchase (auto-renewing subscription via RevenueCat)

Goal: replace the stubbed `purchasePro()` with a real StoreKit subscription, managed
through RevenueCat. Free tier stays as-is (5 AI conversations per rolling hour, already
implemented in `storage.ts` + gated in `DialogScreen.askAI`). Pro removes the limit.

**Already built — do NOT redo:** free-tier quota (`FREE_PER_HOUR=5`, `recordUsage`,
`usageInLastHour`), `isPaywallActive`, `Paywall` modal, `isPro` flag + Settings toggle,
quota badge, paywall copy in ~7 languages, dev/Debug paywall bypass.

**What's actually missing:** the purchase itself + entitlement source of truth.

#### 1. App Store Connect setup (manual, outside repo)
- [ ] Create an **auto-renewing subscription** group "Parla Pro" with products:
      monthly (`parla_pro_monthly`) and yearly (`parla_pro_yearly`); set intro/price.
- [ ] Fill subscription metadata + localized display names; add to app's IAP section.
- [ ] Agree to Paid Apps agreement / banking + tax if not already done.

#### 2. RevenueCat setup (manual, outside repo)
- [ ] Create RevenueCat project, add the iOS app (bundle id from `app.json`).
- [ ] Register both products; define entitlement `pro`; attach products to it.
- [ ] Configure an Offering with the two packages; grab the public SDK API key.

#### 3. Wire the SDK (Expo SDK 56 — prebuild; app already has native `ios/`)
- [ ] `npx expo install react-native-purchases` (+ config plugin if required).
- [ ] Add the RevenueCat public key via `EXPO_PUBLIC_*` env (mirror `.env.dev` pattern).
- [ ] `npx expo prebuild` / pod install; verify build in local Xcode Release.
- [ ] Create `src/purchases.ts`: `initPurchases()`, `getOfferings()`,
      `purchasePackage()`, `restore()`, `getIsPro()` (reads `pro` entitlement).
- [ ] Call `initPurchases()` once on app start in `App.tsx`.

#### 4. Replace the stubs (`App.tsx`)
- [ ] `purchasePro()` → present offering, call `purchasePackage()`, on success set
      `isPro` from the `pro` entitlement (not unconditionally). Handle user-cancel &
      errors with existing Alert i18n keys.
- [ ] `restorePurchases()` → `Purchases.restorePurchases()`, set `isPro` from entitlement,
      reuse `alert.restoreTitle` / `alreadyPro` / `noPurchases`.
- [ ] Make entitlement the source of truth: on launch + on `CustomerInfo` updates, sync
      `settings.isPro` to the live `pro` entitlement (so lapsed/expired subs re-lock).
- [ ] Decide fate of the manual Settings `isPro` toggle (`setPro`) — keep dev-only /
      remove from Release UI so users can't self-grant Pro.

#### 5. Paywall UX polish
- [ ] Show real localized price(s) from the RevenueCat offering in `Paywall` +
      Settings (replace hardcoded copy).
- [ ] Add required legal: subscription terms, auto-renew disclosure, links to Terms &
      Privacy (App Review rejects subs without these).
- [ ] Add "Restore purchases" entry point on the paywall (currently only in Settings).

#### 6. Test & verify
- [ ] StoreKit sandbox test: purchase, cancel, restore, expiry re-lock.
- [ ] Verify free user still blocked at 5/hr and unblocked immediately after purchase.
- [ ] Confirm dev env still bypasses paywall; Release gates correctly.

**Open follow-ups / decisions:**
- Cross-device: RevenueCat entitlements are per-Apple-ID, so Pro follows the user across
  devices for free — good fit with the existing iCloud data sync. Confirm the desktop
  (Electron) app's Pro story separately (it has no StoreKit).
- Server-side API key: users currently run on a shared `EXPO_PUBLIC_OPENAI_API_KEY`
  baked into the build. A subscription that gates *your* API spend really wants requests
  proxied through a backend keyed on the RevenueCat entitlement — otherwise the rate
  limit is only client-enforced and the key is extractable. Flag as a security/cost item.

## Done
