const appPackage = "sa.merasalelm.app";
export const ASSOCIATED_PATHS = ["/r/*", "/courses", "/courses/*", "/learn/*", "/referrals", "/notifications", "/study-tools", "/study-tools/*", "/support", "/cart", "/favorites", "/dashboard", "/tracks", "/learning-tracks", "/verify-email", "/reset-password"];
export function androidAssociation(fingerprints: string | undefined) {
  const values = [...new Set((fingerprints || "").split(/[,\s]+/).map(value => value.trim().toUpperCase()).filter(Boolean))];
  if (!values.length || values.some(value => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))) return null;
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: appPackage, sha256_cert_fingerprints: values } }];
}
export function appleAssociation(prefix: string | undefined) {
  if (!prefix || !/^[A-Z0-9]{10}$/.test(prefix)) return null;
  return { applinks: { apps: [], details: [{ appID: `${prefix}.${appPackage}`, paths: ASSOCIATED_PATHS }] } };
}
