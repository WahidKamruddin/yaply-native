// Wire format v2: envelope encryption — the React Native counterpart to
// `packages/crypto/src/encryption.ts`. Same protocol, different runtime
// primitives: @noble/curves/@noble/ciphers operate on raw Uint8Array keys
// instead of opaque `CryptoKey` objects, since React Native has no
// `crypto.subtle`. Function names/shapes intentionally mirror the web
// package so the two are easy to diff against each other.
//
// Key agreement is raw ECDH — no HKDF. p256.getSharedSecret returns the full
// uncompressed shared point (0x04||x||y); the x-coordinate IS the AES-256-GCM
// key, exactly matching web's `deriveKey({name:'ECDH',...})` behavior (which
// also uses only the raw shared secret, never HKDF-derived).
import { p256 } from '@noble/curves/nist.js'
import { gcm } from '@noble/ciphers/aes.js'
import { toBase64, fromBase64 } from './base64'
import { jwkToPrivateScalar, jwkToPublicPoint, publicPointToJwk, privateScalarToJwk } from './jwk'

const NONCE_BYTES = 12
const KEY_BYTES = 32

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

// Raw 32-byte KEK from ECDH(myPriv, theirPub) — no HKDF, matches the web/iOS
// convention documented in CLAUDE.md.
export function deriveSharedKeyRaw(myPrivJwk: JsonWebKey, theirPubJwk: JsonWebKey): Uint8Array {
  const myScalar = jwkToPrivateScalar(myPrivJwk)
  const theirPoint = jwkToPublicPoint(theirPubJwk)
  const shared = p256.getSharedSecret(myScalar, theirPoint, false) // 0x04||x||y
  return shared.slice(1, 1 + KEY_BYTES) // x-coordinate only
}

// Returns { content: base64(ciphertext+tag), iv: base64(nonce[12]) }.
export function encryptMessage(rawKey: Uint8Array, plaintext: string): { content: string; iv: string } {
  const iv = randomBytes(NONCE_BYTES)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = gcm(rawKey, iv).encrypt(encoded)
  return { content: toBase64(ciphertext), iv: toBase64(iv) }
}

// iv=null means phase-1 fallback (content is plain base64 plaintext).
export function decryptMessage(rawKey: Uint8Array, content: string, iv: string | null): string {
  if (!iv) {
    // Phase-1: content is base64(UTF-8 plaintext). Must go through
    // TextDecoder, not a byte-by-byte charCode join — multi-byte characters
    // (emoji, CJK, smart quotes) are not Latin-1 safe.
    try {
      return new TextDecoder().decode(fromBase64(content))
    } catch {
      return content
    }
  }
  const ivBytes = fromBase64(iv)
  const ciphertextBytes = fromBase64(content)
  const decrypted = gcm(rawKey, ivBytes).decrypt(ciphertextBytes)
  return new TextDecoder().decode(decrypted)
}

export interface EnvelopeRecipient {
  userId: string
  fp: string // publicKeyFingerprint(pubJwk)
  pubJwk: JsonWebKey // the device's identity public key
}

// Matches the message_envelopes table columns (camelCased).
export interface MessageEnvelope {
  recipientUserId: string
  recipientFp: string
  ephPub: string // JSON-stringified JWK of the per-message ephemeral public key
  keyIv: string // base64(nonce[12]) for the key wrap
  wrappedKey: string // base64(AES-GCM(KEK, raw 32-byte mk) + tag)
}

export function generateMessageKey(): Uint8Array {
  return randomBytes(KEY_BYTES)
}

// Encrypts plaintext once and wraps the message key for every recipient
// device. `recipients` must include ALL devices of ALL conversation members —
// including every one of the sender's own devices, or the sender's other
// installs (and this one after a reload) cannot read the message.
export function encryptWithEnvelopes(
  plaintext: string,
  recipients: EnvelopeRecipient[],
): { content: string; iv: string; envelopes: MessageEnvelope[] } {
  if (recipients.length === 0) {
    throw new Error('[yaply-crypto] encryptWithEnvelopes requires at least one recipient device')
  }

  const mk = generateMessageKey()
  const { content, iv } = encryptMessage(mk, plaintext)

  // One ephemeral keypair per message, shared across all envelopes.
  const { secretKey: ephPriv } = p256.keygen()
  const ephPubPoint = p256.getPublicKey(ephPriv, false)
  const ephPrivJwk = privateScalarToJwk(ephPriv, ephPubPoint)
  const ephPub = JSON.stringify(publicPointToJwk(ephPubPoint))

  const envelopes: MessageEnvelope[] = recipients.map((r) => {
    const kek = deriveSharedKeyRaw(ephPrivJwk, r.pubJwk)
    const keyIv = randomBytes(NONCE_BYTES)
    const wrapped = gcm(kek, keyIv).encrypt(mk)
    return {
      recipientUserId: r.userId,
      recipientFp: r.fp,
      ephPub,
      keyIv: toBase64(keyIv),
      wrappedKey: toBase64(wrapped),
    }
  })

  return { content, iv, envelopes }
}

// Unwraps the message key from an envelope sealed to `myPrivJwk`'s device and
// decrypts the message content. Throws on any mismatch — callers surface an
// explicit decryptFailed state, never garbage.
export function unwrapAndDecrypt(
  myPrivJwk: JsonWebKey,
  envelope: Pick<MessageEnvelope, 'ephPub' | 'keyIv' | 'wrappedKey'>,
  content: string,
  iv: string,
): string {
  const ephPubJwk = JSON.parse(envelope.ephPub) as JsonWebKey
  const kek = deriveSharedKeyRaw(myPrivJwk, ephPubJwk)
  const mk = gcm(kek, fromBase64(envelope.keyIv)).decrypt(fromBase64(envelope.wrappedKey))
  return decryptMessage(mk, content, iv)
}
