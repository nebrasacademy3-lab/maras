export const PREVIEW_PROOF_COOKIE = "meras_video_preview";
export function readPreviewProof(request: Request) {
  const header=request.headers.get("x-meras-playback-proof");
  const cookie=(request.headers.get("cookie")||"").split(";").map(value=>value.trim()).find(value=>value.startsWith(PREVIEW_PROOF_COOKIE+"="))?.slice(PREVIEW_PROOF_COOKIE.length+1);
  const value=header || cookie || "";
  return /^[a-f0-9]{48}$/.test(value)?value:"";
}
