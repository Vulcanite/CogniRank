"use client";

import { useEffect, useState } from "react";

import { refreshAdmin } from "@/lib/api";
import { ADMIN_AUTH_EXPIRED_EVENT, clearAdminAuth, readAdminAuth, saveAdminAuth } from "@/lib/admin-auth";

export function useAdminAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = readAdminAuth();
    setToken(auth.token);
    setUser(auth.user);
    setExpiresAt(auth.expiresAt);
    setReady(true);
  }, []);

  useEffect(() => {
    function expire() {
      clearAdminAuth();
      setToken(null);
      setUser("");
      setExpiresAt("");
    }

    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, expire);
    if (!token || !expiresAt) {
      return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, expire);
    }

    const delayMs = new Date(expiresAt).getTime() - Date.now();
    if (delayMs <= 0) {
      expire();
      return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, expire);
    }

    const refreshDelayMs = Math.max(0, delayMs - 60_000);
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await refreshAdmin(token);
        saveAdminAuth(refreshed.access_token, refreshed.username, refreshed.expires_at);
        setToken(refreshed.access_token);
        setUser(refreshed.username);
        setExpiresAt(refreshed.expires_at);
      } catch {
        expire();
      }
    }, refreshDelayMs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, expire);
    };
  }, [expiresAt, token]);

  function acceptLogin(nextToken: string, nextUser: string, nextExpiresAt: string) {
    setToken(nextToken);
    setUser(nextUser);
    setExpiresAt(nextExpiresAt);
  }

  return { token, user, ready, expiresAt, acceptLogin };
}
