import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setApiDeviceIdentity } from "@/src/lib/api";

const DEVICE_KEY = "meras_device_id";

type DeviceIdentity = { id: string; label: string; platform: string };

async function read(key: string) {
  try {
    if (Platform.OS === "web") return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

async function write(key: string, value: string) {
  try {
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  } catch { /* Identity remains valid for the current process. */ }
}

export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  let id = await read(DEVICE_KEY);
  if (!id || id.length < 12) {
    id = `${Platform.OS}-${Crypto.randomUUID()}`;
    await write(DEVICE_KEY, id);
  }
  const model = (Device.modelName || Device.deviceName || "مراس").replace(/[\r\n\t]/g, " ").slice(0, 70);
  const label = Platform.OS === "android" ? `${model} · Android` : Platform.OS === "ios" ? `${model} · iOS` : `${model} · Web`;
  const identity = { id, label, platform: Platform.OS };
  setApiDeviceIdentity(identity);
  return identity;
}
