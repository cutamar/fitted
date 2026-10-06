/**
 * PDF export: headless Chromium prints the web app's /print page, which renders
 * the same CvDocument component as the live preview. Text stays real, selectable text.
 */
import fs from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { config } from "../config.ts";
import type { ExportKind } from "./source.ts";

const CANDIDATES = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/opt/pw-browsers/chromium"];

function chromiumPath(): string {
  const found = CANDIDATES.find((p): p is string => !!p && fs.existsSync(p));
  if (!found) throw new Error("Chromium not found. Set CHROMIUM_PATH to a Chromium/Chrome binary to enable PDF export.");
  return found;
}

/** The print page is served by this server in production, by Vite in development. */
function printOrigin(): string {
  if (config.webDir) return `http://127.0.0.1:${config.port}`;
  return (process.env.WEB_DEV_URL ?? "http://127.0.0.1:5173/").replace(/\/$/, "");
}

let browser: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/** One shared browser, closed after a minute without exports. */
async function getBrowser(): Promise<Browser> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const b = browser;
    browser = null;
    void b?.then((x) => x.close()).catch(() => {});
  }, 60_000);
  browser ??= chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch((err) => {
    browser = null;
    throw err;
  });
  return browser;
}

export async function renderPdf(kind: ExportKind, id: string): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.goto(`${printOrigin()}/print/${kind}/${id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("body[data-print-ready]", { timeout: 15_000 });
    const error = await page.getAttribute("body", "data-print-error");
    if (error) throw new Error(error);
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
  } finally {
    await page.close();
  }
}
