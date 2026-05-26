export const ADMIN_TOKEN_KEY = "interview-admin-token";
export const ADMIN_USER_KEY = "interview-admin-user";
export const ADMIN_EXPIRES_KEY = "interview-admin-expires-at";
export const ADMIN_AUTH_EXPIRED_EVENT = "interview-admin-auth-expired";

export function expireAdminAuth() {
  clearAdminAuth();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_AUTH_EXPIRED_EVENT));
  }
}

export function readAdminAuth() {
  if (typeof window === "undefined") {
    return { token: null, user: "", expiresAt: "" };
  }
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_USER_KEY);
  window.localStorage.removeItem(ADMIN_EXPIRES_KEY);

  const expiresAt = window.sessionStorage.getItem(ADMIN_EXPIRES_KEY) ?? "";
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    clearAdminAuth();
    return { token: null, user: "", expiresAt: "" };
  }
  return {
    token: window.sessionStorage.getItem(ADMIN_TOKEN_KEY),
    user: window.sessionStorage.getItem(ADMIN_USER_KEY) ?? "admin",
    expiresAt,
  };
}

export function saveAdminAuth(token: string, user: string, expiresAt: string) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  window.sessionStorage.setItem(ADMIN_USER_KEY, user);
  window.sessionStorage.setItem(ADMIN_EXPIRES_KEY, expiresAt);
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_USER_KEY);
  window.localStorage.removeItem(ADMIN_EXPIRES_KEY);
}

export function clearAdminAuth() {
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  window.sessionStorage.removeItem(ADMIN_USER_KEY);
  window.sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_USER_KEY);
  window.localStorage.removeItem(ADMIN_EXPIRES_KEY);
}
