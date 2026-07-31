// Hand-rolled base64 (RFC 4648) — no dependency on RN's atob/btoa globals,
// whose availability/behavior across Hermes versions we don't want to bet the
// wire format on. Two variants because the two contexts need different ones:
//  - Standard, padded base64 for `content`/`iv`/`key_iv`/`wrapped_key` — matches
//    the web app's `btoa(String.fromCharCode(...bytes))` output exactly.
//  - base64url, unpadded for JWK `x`/`y`/`d` fields — the WebCrypto JWK export
//    spec (RFC 7518) requires this encoding regardless of platform.

const STD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function encode(bytes: Uint8Array, chars: string, pad: boolean): string {
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + (pad ? '==' : '')
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + (pad ? '=' : '')
  }
  return out
}

function decode(b64: string, chars: string): Uint8Array {
  const clean = b64.replace(/=+$/g, '')
  const lookup = new Map<string, number>()
  for (let i = 0; i < chars.length; i++) lookup.set(chars[i], i)
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const val = lookup.get(ch)
    if (val === undefined) throw new Error(`[yaply-crypto] invalid base64 character: ${ch}`)
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

export const toBase64 = (bytes: Uint8Array): string => encode(bytes, STD_CHARS, true)
export const fromBase64 = (b64: string): Uint8Array => decode(b64, STD_CHARS)

export const toBase64Url = (bytes: Uint8Array): string => encode(bytes, URL_CHARS, false)
export const fromBase64Url = (b64url: string): Uint8Array => decode(b64url, URL_CHARS)
