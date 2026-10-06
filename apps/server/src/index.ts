import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { ZodError } from "zod";
import { appOrigin, config } from "./config.ts";
import { NotConnectedError, OAuthError, handleCallback } from "./chatgpt/auth.ts";
import { ChatGPTError } from "./chatgpt/client.ts";
import { HttpError } from "./errors.ts";
import { authRoutes } from "./routes/auth.ts";
import { exportRoutes } from "./routes/export.ts";
import { jobRoutes } from "./routes/jobs.ts";
import { importRoutes } from "./routes/imports.ts";
import { profileRoutes } from "./routes/profiles.ts";

/** Where to send the browser after the OAuth callback (the Vite dev server in development). */
const webUrl = process.env.WEB_DEV_URL ?? "/";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "Invalid request", issues: err.issues }, 400);
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof NotConnectedError) return c.json({ error: err.message, code: "not_connected" }, 401);
  if (err instanceof ChatGPTError) {
    const status = err.status === 401 ? 401 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return c.json({ error: err.message, code: err.code }, status as 400);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

// Local-only app without sessions: block cross-site writes from other pages open in the browser.
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    const site = c.req.header("sec-fetch-site");
    if ((origin && !isLocalOrigin(origin)) || site === "cross-site") return c.json({ error: "Cross-origin request blocked" }, 403);
  }
  await next();
});

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/profiles", profileRoutes);
app.route("/api/imports", importRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/export", exportRoutes);

app.get("/callback", async (c) => {
  try {
    await handleCallback(c.req.query());
    return c.redirect(`${webUrl}?connected=1`);
  } catch (err) {
    console.error("Sign in with ChatGPT failed", err);
    const message = err instanceof OAuthError ? err.message : "Sign-in failed. Check the server logs.";
    return c.redirect(`${webUrl}?auth_error=${encodeURIComponent(message)}`);
  }
});

if (config.webDir) {
  const root = path.relative(process.cwd(), config.webDir);
  const indexHtml = fs.readFileSync(path.join(config.webDir, "index.html"), "utf8");
  app.use("/*", serveStatic({ root }));
  // SPA fallback for client-side routes.
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.html(indexHtml)));
}

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  console.log(`Fitted running → open ${appOrigin}`);
  if (config.host !== "127.0.0.1") console.log(`(listening on ${config.host}:${config.port})`);
});
