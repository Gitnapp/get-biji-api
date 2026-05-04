import { authStatus as rawAuthStatus, getAuth } from "@biji/client";

export {
  loadAuth,
  setAuth,
  setToken,
  getAuth,
  getToken,
  ensureFreshToken,
  type AuthInfo,
} from "@biji/client";

/** Human-readable status string for `biji auth status`. */
export function authStatus(): string {
  const s = rawAuthStatus();
  if (!s.authenticated) return "Not authenticated. Run: biji auth set";
  const auth = getAuth();
  const lines: string[] = [`Token: ${s.token_preview}`];
  if (s.jwt_expire_in_seconds !== undefined) {
    const min = Math.floor(s.jwt_expire_in_seconds / 60);
    lines.push(`JWT expires in: ${min} min${min < 0 ? " (EXPIRED — will auto-refresh)" : ""}`);
  } else {
    lines.push("JWT expiry: unknown");
  }
  if (auth.refresh_token && s.refresh_expire_in_seconds !== undefined) {
    const day = Math.floor(s.refresh_expire_in_seconds / 86400);
    lines.push(`Refresh token expires in: ${day} days${day < 0 ? " (EXPIRED — re-login needed)" : ""}`);
  } else {
    lines.push("Refresh token: not set");
  }
  return lines.join("\n");
}
