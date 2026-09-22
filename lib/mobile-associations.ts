/** Public signing identifiers, never private keys. Empty configuration fails closed. */
export const MOBILE_BUNDLE_ID = "sa.merasalelm.app";
export function androidAssociations(raw: string | undefined) {
  const fingerprints = [...new Set((raw || "").split(/[\s,;]+/).map(value => value.trim().toUpperCase()).filter(Boolean))];
  if (!fingerprints.length || fingerprints.length > 8 || fingerprints.some(value => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))) return null;
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: MOBILE_BUNDLE_ID, sha256_cert_fingerprints: fingerprints } }];
}
export function appleAssociation(raw: string | undefined) {
  const team = (raw || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return null;
  const paths = ["/r/*", "/courses", "/courses/*", "/learn", "/learn/*", "/referrals", "/notifications", "/study-tools", "/support", "/favorites", "/dashboard", "/tracks", "/tracks/*", "/learning-tracks", "/learning-tracks/*"];
  return { applinks: { details: [{ appIDs: [`${team}.${MOBILE_BUNDLE_ID}`], components: paths.map(path => ({ "/": path })) }] } };
}
