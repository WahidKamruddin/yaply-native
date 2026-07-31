// expo-secure-store-backed key persistence — the RN equivalent of web's
// IndexedDB `identity` store and the deprecated iOS app's Keychain usage.
// Keys are scoped per user (`pub:<userId>`, `priv:<userId>`,
// `deviceId:<userId>`), matching the web app's convention exactly.
//
// SecureStore keys may only contain alphanumerics, '.', '-', '_' — userId is
// a uuid (safe) but we still sanitize defensively since a malformed id should
// fail loudly here rather than silently write to the wrong slot.
import * as SecureStore from 'expo-secure-store'

function assertSafeUserId(userId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(userId)) {
    throw new Error(`[yaply-crypto] userId contains characters unsafe for SecureStore keys: ${userId}`)
  }
}

const pubKey = (userId: string) => `yaply.pub.${userId}`
const privKey = (userId: string) => `yaply.priv.${userId}`
const deviceIdKey = (userId: string) => `yaply.deviceId.${userId}`

export async function storeIdentityKeyPair(
  userId: string,
  pub: JsonWebKey,
  priv: JsonWebKey,
): Promise<void> {
  assertSafeUserId(userId)
  await SecureStore.setItemAsync(pubKey(userId), JSON.stringify(pub))
  await SecureStore.setItemAsync(privKey(userId), JSON.stringify(priv))
}

export async function loadIdentityKeyPair(
  userId: string,
): Promise<{ pub: JsonWebKey; priv: JsonWebKey } | null> {
  assertSafeUserId(userId)
  const [pubRaw, privRaw] = await Promise.all([
    SecureStore.getItemAsync(pubKey(userId)),
    SecureStore.getItemAsync(privKey(userId)),
  ])
  if (!pubRaw || !privRaw) return null
  return { pub: JSON.parse(pubRaw) as JsonWebKey, priv: JSON.parse(privRaw) as JsonWebKey }
}

export async function storeLocalDeviceId(userId: string, id: number): Promise<void> {
  assertSafeUserId(userId)
  await SecureStore.setItemAsync(deviceIdKey(userId), String(id))
}

export async function loadLocalDeviceId(userId: string): Promise<number | null> {
  assertSafeUserId(userId)
  const raw = await SecureStore.getItemAsync(deviceIdKey(userId))
  return raw == null ? null : Number(raw)
}

export async function clearAllKeys(userId: string): Promise<void> {
  assertSafeUserId(userId)
  await Promise.all([
    SecureStore.deleteItemAsync(pubKey(userId)),
    SecureStore.deleteItemAsync(privKey(userId)),
    SecureStore.deleteItemAsync(deviceIdKey(userId)),
  ])
}
