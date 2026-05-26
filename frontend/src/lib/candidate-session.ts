export type CandidateSessionAccess = {
  token: string | null;
  clientId: string;
};

function tokenKey(sessionId: string) {
  return `interview-session-token:${sessionId}`;
}

function clientKey(sessionId: string) {
  return `interview-client-id:${sessionId}`;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveCandidateSessionAccess(sessionId: string, token: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(tokenKey(sessionId), token);
  if (!window.sessionStorage.getItem(clientKey(sessionId))) {
    window.sessionStorage.setItem(clientKey(sessionId), createId());
  }
}

export function readCandidateSessionAccess(sessionId: string): CandidateSessionAccess {
  if (typeof window === "undefined") {
    return { token: null, clientId: "" };
  }
  let clientId = window.sessionStorage.getItem(clientKey(sessionId));
  if (!clientId) {
    clientId = createId();
    window.sessionStorage.setItem(clientKey(sessionId), clientId);
  }
  return {
    token: window.sessionStorage.getItem(tokenKey(sessionId)),
    clientId,
  };
}
