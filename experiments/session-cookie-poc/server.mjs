import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:4173";
const DEMO_EMAIL = process.env.SMM_DEMO_EMAIL || "demo@example.test";
const DEMO_PASSWORD = process.env.SMM_DEMO_PASSWORD;

if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  console.error("Set SMM_DEMO_PASSWORD to a local-only password of at least 12 characters.");
  process.exit(1);
}

const COOKIE_NAME = "__Host-smm_session";
const SESSION_MS = 9 * 60 * 60 * 1000;
const sessions = new Map();

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function cookieHeader(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function requestOriginAllowed(req) {
  return req.headers.origin === FRONTEND_ORIGIN;
}

function corsHeaders(req) {
  if (req.headers.origin !== FRONTEND_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-SMM-CSRF",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function getSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

const server = http.createServer(async (req, res) => {
  const cors = corsHeaders(req);
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "OPTIONS") {
    if (!requestOriginAllowed(req)) return sendJson(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
    res.writeHead(204, cors);
    return res.end();
  }

  if (url.pathname.startsWith("/api/") && !requestOriginAllowed(req)) {
    return sendJson(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, mode: "local-cookie-poc", persistentStorage: false }, cors);
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    try {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (email !== DEMO_EMAIL.toLowerCase() || password !== DEMO_PASSWORD) {
        return sendJson(res, 401, { error: "INVALID_DEMO_CREDENTIALS" }, cors);
      }

      // One active session for this synthetic demo identity.
      for (const [token, session] of sessions) {
        if (session.email === email) sessions.delete(token);
      }

      const token = crypto.randomBytes(32).toString("base64url");
      const csrfToken = crypto.randomBytes(24).toString("base64url");
      const expiresAt = Date.now() + SESSION_MS;
      sessions.set(token, { email, csrfToken, expiresAt });

      return sendJson(res, 200, {
        ok: true,
        user: { email },
        csrfToken,
        expiresAt: new Date(expiresAt).toISOString()
      }, {
        ...cors,
        "Set-Cookie": cookieHeader(token, SESSION_MS / 1000)
      });
    } catch {
      return sendJson(res, 400, { error: "INVALID_REQUEST" }, cors);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { error: "SESSION_INVALID" }, cors);
    return sendJson(res, 200, {
      ok: true,
      user: { email: session.email },
      expiresAt: new Date(session.expiresAt).toISOString()
    }, cors);
  }

  if (req.method === "GET" && url.pathname === "/api/csrf") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { error: "SESSION_INVALID" }, cors);
    return sendJson(res, 200, { csrfToken: session.csrfToken }, cors);
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const session = getSession(req);
    if (!session) {
      return sendJson(res, 401, { error: "SESSION_INVALID" }, {
        ...cors,
        "Set-Cookie": cookieHeader("", 0)
      });
    }
    if (req.headers["x-smm-csrf"] !== session.csrfToken) {
      return sendJson(res, 403, { error: "CSRF_CHECK_FAILED" }, cors);
    }
    sessions.delete(session.token);
    return sendJson(res, 200, { ok: true, loggedOut: true }, {
      ...cors,
      "Set-Cookie": cookieHeader("", 0)
    });
  }

  if (req.method === "GET" && url.pathname === "/") {
    const html = await readFile(path.join(here, "public", "index.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src http://127.0.0.1:8787; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff"
    });
    return res.end(html);
  }

  return sendJson(res, 404, { error: "NOT_FOUND" }, cors);
});

server.listen(PORT, HOST, () => {
  console.log(`Local API listening at http://127.0.0.1:${PORT}`);
  console.log(`Allowed frontend origin: ${FRONTEND_ORIGIN}`);
  console.log("Synthetic in-memory sessions only. Do not expose this server publicly.");
});
