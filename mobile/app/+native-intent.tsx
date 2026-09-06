import Constants from "expo-constants";
import { resolveAppLink } from "@/src/lib/deep-links";
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return resolveAppLink(path, String(Constants.expoConfig?.extra?.appLinkHost || "marasalelm.com"));
}
