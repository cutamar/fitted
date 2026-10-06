import { Hono } from "hono";
import { z } from "zod";
import type { AuthStatus } from "@rb/shared";
import { createAuthorizeUrl, loadCredentials, PLAN_SCOPE, previousEmail, signOut } from "../chatgpt/auth.ts";
import { listModels } from "../chatgpt/client.ts";
import { getSetting, setSetting } from "../db.ts";

export const authRoutes = new Hono()
  .get("/status", (c) => {
    const creds = loadCredentials();
    const status: AuthStatus = creds
      ? {
          connected: true,
          email: creds.email,
          name: creds.name,
          sharing: creds.scopes.includes(PLAN_SCOPE),
          selectedModel: getSetting("model"),
        }
      : { connected: false, previousEmail: previousEmail() };
    return c.json(status);
  })
  // Plain navigation (not fetch): the browser follows the redirect to OpenAI.
  .get("/login", (c) => c.redirect(createAuthorizeUrl({ fresh: c.req.query("fresh") === "1" })))
  .post("/logout", async (c) => {
    await signOut();
    return c.json({ ok: true });
  })
  .get("/models", async (c) => c.json(await listModels()))
  .put("/model", async (c) => {
    const { model } = z.object({ model: z.string().min(1).nullable() }).parse(await c.req.json());
    setSetting("model", model);
    return c.json({ ok: true });
  });
