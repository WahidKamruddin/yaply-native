import { p256 } from '@noble/curves/nist.js'
import { publicPointToJwk, privateScalarToJwk } from './jwk'

export async function generateKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}> {
  const { secretKey } = p256.keygen()
  const publicPoint = p256.getPublicKey(secretKey, false) // uncompressed: 0x04||x||y
  return {
    publicKeyJwk: publicPointToJwk(publicPoint),
    privateKeyJwk: privateScalarToJwk(secretKey, publicPoint),
  }
}

function asJwk(v: JsonWebKey | string | unknown): JsonWebKey {
  if (v == null) throw new Error('[yaply-crypto] asJwk received null/undefined')
  const obj = typeof v === 'string' ? JSON.parse(v) : v
  // JSON round-trip guarantees a clean plain object — mirrors packages/crypto's
  // asJwk, which does this to handle Proxy/wrapper objects.
  return JSON.parse(JSON.stringify(obj)) as JsonWebKey
}

// Stable identifier for a P-256 public key — the JWK x/y coordinates. Must
// produce byte-identical output to `packages/crypto/src/encryption.ts`'s
// `publicKeyFingerprint` for the same key, since `recipient_fp` is compared
// as a plain string across web/native.
export function publicKeyFingerprint(pubJwk: JsonWebKey): string {
  const jwk = asJwk(pubJwk)
  if (!jwk.x || !jwk.y) throw new Error('[yaply-crypto] fingerprint requires a public EC JWK')
  return `${jwk.x}.${jwk.y}`
}
