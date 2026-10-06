import path from "node:path";
import fs from "node:fs";

const port = Number(process.env.PORT ?? 8787);

export const config = {
  port,
  /** Interface the HTTP server binds to. Docker sets 0.0.0.0; compose only publishes on 127.0.0.1. */
  host: process.env.HOST ?? "127.0.0.1",
  /**
   * Port the browser reaches the app on. Sign in with ChatGPT only accepts
   * http://127.0.0.1:{port}/callback as redirect, so this must be the host-side port.
   */
  publicPort: Number(process.env.PUBLIC_PORT ?? port),
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  /** Built frontend served by the API server in production. */
  webDir: process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : null,
  appName: "Resume Builder",
};

export const redirectUri = `http://127.0.0.1:${config.publicPort}/callback`;
export const appOrigin = `http://127.0.0.1:${config.publicPort}`;

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
