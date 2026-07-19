// Small standalone token store so the axios interceptor (module scope, no
// React context) and the AuthProvider (React state) can share the same
// source of truth without importing each other.

const ACCESS_TOKEN_KEY = 'liferpg.accessToken';
const REFRESH_TOKEN_KEY = 'liferpg.refreshToken';

function isBrowser() {
  return typeof window !== 'undefined';
}

export const tokenStore = {
  getAccessToken(): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setTokens(accessToken: string, refreshToken: string) {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
