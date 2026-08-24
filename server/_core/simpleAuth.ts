import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";

/**
 * SameSite=None exige Secure — sem isso o navegador descarta o cookie
 * silenciosamente (é o que getSessionCookieOptions faz para o fluxo OAuth,
 * que só roda atrás de HTTPS de verdade). Aqui detectamos se a requisição
 * é HTTPS e escolhemos a combinação válida em cada caso, para o login
 * funcionar tanto em produção (HTTPS → SameSite=None; Secure) quanto ao
 * testar localmente por HTTP simples (→ SameSite=Lax, sem Secure).
 */
function isSecureRequest(req: Request): boolean {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Login simples (email + senha de um único administrador), para quando o
 * projeto não tem — ou ainda não quer configurar — um provedor OAuth em
 * produção. Ativado só quando ADMIN_EMAIL e ADMIN_PASSWORD estão definidos
 * (ambas as env vars vivem apenas no provedor de hospedagem, nunca no repo —
 * mesmo padrão já usado para DATABASE_URL e JWT_SECRET).
 *
 * A sessão criada aqui é o mesmo JWT assinado localmente que o resto do app
 * já usa (sdk.signSession / sdk.verifySession) — não depende de nenhuma
 * chamada a um servidor OAuth externo.
 */

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || entry.resetAt < now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/** Comparação em tempo constante, para não vazar a senha por timing de string. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function registerSimpleAuthRoutes(app: Express) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      "[SimpleAuth] ADMIN_EMAIL / ADMIN_PASSWORD não configurados — login simples desativado (só OAuth ou dev-login, se habilitados)"
    );
    return;
  }

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      if (isRateLimited(ip)) {
        res.status(429).json({ error: "Muitas tentativas — aguarde alguns minutos e tente de novo" });
        return;
      }

      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      if (!safeEqual(email, adminEmail.trim().toLowerCase()) || !safeEqual(password, adminPassword)) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      const openId = "admin-local";
      await db.upsertUser({
        openId,
        name: "Administrador",
        email: adminEmail,
        loginMethod: "simple",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.signSession({ openId, appId: "evte-pro", name: "Administrador" }, { expiresInMs: ONE_YEAR_MS });
      const secure = isSecureRequest(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: secure ? "none" : "lax",
        secure,
        maxAge: ONE_YEAR_MS,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("[SimpleAuth] Login failed", error);
      res.status(500).json({ error: "Falha ao fazer login" });
    }
  });
}
