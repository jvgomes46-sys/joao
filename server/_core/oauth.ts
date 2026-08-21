import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Dev-only auto-login so the real UI can be exercised locally without a
  // configured OAuth provider (OAUTH_SERVER_URL). This is a full admin-login
  // backdoor with no credential check, so it requires TWO independent opt-ins
  // — ALLOW_DEV_LOGIN=1 AND NODE_ENV !== "production" — so a single
  // misconfigured env var (e.g. copying a local .env into a shared/staging
  // deployment) can never expose it. To QA the actual production JS bundle
  // locally, run with NODE_ENV=development anyway (still uses Vite's dev
  // middleware, not serveStatic, but exercises the same built app code).
  if (process.env.ALLOW_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production") {
    app.get("/api/dev/login", async (req: Request, res: Response) => {
      try {
        const openId = "dev-local-user";
        await db.upsertUser({
          openId,
          name: "Dev Local",
          email: "dev@local.test",
          loginMethod: "dev",
          role: "admin",
          lastSignedIn: new Date(),
        });
        // sdk.createSessionToken() stamps ENV.appId into the token, which is empty
        // in this local dev setup (no VITE_APP_ID) — verifySession then rejects it
        // as "missing required fields". Sign directly with a non-empty dev appId.
        const sessionToken = await sdk.signSession(
          { openId, appId: "dev-local", name: "Dev Local" },
          { expiresInMs: ONE_YEAR_MS }
        );
        // SameSite=None cookies (the production default from getSessionCookieOptions)
        // require Secure, which browsers drop over plain http://localhost — so the
        // dev route sets its own local-only-safe cookie attributes instead.
        res.cookie(COOKIE_NAME, sessionToken, { httpOnly: true, path: "/", sameSite: "lax", secure: false, maxAge: ONE_YEAR_MS });
        res.redirect(302, "/projetos");
      } catch (error) {
        console.error("[Dev Login] Failed", error);
        res.status(500).json({ error: "Dev login failed" });
      }
    });
  }

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
