// WebCrypto-compatible JWK <-> raw point conversion for P-256.
//
// @noble/curves works with raw byte arrays (uncompressed SEC1 points:
// 0x04 || x[32] || y[32]), not JWK. But `devices.identity_key`,
// `message_envelopes.recipient_fp`, and `message_envelopes.eph_pub` are all
// WebCrypto JWK format (RFC 7518: base64url, unpadded x/y/d) — that's what
// the web app produces via `crypto.subtle.exportKey('jwk', ...)`. Every
// function here exists solely to make yaply-native's keys byte-identical to
// what web/iOS already publish and consume.
import { toBase64Url, fromBase64Url } from './base64'

const CURVE_BYTES = 32
const UNCOMPRESSED_PREFIX = 0x04

export function publicPointToJwk(point: Uint8Array): JsonWebKey {
  if (point.length !== 1 + CURVE_BYTES * 2 || point[0] !== UNCOMPRESSED_PREFIX) {
    throw new Error('[yaply-crypto] expected a 65-byte uncompressed P-256 point (0x04||x||y)')
  }
  const x = point.slice(1, 1 + CURVE_BYTES)
  const y = point.slice(1 + CURVE_BYTES, 1 + CURVE_BYTES * 2)
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(x),
    y: toBase64Url(y),
    ext: true,
    key_ops: [],
  }
}

export function jwkToPublicPoint(jwk: JsonWebKey): Uint8Array {
  if (!jwk.x || !jwk.y) throw new Error('[yaply-crypto] JWK is missing x/y — not a valid EC public key')
  const x = fromBase64Url(jwk.x)
  const y = fromBase64Url(jwk.y)
  if (x.length !== CURVE_BYTES || y.length !== CURVE_BYTES) {
    throw new Error('[yaply-crypto] JWK x/y must decode to 32 bytes each for P-256')
  }
  const point = new Uint8Array(1 + CURVE_BYTES * 2)
  point[0] = UNCOMPRESSED_PREFIX
  point.set(x, 1)
  point.set(y, 1 + CURVE_BYTES)
  return point
}

export function privateScalarToJwk(secretKey: Uint8Array, publicPoint: Uint8Array): JsonWebKey {
  const pubJwk = publicPointToJwk(publicPoint)
  return {
    ...pubJwk,
    d: toBase64Url(secretKey),
    key_ops: ['deriveKey', 'deriveBits'],
  }
}

export function jwkToPrivateScalar(jwk: JsonWebKey): Uint8Array {
  if (!jwk.d) throw new Error('[yaply-crypto] JWK is missing d — not a valid EC private key')
  const d = fromBase64Url(jwk.d)
  if (d.length !== CURVE_BYTES) throw new Error('[yaply-crypto] JWK d must decode to 32 bytes for P-256')
  return d
}
