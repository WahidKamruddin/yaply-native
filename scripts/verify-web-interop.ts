// Cross-runtime verification harness: proves yaply-native's noble-based
// crypto (src/crypto/) and the web app's Web-Crypto-based crypto
// (../packages/crypto/src/encryption.ts) implement the *same* wire format v2
// protocol — not just "looks similar," but that an envelope sealed by one can
// actually be opened by the other. This is the concrete check the
// implementation plan calls out as blocking before Phase 2 starts: if this
// script fails, messages sent from a phone are unreadable on web (or vice
// versa), silently, in production.
//
// Dev-tooling only — imports across the repo boundary from ../../packages/crypto
// on purpose (this script never ships in the app bundle; see CLAUDE.md's
// "Repo/package boundary" decision for why the app itself never does this).
// Requires the sibling `yaply/` checkout to exist locally (it does, by
// definition, since this script lives inside it).
//
// Run: npm run verify:interop

import {
  generateKeyPair as webGenerateKeyPair,
  publicKeyFingerprint as webPublicKeyFingerprint,
  encryptWithEnvelopes as webEncryptWithEnvelopes,
  unwrapAndDecrypt as webUnwrapAndDecrypt,
} from '../../packages/crypto/src/encryption'

// Import the pure-crypto modules directly, not the src/crypto/index.ts
// barrel — the barrel also re-exports keyStore.ts (expo-secure-store), which
// pulls in react-native and can't run under plain Node.
import { generateKeyPair as nativeGenerateKeyPair, publicKeyFingerprint as nativePublicKeyFingerprint } from '../src/crypto/keys'
import { encryptWithEnvelopes as nativeEncryptWithEnvelopes, unwrapAndDecrypt as nativeUnwrapAndDecrypt } from '../src/crypto/envelope'

let failures = 0

function check(name: string, pass: boolean): void {
  if (pass) {
    console.log(`  ok  ${name}`)
  } else {
    failures++
    console.error(`FAIL  ${name}`)
  }
}

async function main() {
  console.log('yaply-native <-> web crypto interop\n')

  // 1. Fingerprint format equivalence: the same JWK must produce the same
  // `x.y` string whether computed by noble-backed code or WebCrypto-backed
  // code, since `recipient_fp` is compared as a plain string across DBs.
  const native = await nativeGenerateKeyPair()
  check(
    'fingerprint format matches web for a native-generated key',
    nativePublicKeyFingerprint(native.publicKeyJwk) === webPublicKeyFingerprint(native.publicKeyJwk),
  )

  // 2. web seals -> native opens. Proves native's JWK parsing (jwkToPublicPoint/
  // jwkToPrivateScalar) and raw-ECDH-no-HKDF KEK derivation exactly match
  // WebCrypto's ECDH + AES-GCM behavior.
  const web = await webGenerateKeyPair()
  const webRecipient = {
    userId: 'web-user',
    fp: webPublicKeyFingerprint(web.publicKeyJwk),
    pubJwk: web.publicKeyJwk,
  }
  const plaintextFromWeb = 'hello from web \u{1F44B} 你好'
  const sealedByWeb = await webEncryptWithEnvelopes(plaintextFromWeb, [webRecipient])
  const envForWeb = sealedByWeb.envelopes.find((e) => e.recipientFp === webRecipient.fp)
  check('web-sealed envelope exists for its own recipient', !!envForWeb)
  if (envForWeb) {
    const decrypted = nativeUnwrapAndDecrypt(web.privateKeyJwk, envForWeb, sealedByWeb.content, sealedByWeb.iv)
    check('native decrypts an envelope sealed by web crypto', decrypted === plaintextFromWeb)
  }

  // 3. native seals -> web opens. Proves the reverse direction, including that
  // native's JWK *export* (with 'd', ext, key_ops fields) is accepted by real
  // crypto.subtle.importKey without modification.
  const nativeRecipient = {
    userId: 'native-user',
    fp: nativePublicKeyFingerprint(native.publicKeyJwk),
    pubJwk: native.publicKeyJwk,
  }
  const plaintextFromNative = 'hello from native \u{1F4F1} emoji \u{1F389}'
  const sealedByNative = nativeEncryptWithEnvelopes(plaintextFromNative, [nativeRecipient])
  const envForNative = sealedByNative.envelopes.find((e) => e.recipientFp === nativeRecipient.fp)
  check('native-sealed envelope exists for its own recipient', !!envForNative)
  if (envForNative) {
    const decrypted = await webUnwrapAndDecrypt(
      native.privateKeyJwk,
      envForNative,
      sealedByNative.content,
      sealedByNative.iv,
    )
    check('web decrypts an envelope sealed by native crypto', decrypted === plaintextFromNative)
  }

  // 4. Wire-format shape checks (nonce/tag lengths), independent of which side
  // produced the bytes.
  const contentBytes = Buffer.from(sealedByNative.content, 'base64')
  const ivBytes = Buffer.from(sealedByNative.iv, 'base64')
  check('native iv is 12 bytes', ivBytes.length === 12)
  check(
    'native content is plaintext length + 16-byte GCM tag',
    contentBytes.length === Buffer.byteLength(plaintextFromNative, 'utf8') + 16,
  )

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed — DO NOT proceed to Phase 2 until this passes.`)
    process.exit(1)
  }
  console.log('All checks passed: yaply-native and web produce interoperable wire-format-v2 ciphertext.')
}

main().catch((err) => {
  console.error('verify-web-interop crashed:', err)
  process.exit(1)
})
