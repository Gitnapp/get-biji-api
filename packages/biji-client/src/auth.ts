import { FileAuthStorage, type AuthStorage } from "./storage.js";

export interface AuthInfo {
  token: string;
  token_expire_at: number;
  refresh_token: string;
  refresh_token_expire_at: number;
}

const REFRESH_BEFORE_EXPIRE = 300;
const REFRESH_URL = "https://notes-api.biji.com/account/v2/web/user/auth/refresh";

let _state: AuthInfo = {
  token: "",
  token_expire_at: 0,
  refresh_token: "",
  refresh_token_expire_at: 0,
};
let _storage: AuthStorage = new FileAuthStorage();
let _refreshing: Promise<boolean> | null = null;

export function setAuthStorage(storage: AuthStorage): void {
  _storage = storage;
}

export function loadAuth(): boolean {
  const envToken = process.env.BIJI_TOKEN;
  const envRefresh = process.env.BIJI_REFRESH_TOKEN;
  if (envToken && envRefresh) {
    _state = {
      token: envToken,
      token_expire_at: Number(process.env.BIJI_TOKEN_EXPIRE_AT) || 0,
      refresh_token: envRefresh,
      refresh_token_expire_at: Number(process.env.BIJI_REFRESH_TOKEN_EXPIRE_AT) || 0,
    };
    return true;
  }
  if (envToken) {
    _state = { token: envToken, token_expire_at: 0, refresh_token: "", refresh_token_expire_at: 0 };
    return true;
  }
  const loaded = _storage.load();
  if (!loaded) return false;
  const now = Math.floor(Date.now() / 1000);
  if (loaded.refresh_token_expire_at && loaded.refresh_token_expire_at <= now) {
    return false;
  }
  _state = loaded;
  return true;
}

export function setToken(token: string): void {
  _state = { token, token_expire_at: 0, refresh_token: "", refresh_token_expire_at: 0 };
}

export function setAuth(auth: AuthInfo): void {
  _state = { ...auth };
  _storage.save(_state);
}

export function getAuth(): AuthInfo {
  return { ..._state };
}

export function getToken(): string {
  return _state.token;
}

function isTokenExpiring(): boolean {
  if (!_state.token_expire_at || !_state.refresh_token) return false;
  return Math.floor(Date.now() / 1000) >= _state.token_expire_at - REFRESH_BEFORE_EXPIRE;
}

function isRefreshTokenExpired(): boolean {
  if (!_state.refresh_token_expire_at) return false;
  return Math.floor(Date.now() / 1000) >= _state.refresh_token_expire_at;
}

async function doRefreshToken(): Promise<boolean> {
  if (!_state.refresh_token || isRefreshTokenExpired()) return false;
  try {
    const resp = await fetch(REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "X-Appid": "3",
        Authorization: `Bearer ${_state.token}`,
      },
      body: JSON.stringify({ refresh_token: _state.refresh_token }),
    });
    const json = (await resp.json()) as { c?: { token?: AuthInfo } };
    const next = json?.c?.token;
    if (!next?.token) return false;
    setAuth({
      token: next.token,
      token_expire_at: next.token_expire_at || 0,
      refresh_token: next.refresh_token || _state.refresh_token,
      refresh_token_expire_at: next.refresh_token_expire_at || _state.refresh_token_expire_at,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureFreshToken(): Promise<void> {
  if (!isTokenExpiring()) return;
  if (_refreshing) {
    await _refreshing;
    return;
  }
  _refreshing = doRefreshToken();
  try {
    await _refreshing;
  } finally {
    _refreshing = null;
  }
}

export interface AuthStatus {
  authenticated: boolean;
  token_preview?: string;
  jwt_expire_in_seconds?: number;
  refresh_expire_in_seconds?: number;
  has_refresh_token: boolean;
}

export function authStatus(): AuthStatus {
  if (!_state.token) return { authenticated: false, has_refresh_token: false };
  const now = Math.floor(Date.now() / 1000);
  return {
    authenticated: true,
    token_preview: `${_state.token.slice(0, 24)}...`,
    jwt_expire_in_seconds: _state.token_expire_at ? _state.token_expire_at - now : undefined,
    refresh_expire_in_seconds: _state.refresh_token_expire_at ? _state.refresh_token_expire_at - now : undefined,
    has_refresh_token: Boolean(_state.refresh_token),
  };
}
