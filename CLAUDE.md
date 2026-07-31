# yaply-native — Codebase Reference

## What This Is

The React Native / Expo client for yaply — TypeScript, built on Expo SDK 57 / React Native 0.86. **Replaces `yaply-ios`** (Swift/SwiftUI, deprecated — see `../CLAUDE.md`'s Sister Projects table). The reason for the switch wasn't technical debt in the Swift app; it's that SwiftUI's native look didn't allow the design customizability wanted — yaply-native aims for a more **Meta Messenger–esque** feel (bold color, playful bubbles, fluid gesture-driven interactions, per-conversation theming) — and one React Native codebase can eventually cover both iOS and Android instead of maintaining two separate native apps. **iOS is the priority target for now**; Android support follows once iOS is solid, using the same codebase.

This is a monorepo sibling of the web app. The parent directory (`../`) contains the React web app and is the canonical backend spec — same Supabase project, same database, same auth, same realtime channels. **E2E encryption must produce byte-for-byte identical output to the web app or cross-platform messages break.** Read `../CLAUDE.md` for the full backend schema, encryption contract, and platform-choice rationale.

`yaply-ios/CLAUDE.md` is still worth reading for the encryption/schema contract (the backend hasn't changed) but its SwiftUI implementation patterns, MVVM/`@Observable` architecture, and `Known Issues to Fix` list are Swift-code specifics that don't apply here — see **Relationship to yaply-ios** at the bottom of this file.

---

## Critical: Encryption Wire Format v2 (envelope encryption)

> **⚠️ NOT YET IMPLEMENTED.** Until this is built, yaply-native cannot read or
> write messages the web app produces. This section is the contract to build
> against.

**Why v2:** the old scheme published one identity key per user (`device_id`
hard-coded to 1) and every login overwrote it, permanently orphaning every
message sealed under the replaced key. v2 gives each install its own `devices`
row and seals every message to every member device explicitly.

**Runtime crypto:** React Native has no built-in `crypto.subtle`. Use
**`@noble/curves/p256`** (ECDH) + **`@noble/ciphers/aes`** (AES-GCM) — audited
pure-JS, work in Expo Go, no native module/dev-client requirement. Polyfill
`crypto.getRandomValues` via **`react-native-get-random-values`** (imported
once, at the app entry point, before anything else touches crypto).

**Per message:**
1. Generate a random 256-bit AES **message key** (mk) and encrypt the plaintext
   once: `content = base64(ciphertext + tag[16])`, `iv = base64(nonce[12])`,
   `enc_v = 2`. noble's AES-GCM returns ciphertext with the tag already
   appended — do not re-split or re-concatenate it.
2. Generate **one ephemeral P-256 keypair for the message**.
3. For each recipient device (see recipient set below), wrap mk:
   `KEK = ECDH(ephemeral private, device public)`, then
   `wrapped_key = base64(AES-GCM(KEK, raw 32-byte mk) + tag)` with its own
   `key_iv = base64(nonce[12])`.
4. Insert via the **`send_message_with_envelopes` RPC** (message + all envelopes
   in one transaction). It rejects an empty envelope array or a NULL iv.

Key agreement is raw ECDH — **no HKDF** (same as web and the deprecated iOS
app). Confirmed against `@noble/curves@2.2.0`'s actual return shape (see
`src/crypto/envelope.ts`):
```ts
// p256.getSharedSecret(priv, pub, false) returns the full uncompressed shared
// point: 0x04 || x[32] || y[32], 65 bytes. The x-coordinate IS the raw
// AES-256-GCM key — no HKDF, matching WebCrypto's ECDH deriveKey behavior.
const shared = p256.getSharedSecret(myScalar, theirPoint, false)
const kek = shared.slice(1, 1 + 32) // x-coordinate only
```
Verified byte-identical to web's `crypto.subtle`-derived KEK via the
cross-runtime interop script below (not just "looks equivalent" — an envelope
sealed by web is actually decrypted by native and vice versa).

**JWK encoding (the one genuinely new piece of code here):** the DB stores
public keys and fingerprints as WebCrypto JWK (`{kty:"EC", crv:"P-256", x, y,
...}`, base64url unpadded). noble gives raw uncompressed point bytes
(`0x04 ‖ x[32] ‖ y[32]`, 65 bytes total), not JWK. Write:
- `pointToJwk(pubKeyBytes) -> JsonWebKey` — split the 65-byte point into x/y,
  base64url-encode each (unpadded).
- `jwkToPoint(jwk) -> Uint8Array` — inverse, for importing a peer's public key
  into noble.
- `publicKeyFingerprint(jwk) = \`${jwk.x}.${jwk.y}\`` — must match web's
  `packages/crypto/src/encryption.ts` exactly, since `recipient_fp` in the DB
  is compared as a plain string across platforms.

**Recipient set (critical):** every active device (`last_active_at` within 90
days) of every conversation member — **including all of the sender's own
devices**. Omitting your own devices means you cannot read your own sent
messages after a reload. Groups and DMs are handled identically.

**Device registration:** one `devices` row per install. Generate a random
`device_id`, persist it via `expo-secure-store` alongside the identity
keypair, and upsert **only that row** (`onConflict: user_id,device_id`). Never
write `device_id = 1` unconditionally. Publish `key_fingerprint` (JWK `x` +
`"."` + `y`) alongside `identity_key`.

**Decrypt:** fetch this device's envelope for the message
(`recipient_fp == my fingerprint`), unwrap mk with the identity private key +
the envelope's `eph_pub`, then decrypt `content`. Branch on **`enc_v` first**,
then `iv`:
- `enc_v == 2` → envelope path above; **no envelope ⇒ permanent, honest
  "couldn't decrypt"**. Never fall back to decoding raw bytes.
- `enc_v == null && iv == null` → phase-1: `content` is plain base64 UTF-8.
  Decode via `TextDecoder`/`TextEncoder` — **never** RN's `atob`/`btoa`
  polyfill directly on multi-byte text, it is not UTF-8 safe (breaks on
  emoji/non-ASCII, same warning as web).
- anything else → `decryptFailed`.

**Message editing (contract only — no edit UI on any platform):** an edit is a
**re-seal** — new message key, new `content`/`iv`, all envelope rows replaced
in one transaction. Never reuse the old message key.

**Registration must be single-flight:** `useEncryption` may mount from more
than one screen. Concurrent calls on a fresh install would each generate a
different keypair and race to publish, desyncing the local private key from
the published public key. Share one in-flight registration promise per user
(`registrationInFlight: Map<userId, Promise<void>>`), and **await it** before
encrypting or decrypting so a message sent right after login isn't silently
downgraded to phase-1 or reported as a false decrypt failure.

**In-memory key cache must be keyed by userId, never a single mutable slot
(critical):** this is the exact race documented in `../CLAUDE.md` that caused
every message to fail after a fast account switch in one browser tab — a
straggling async call for the old account resolved after the new account's
session reset the cache, and overwrote it with the stale keypair. Use
`identityPairMemCache: Map<userId, pair>`, never a single mutable variable
plus an "owner" check.

Keys are stored as **JWK JSON** (matching web and the deprecated iOS app).

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Expo SDK 57 (managed workflow) | Fast iteration, Expo Go compatibility (no dev-client needed as long as we avoid native modules — which the pure-JS crypto choice preserves), OTA update path later. |
| Language | TypeScript | Matches web repo conventions. |
| Navigation | Expo Router (file-based, `app/` directory) | Expo's recommended default; file-based routing conceptually mirrors web's TanStack Router. Not modeled on the deprecated iOS app's `NavigationStack`/`AppRouter`. |
| Server state | TanStack Query (`@tanstack/react-query`) | Same library as web — same query-key/cache-invalidation conventions (e.g. slash-command creates invalidate the relevant query key). |
| UI/client state | Jotai | Same library as web — atom definitions (`activeConversationIdAtom`, `replyToMessageIdAtom`, `commandFeedbackAtom`) can closely mirror web's. |
| Backend | `@supabase/supabase-js` + `@react-native-async-storage/async-storage` (session persistence) + `react-native-url-polyfill/auto` | Same Supabase project as web — zero backend changes needed. |
| Crypto | `@noble/curves/p256`, `@noble/ciphers/aes`, `react-native-get-random-values` | See Encryption section above. |
| Key storage | `expo-secure-store` | iOS Keychain / Android Keystore under the hood — RN equivalent of web's IndexedDB and the deprecated iOS app's Keychain usage. |
| Styling | Custom `theme.ts` (StyleSheet-based design tokens) | See Design Direction below — deliberately not inherited from web's blue-slate palette or the deprecated iOS app's system defaults. |
| Animation / gesture | `react-native-reanimated` + `react-native-gesture-handler` | Needed for swipe-to-reply, swipe-to-reveal-timestamp, long-press reaction picker, animated bubble entrance — the interaction language that reads as "Messenger-esque." |
| Notifications | `expo-notifications` (local scheduling for reminders now; remote push is future work) | See Feature Map. |

---

## Design Direction

There is no iOS-app equivalent of this section — it's new. The move off SwiftUI was explicitly about wanting more design control, aimed at a **Meta Messenger–esque** feel: bold, colorful message bubbles, fluid gesture-driven interactions (swipe to reply/react, long-press for actions), and room for per-conversation theming (e.g. a per-thread accent color, the way Messenger lets you pick a chat color).

**Deliberately not carried over:**
- Web's blue-slate palette (`#1a2744`, `#5b8def`, `#dce7f8`, `#edf1fa`) is *not* the default for yaply-native. It can be referenced for brand consistency, but the palette here is a separate design decision.
- The deprecated iOS app's SwiftUI system-default look (native alerts, plain `NavigationStack` chrome, `Color+Yaply` extension) is not the target — this app uses custom components (animated popovers instead of native `Alert`, custom bubble/reaction UI) throughout.

**Status:** no palette/component library has been finalized yet. Do a short, deliberate design pass (the `frontend-design` skill can help) once core messaging works and there's a real screen to iterate against, rather than guessing at colors before there's anything to look at. Until then, `theme.ts` should hold placeholder tokens clearly marked as provisional.

---

## Actual Database Schema

The migrations in `../supabase/migrations/` are the source of truth. Same DB, same RLS policies as web and the deprecated iOS app. Copied here for convenience — if this ever drifts from `../CLAUDE.md`, trust the migrations, not this file.

**conversations:** `id, type ('direct'|'group'|'ai'), name, avatar_url, created_by, created_at, updated_at`

**conversation_members:** `conversation_id, user_id, role ('owner'|'admin'|'member'), joined_at, last_read_at, muted_until (timestamptz — null = not muted, future = muted until then, very far future = forever)`

**messages:** `id, conversation_id, sender_id, type ('text'|'image'|'gif'|'sticker'|'system'|...), content (base64 ciphertext+tag or base64 UTF-8 plaintext), iv (base64 nonce[12]; null = phase-1), enc_v (smallint — 2 = envelope-encrypted, null = phase-1), media_url, media_mime, reply_to_id, thread_id, edited_at, deleted_at, created_at`
- Sort order: `created_at DESC`
- System messages: `type = 'system'`, `iv = null`, `enc_v = null`, `sender_id = creator`, `deleted_at = now + 7 days` (auto-destruct, read from the DB — no client-side scheduling)
- Media/sticker/gif messages are **never** encrypted: `content = ''`, `iv = null`, `enc_v = null`

**message_envelopes:** `id, message_id (FK → messages ON DELETE CASCADE), recipient_user_id, recipient_fp (JWK x.y of the recipient device key), eph_pub (JSON-stringified JWK of the message's ephemeral public key), key_iv (base64 nonce[12]), wrapped_key (base64 AES-GCM(KEK, raw mk) + tag), created_at` — UNIQUE(message_id, recipient_user_id, recipient_fp). RLS: SELECT for recipient or the message's sender.

**Key RPCs:**
- `find_or_create_direct_conversation(target_user_id uuid)` — always use this for DMs (security definer, handles RLS).
- `send_message_with_envelopes(p_conversation_id, p_content, p_iv, p_envelopes jsonb, p_type, p_reply_to_id, p_thread_id, p_media_url, p_media_mime)` — the **only** way to send an encrypted message; writes the `enc_v = 2` row and all envelopes atomically.

**profiles:** `id, username, display_name, avatar_url, bio, public_key, is_online, last_seen_at, created_at, updated_at`

**devices:** `user_id, device_id (int — random per install, NOT always 1), identity_key (JSON — JWK public key), key_fingerprint (text — JWK x.y), signed_prekey, device_name, push_subscription, last_active_at, created_at` — UNIQUE(user_id, device_id)

**tasks:** `id, conversation_id, created_by, assigned_to, title, description, status ('todo'|'in_progress'|'done'), priority ('low'|'medium'|'high'), due_at, completed_at, created_at, updated_at` — RLS: conversation members SELECT; creator/assignee UPDATE; creator DELETE.

**notes:** `id, user_id, conversation_id, title, content, created_at, updated_at` — **`user_id`**, not `created_by`. RLS: owner only. (The deprecated iOS app shipped with this bug initially — get it right from the start here.)

**reminders:** `id, user_id, conversation_id, message, remind_at, status ('pending'|'sent'|'dismissed'), created_at` — after migration 00022, all conversation members can view/update/delete. No `target_type` column.

**events:** `id, conversation_id, created_by, name, description, location, status ('planning'|'confirmed'), starts_at, ends_at, created_at, updated_at`

**event_availability:** `id, event_id, user_id, slots (jsonb — ISO datetime strings), updated_at` — UNIQUE(event_id, user_id)

**event_rsvp:** `id, event_id, user_id, response ('going'|'maybe'|'not_going'|'pending'), updated_at` — UNIQUE(event_id, user_id)

**albums:** `id, conversation_id, name, created_by, created_at, event_id (nullable FK → events ON DELETE SET NULL)`

**album_media:** `id, album_id, message_id, media_url, media_mime, created_at`

**budgets:** `id, conversation_id, name, total_amount, currency, created_by, created_at, event_id (nullable FK → events ON DELETE SET NULL)`

**expenses:** `id, budget_id, paid_by, description, amount, category (expense_category enum), split_between (uuid[]), created_at`

**Events availability slot keys (cross-platform contract, non-negotiable):** each slot key is the **UTC ISO string** of the slot start (e.g. `"2025-06-10T14:00:00.000Z"`), 8am–10pm local time in 30-min increments, 7 days × 28 rows. Build local-time `Date`s, then format with a UTC-forced ISO formatter. Any drift breaks heatmap overlap across platforms.

---

## Architecture

```
app/                          ← Expo Router routes
  _layout.tsx                 ← root layout: QueryClientProvider, Stack.Protected auth gate, kicks off device registration
  index.tsx                   ← redirects to (tabs) or (auth)/sign-in based on session
  (auth)/
    sign-in.tsx
    sign-up.tsx
  (tabs)/
    index.tsx                 ← conversation list (search-to-DM, unread badges)
  chat/
    [id].tsx                  ← chat screen (paginated, realtime, reply, soft-delete)
```

Auth gating uses Expo Router's `<Stack.Protected guard={...}>` (SDK 52+) rather
than manual redirects scattered per-screen — `(auth)` is only reachable when
signed out, `(tabs)`/`chat/[id]` only when signed in.

**Pattern:** function components + hooks. Server state via TanStack Query hooks (`useConversations`, `useMessages`, ...), UI state via Jotai atoms. No ViewModel layer — React's own component/hook model replaces the MVVM pattern the deprecated iOS app used, since that pattern existed to compensate for SwiftUI's constraints, not because it's part of the cross-platform contract.

**Real-time:** Supabase Realtime channel per open chat screen, opened on mount and closed on unmount. On any insert/update event, re-fetch via TanStack Query invalidation rather than parsing the realtime payload — keeps decryption logic in exactly one place, same rationale as web.

---

## Project Structure

Target end-state layout; `crypto/`, `lib/supabase.ts`, and the chat `useEncryption` hook exist as of Phase 1, everything else under `features/` is still to come.

```
yaply-native/
├── app/                       ← Expo Router routes (see Architecture above)
├── scripts/
│   └── verify-web-interop.ts  ← dev-only cross-runtime crypto check, `npm run verify:interop`
├── src/
│   ├── crypto/                ← base64.ts, jwk.ts, keys.ts, envelope.ts, keyStore.ts (see Encryption section)
│   ├── lib/
│   │   └── supabase.ts        ← Supabase client singleton
│   ├── features/
│   │   ├── chat/               ← api/, components/, hooks/ (useConversations, useMessages, useEncryption, useRealtimeMessages)
│   │   ├── commands/            ← slash command parser/handlers (hand-copied from web's packages/shared constants — see Relationship to yaply-ios)
│   │   ├── tasks/
│   │   ├── notes/
│   │   ├── reminders/
│   │   ├── events/
│   │   ├── albums/
│   │   ├── budgets/
│   │   └── stickers/
│   └── theme.ts                ← design tokens (see Design Direction)
└── .env.example                 ← EXPO_PUBLIC_* vars, see Configuration
```

---

## Configuration

Copy `.env.example` → `.env` (gitignored) and fill in:
```
EXPO_PUBLIC_SUPABASE_URL=       # Same Supabase project as the web app
EXPO_PUBLIC_SUPABASE_ANON_KEY=  # Same anon key as the web app
EXPO_PUBLIC_GIPHY_API_KEY=      # From Giphy Developer Dashboard
```
The `EXPO_PUBLIC_` prefix is Expo's built-in convention (SDK 49+): values in `.env`
are inlined into the JS bundle at build time and read directly as
`process.env.EXPO_PUBLIC_SUPABASE_URL` — no `app.config.ts`/`expo-constants`
indirection needed for these. (`expo-constants` stays installed for future
native-only config, but isn't the mechanism for these three values.)

---

## Development Notes

- **`react-native-get-random-values` must be imported before any crypto code runs** — put it as the very first import in the app entry point. Without it, `crypto.getRandomValues` is undefined or insecure depending on the environment.
- **Hermes' `atob`/`btoa` are not UTF-8 safe** — always go through `TextEncoder`/`TextDecoder` for phase-1 plaintext, matching the web app's exact warning.
- **Expo Go vs. dev client:** the pure-JS noble crypto choice was made specifically so this app can stay on Expo Go (no custom native module = no dev-client build required). If a future dependency needs a native module, that's a deliberate tradeoff to flag, not something to add casually.
- **`expo-secure-store` value size:** platform limits exist (notably Android Keystore-backed storage), but JWK-sized keys are small enough this shouldn't matter in practice — noted here in case a future change (e.g. storing more per entry) needs to revisit it.
- **In-memory key cache must be `Map<userId, pair>`** — see Encryption section; this is the single most important gotcha carried over from the web app's post-mortem.
- **Notes use `user_id`, not `created_by`** — the deprecated iOS app shipped this bug and had to fix it later; get it right from the start.
- **`expo-doctor` reports a `react` duplicate** (`node_modules/react` vs. `../node_modules/react`, i.e. the sibling `yaply/` web repo's own copy) — this is a false positive from its static directory scan, not a real bundling risk. Metro/Node module resolution always resolves a bare `react` import to the *nearest* `node_modules` first, and `yaply-native/node_modules/react` is always found before Metro would ever walk up to the parent. **Do not "fix" this by setting `resolver.disableHierarchicalLookup = true`** in `metro.config.js` — that was tried and it broke `expo-router`'s own internal module resolution (its `entry.js` → `entry-classic.js` → `@expo/metro-runtime` chain failed to resolve at all with it enabled, confirmed via `npx expo export --platform ios`). Keep `metro.config.js` at Expo's plain default.
- **Command feedback is local-only** — slash command output (help, errors, confirmations) is never written to the DB, only shown to the typing user. The only DB write on command success is a `type='system'` message.

---

## Feature Map

Full feature parity with the deprecated iOS app is the goal, phased as:

### Implemented

| Phase | Feature | Files |
|---|---|---|
| 1 | Encryption layer (crypto wire format v2) | `src/crypto/{base64,jwk,keys,envelope,keyStore}.ts`, `src/features/chat/hooks/useEncryption.ts` — verified byte-interoperable with web via `scripts/verify-web-interop.ts` (`npm run verify:interop`) |
| 2 | Auth, conversation list, DM creation + user search, chat screen (paginated, realtime, reply, soft-delete) | `src/features/auth/useAuth.ts`, `app/(auth)/{sign-in,sign-up}.tsx`, `src/features/chat/{api,hooks}/*`, `app/(tabs)/index.tsx`, `app/chat/[id].tsx`. Device registration is kicked off once in `app/_layout.tsx` (not per-screen) — safe because of `useEncryption`'s single-flight guard. Chat screen works for any conversation (DM or group) once one exists — encryption/decryption/pagination/realtime are conversation-type-agnostic, matching web. Styling is placeholder `theme.ts` tokens, not the Phase 4 design pass. |
| 3 | Slash commands (`/help`, `/remind`, `/mute`) + system message auto-destruct | `src/features/commands/{commandParser,commands,commandRegistry}.ts`, `src/features/commands/handlers/*`, wired into `app/chat/[id].tsx`'s composer. `/task`, `/note`, `/album`, `/budget`, `/plan`, `/poll`, `/event` are recognized but return "not available yet" — real creation is Phase 5's job (matches web's own `createHandler`, which just opens a modal; there's no modal system here yet). Expired (`deleted_at` in the past) system messages are hidden silently, matching web/iOS. Regular deleted messages render an italic "Message deleted" placeholder. **`/thread` is not implemented** — despite the root CLAUDE.md's Cross-Platform Reference section listing it, the actual web `commandRegistry.ts` has no `thread` case (threading is a UI action via reply, not a slash command) — verified by reading web's source directly rather than trusting that doc. |

### Not yet implemented

- **Group creation UI** — no multi-select member picker / `create_group_conversation` RPC call yet, only DM creation via user search. Existing groups (created elsewhere) work fine in the chat screen; there's just no way to create one from this app yet.
- **System message "Open {tab} →" links** — the tab-map hyperlink behavior documented for iOS isn't built here yet since there's nothing to link to until Phase 5 builds Tasks/Notes/etc. screens.
- **Phase 4** — Design system + Messenger-esque interaction layer (bubbles, gestures, reactions)
- **Phase 5** — Tier 3/4 features: Tasks, Notes, Reminders, Events (with availability calendar), Albums, Budgets + Splitwise, Stickers
- **Phase 6** — Media upload, GIF picker, remote push notifications — deferred, matching web's own "not yet integrated" status for these; do not build ahead of what web itself has shipped.

---

## Relationship to yaply-ios

`yaply-ios` (Swift/SwiftUI) is **deprecated**. Its GitHub repo and code remain available but receive no new feature work.

**Still worth reading from `yaply-ios/CLAUDE.md`:**
- The encryption wire-format v2 contract (identical protocol, different runtime primitives — CryptoKit there, noble here).
- The actual (as opposed to aspirational) database schema and RLS gotchas it documents (e.g. `notes.user_id`, `reminders` has no `target_type`).
- The event availability UTC slot-key contract.
- The RPC contracts (`find_or_create_direct_conversation`, `send_message_with_envelopes`).

**Not applicable here — do not port:**
- SwiftUI-specific architecture (MVVM `@Observable` ViewModels, `NavigationStack`/`AppRouter`).
- Its `Known Issues to Fix` list — those are bugs in Swift code that doesn't exist in this codebase.
- Its Tier 2/4 UI implementation notes (gesture recognizers, sheet/alert patterns, SwiftUI-specific layout workarounds) — yaply-native builds its own UI patterns as part of the Messenger-esque design direction above.
