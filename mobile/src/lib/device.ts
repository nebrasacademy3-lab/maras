import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ApiError, setApiDeviceIdentity } from "@/src/lib/api";

const DEVICE_KEY = "meras_device_id";

type DeviceIdentity = { id: string; label: string; platform: string };

function storageFailure() {
  return new ApiError("تعذر حفظ هوية هذا الجهاز بأمان. أغلق التطبيق وافتحه ثم أعد المحاولة؛ لم يتم تسجيل جهاز جديد في حسابك.", 0, { code: "DEVICE_STORAGE_UNAVAILABLE" });
}

async function read(key: string) {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") throw storageFailure();
      return window.localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch { throw storageFailure(); }
}

async function write(key: string, value: string) {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") throw storageFailure();
      window.localStorage.setItem(key, value);
    } else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    // A successful promise alone is not enough when the storage layer is unavailable.
    if (await read(key) !== value) throw storageFailure();
  } catch { throw storageFailure(); }
}

let identityPromise: Promise<DeviceIdentity> | undefined;

export function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  // Startup, password login and OAuth can overlap. Register one installation identity.
  identityPromise ??= loadDeviceIdentity().catch((error: unknown) => { identityPromise = undefined; throw error; });
  return identityPromise;
}

async function loadDeviceIdentity(): Promise<DeviceIdentity> {
  let id = await read(DEVICE_KEY);
  if (id !== null && !/^[a-zA-Z0-9_-]{12,200}$/.test(id)) throw storageFailure();
  if (id === null) {
    id = `${Platform.OS}-${Crypto.randomUUID()}`;
    await write(DEVICE_KEY, id);
  }
  const model = (Device.modelName || Device.deviceName || "مراس").replace(/[\r\n\t]/g, " ").slice(0, 70);
  const label = Platform.OS === "android" ? `${model} · Android` : Platform.OS === "ios" ? `${model} · iOS` : `${model} · Web`;
  const identity = { id, label, platform: Platform.OS };
  setApiDeviceIdentity(identity);
  return identity;
}
