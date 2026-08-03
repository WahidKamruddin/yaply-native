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
| Styling | `src/theme/` (Context-based `ThemeProvider`/`useAppTheme`, dark+light) + `expo-linear-gradient` for gradient fills + `expo-blur` for glassmorphic surfaces | Palette is ported directly from web's `styles.css` — see Design Direction below. |
| Icons | `@expo/vector-icons` (Feather set) | Avatar fallback icon, theme toggle sun/moon. |
| SVG | `react-native-svg` | Renders `YaplyLogo`'s exact path/gradient from web's `YaplyLogo.tsx`. |
| Fonts | `expo-font` + self-sourced `assets/fonts/BricolageGrotesque.ttf` | Display typeface, loaded via `useFonts` in `app/_layout.tsx`. See Design Direction for the `.woff2`-vs-`.ttf` note. |
| Animation / gesture | `react-native-reanimated` + `react-native-gesture-handler` | Powers swipe-to-reply and animated bubble entrance/action-sheet/dialogs in `src/features/chat/components/` and `src/components/`. |
| Notifications | `expo-notifications` (local scheduling for reminders now; remote push is future work) | See Feature Map. |

---

## Design Direction

**Reversed after Phase 4.** Phase 4 shipped a custom "Meta Messenger–esque" palette (coral-to-amber gradient bubbles, `colorForConversation` per-conversation accent avatars) explicitly *not* modeled on web's palette, on the theory that moving off SwiftUI was partly about wanting design freedom. The user later said that read as "completely off" from yaply's actual brand — the app needs to actually look like yaply, not a generic reskin. So this app's design system was rebuilt to faithfully port web's real, already-established palette and component patterns instead of inventing a new one. Three research passes read web's actual source (`src/styles.css`'s Tailwind `@theme` tokens, `MessageBubble.tsx`/`ChatView.tsx`/`ConversationList.tsx`/`Avatar.tsx`, `auth.tsx` + `YaplyLogo.tsx`) to extract this as ground truth — every value below is copied from web, not invented. (Web's marketing landing page, `src/routes/index.tsx`, is intentionally excluded — it's web's own separately-documented, decoupled design system.)

**Theming architecture** — `src/theme/`:
- `tokens.ts` — dark/light color tables (dark is the default, matching web), spacing/radii/type scale.
- `ThemeProvider.tsx` — React Context; `mode` initializes from `AsyncStorage` (key `yaply-theme`, same name as web's `localStorage` key for conceptual parity) falling back to `useColorScheme()` (RN's `prefers-color-scheme` equivalent), with a persisted `toggle()`. `useAppTheme()` is the hook every themed component calls — there is no static `theme` export anymore; `StyleSheet.create` calls that need theme values are wrapped in a function called with the live theme inside the component body, since `StyleSheet.create` can't be dynamic at module scope.
- A sun/moon toggle button lives in the conversation list header, next to sign-out — mirrors web's `BottomBar.tsx` toggle.

**Palette** (dark / light — see `src/theme/tokens.ts` for the full table): background `#070d1a` / `#edf1fa`, surface `#0a1120` / `#ffffff`, card `#0d1526` / `#ffffff`, primary `#5b8def` (both modes), primary-dark `#3b6fe0` / `#4a7de4`, text `#e9eefb` / `#1a2744`, danger `#ff8080` / `#ef4444`. Own-message bubbles and primary buttons use a diagonal `primary → primary-dark` gradient (`expo-linear-gradient`), matching web's `bg-gradient-to-br`. Delete-confirm buttons use a literal red (`#ef4444`/`#dc2626`) rather than the `danger` token — web itself has this inconsistency; it's reproduced faithfully here, not "fixed."

**`colorForConversation` is gone.** Avatars are now `src/components/Avatar.tsx` — a flat `tint-strong` circle with a centered person-silhouette icon (`Feather` `"user"`, never initials, never a per-conversation hue) and an optional fixed-10px online-status dot, ported directly from web's `Avatar.tsx`.

**Logo:** `src/components/YaplyLogo.tsx` renders web's exact abstract two-blob mark (not a letterform) via `react-native-svg` — same `196×218` path data and `#6BA8FF → #3B6FE0` gradient vector as `YaplyLogo.tsx` on web, copied verbatim.

**Typography:** Bricolage Grotesque for display/heading text (`theme.type.title`/`.heading`), system font for body/label/caption. Web self-hosts a `.woff2`; **React Native can't load `.woff2` as a native font**, so `assets/fonts/BricolageGrotesque.ttf` is a separately-sourced variable-weight TTF (OFL-licensed, fetched from Google Fonts' GitHub release — same typeface, different file format), loaded via `expo-font`'s `useFonts` in `app/_layout.tsx`. **Known limitation:** RN's font-weight selection on a single variable-font file isn't guaranteed to work the way CSS does on web — text tagged `BricolageGrotesque` may render at the font's default instance regardless of the `fontWeight` in `theme.type`. Not verified on a real device in this environment; flagged here rather than assumed fixed.

**Bubble shape:** `MessageBubble.tsx` uses three full-radius (16px) corners plus a squashed ~3px "tail" corner on the sender side (bottom-right for own, bottom-left for other) — matches web's `rounded-2xl` + `rounded-br-sm`/`rounded-bl-sm`. Reply-quote blocks (left accent bar in `primary`, `primary-tint` background) now render above a bubble when `replyToId` is set — this wasn't rendered at all before the palette made it worth doing properly. Tapping a bubble toggles a tap-to-reveal timestamp (matches web), replacing the always-visible caption from Phase 4.

**Auth screens:** `src/components/AuthScreen.tsx` is a shared shell (decorative blurred gradient orbs via `expo-blur`'s `BlurView`, glassmorphic card, centered `YaplyLogo`) used by both `sign-in.tsx` and `sign-up.tsx` — the two stayed separate routes (a deliberate choice, unlike web's single-page mode-toggle), but now share web's actual visual language: full-pill gradient submit button, tint/border inputs with a `primary`-colored focus state.

**Interaction layer** (unchanged from Phase 4, recolored): `react-native-reanimated` + `react-native-gesture-handler` power `MessageBubble.tsx` (fade/slide-in entrance, swipe-right-to-reply — one gesture direction, a mobile-idiomatic adaptation since web's equivalent is a desktop right-click menu that doesn't translate) and `MessageActionSheet.tsx`/`ConfirmDialog.tsx` (custom animated sheets/dialogs replacing native `Alert`, now styled with web's exact `card`/`border`/shadow tokens and its literal-red destructive button).

Verified to actually compile through Metro (`expo export --platform ios`, all new native modules — `react-native-svg`, `expo-blur`, `@expo/vector-icons`, the font asset — bundled successfully), not just type-checked. **Not verified visually on a simulator/device in this environment** — static token/shape matching against the extracted web spec is as far as this pass could confirm; a real device check is the natural next step.

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

Reflects what's actually built through Phase 5; stickers/media (Phase 6) are the only pieces still purely aspirational.

```
yaply-native/
├── app/                            ← Expo Router routes (see Architecture above)
│   ├── (auth)/{sign-in,sign-up}.tsx
│   ├── (tabs)/index.tsx            ← conversation list
│   ├── chat/[id].tsx                ← chat screen
│   └── panel/[id].tsx               ← "conversation tools" tabbed screen (Tasks/Notes/Reminders/Events/Albums/Budgets)
├── scripts/
│   └── verify-web-interop.ts       ← dev-only cross-runtime crypto check, `npm run verify:interop`
├── assets/fonts/BricolageGrotesque.ttf  ← self-sourced .ttf (web uses a .woff2 — RN can't load that), see Design Direction
├── src/
│   ├── crypto/                     ← base64.ts, jwk.ts, keys.ts, envelope.ts, keyStore.ts (see Encryption section)
│   ├── lib/
│   │   └── supabase.ts             ← Supabase client singleton
│   ├── theme/
│   │   ├── tokens.ts                ← dark/light color tables ported from web's styles.css, spacing/radii/type
│   │   └── ThemeProvider.tsx        ← Context + AsyncStorage persistence + useColorScheme fallback; useAppTheme() hook
│   ├── components/
│   │   ├── Avatar.tsx               ← flat icon-fallback avatar, ported from web's Avatar.tsx
│   │   ├── YaplyLogo.tsx            ← react-native-svg port of web's exact logo path/gradient
│   │   ├── AuthScreen.tsx           ← shared glassmorphic shell + AuthInput/AuthButton for sign-in/sign-up
│   │   └── ConfirmDialog.tsx        ← generic animated confirm dialog, used by the panel's delete flows
│   ├── features/
│   │   ├── auth/useAuth.ts
│   │   ├── chat/                   ← api/, components/ (MessageBubble, MessageActionSheet), hooks/, store/, types.ts
│   │   ├── commands/                ← slash command parser/handlers
│   │   └── productivity/
│   │       ├── hooks/               ← useTasks, useNotes, useReminders, useEvents, useAlbums, useBudgets
│   │       ├── notifications.ts     ← expo-notifications scheduling for reminders
│   │       └── systemMessage.ts     ← posts the type='system' message on entity creation
└── .env.example                    ← EXPO_PUBLIC_* vars, see Configuration
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
| 2 | Auth, conversation list, DM creation + user search, chat screen (paginated, realtime, reply, soft-delete) | `src/features/auth/useAuth.ts`, `app/(auth)/{sign-in,sign-up}.tsx`, `src/features/chat/{api,hooks}/*`, `app/(tabs)/index.tsx`, `app/chat/[id].tsx`. Device registration is kicked off once in `app/_layout.tsx` (not per-screen) — safe because of `useEncryption`'s single-flight guard. Chat screen works for any conversation (DM or group) once one exists — encryption/decryption/pagination/realtime are conversation-type-agnostic, matching web. |
| 3 | Slash commands (`/help`, `/remind`, `/mute`) + system message auto-destruct | `src/features/commands/{commandParser,commands,commandRegistry}.ts`, `src/features/commands/handlers/*`, wired into `app/chat/[id].tsx`'s composer. `/task`, `/note`, `/album`, `/budget`, `/plan`, `/poll`, `/event` are recognized but return "not available yet" — real creation is Phase 5's job (matches web's own `createHandler`, which just opens a modal; there's no modal system here yet). Expired (`deleted_at` in the past) system messages are hidden silently, matching web/iOS. Regular deleted messages render an italic "Message deleted" placeholder. **`/thread` is not implemented** — despite the root CLAUDE.md's Cross-Platform Reference section listing it, the actual web `commandRegistry.ts` has no `thread` case (threading is a UI action via reply, not a slash command) — verified by reading web's source directly rather than trusting that doc. |
| 4 | Design system + Messenger-esque interaction layer | `theme.ts` (real palette + `colorForConversation`), `src/features/chat/components/{MessageBubble,MessageActionSheet}.tsx`, integrated into `app/chat/[id].tsx` and `app/(tabs)/index.tsx`. See Design Direction above for what shipped and what was deliberately simplified (single swipe direction, no custom font yet). |
| 5 | Tasks, Notes, Reminders, Events (list/RSVP), Albums, Budgets — the "conversation tools" panel | `src/features/productivity/hooks/{useTasks,useNotes,useReminders,useEvents,useAlbums,useBudgets}.ts`, `src/features/productivity/{notifications,systemMessage}.ts`, `src/components/ConfirmDialog.tsx`, `app/panel/[id].tsx` (tabbed screen, iOS's `ConversationDetailView` equivalent), opened from a "Tools" header button in `app/chat/[id].tsx`. Creating a task/note/event/album/budget posts a `type='system'` message (phase-1 encoded, 7-day auto-destruct) — the only DB write beyond the entity itself, matching the root CLAUDE.md's invariant. System messages (from this app **or synced from web**) render an "Open {Tab} →" link that deep-links into the matching panel tab via `?tab=` — this works for web-created system messages too, not just ones this app produces. Reminders use local `expo-notifications` scheduling (`scheduleReminderNotification`, wired into `/remind`), not web's 60s poll. |

### Not yet implemented / deliberately deferred within Phase 5

- **Events availability calendar** — the when2meet-style heatmap grid (UTC slot-key contract, tap-to-toggle, creator confirm) is not built. The panel's Events tab only does list/quick-create (always planning-mode)/RSVP-once-confirmed/delete — confirming a date needs the calendar UI, so there's no path to `status='confirmed'` from this app yet.
- **Splitwise export** — genuinely out of scope without OAuth client credentials, not a corner cut. Budgets/expenses are tracked locally only.
- **Stickers** — reclassified into Phase 6 below (depends on the same Storage/media upload infrastructure as image messages, which doesn't exist yet either).
- **Task/note/event "locked" field** — the live schema has a `locked boolean` column on tasks/notes/reminders/events/albums/budgets that isn't documented in the root CLAUDE.md's schema section (found while porting web's hooks). Not surfaced in the UI here — no edit-permission/locking feature, matching what's actually built rather than the incomplete doc.

### Not yet implemented

- **Group creation UI** — no multi-select member picker / `create_group_conversation` RPC call yet, only DM creation via user search. Existing groups (created elsewhere) work fine in the chat screen; there's just no way to create one from this app yet.
- **Per-conversation accent color is display-only** — `colorForConversation` drives avatars everywhere but there's no settings UI to let a user override the deterministic color, unlike Messenger's actual "pick a chat color" feature.

### Phase 6 — Media, stickers & remote push (deferred by design, not started)

None of this is built, and that's intentional: the root CLAUDE.md's own Feature Map lists both as "not yet integrated" on web itself — media upload has a service and drag-drop zone built but the picker in `ChatView` is a placeholder, and the GIF picker (`src/features/media/`) similarly has UI wired as a placeholder, neither actually reachable in the shipped web app. So there's no finished reference implementation to port yet. Building ahead of web here would mean inventing the contract instead of following one, which is the opposite of how every other phase in this doc worked. Specifically deferred:

- **Media upload (images, files)** — needs a Supabase Storage upload path + the `media_url`/`media_mime` columns wired into `sendMessage` (already present in the type, unused). Blocked on web shipping this first.
- **GIF picker (Giphy)** — same shape as media upload; needs a `GIPHY_API_KEY` (already in `.env.example`, unused so far) and a picker UI.
- **Stickers** — `stickers` table exists in the schema but needs the same Storage plumbing as media upload before a picker means anything (see Phase 5's note).
- **Remote push notifications** — Phase 5 only does *local* scheduling (`expo-notifications`) for reminders on this device. Remote push (a message arriving while the app is backgrounded/closed) needs Expo push tokens registered somewhere, and `devices.push_subscription` currently holds web-push subscription JSON shape — accommodating an Expo token there is a schema/contract decision that hasn't been made yet, not just a missing feature. Flag this for a real decision before building, don't just shove a differently-shaped token into that column.

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
