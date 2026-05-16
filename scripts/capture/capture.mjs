#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const OUT = process.env.CAPTURE_OUT || "/tmp/biji-capture.jsonl";
const PROFILE = process.env.CAPTURE_PROFILE || "/tmp/biji-chromium-profile";
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const DOMAINS = /(biji\.com|trytalks\.com|luojilab\.com|iget\.com)/i;
const NOISY_PATHS =
  /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|css|map)(\?|$)|gtag|analytics|sensors\.|hot-update/i;

const stream = fs.createWriteStream(OUT, { flags: "a" });
function log(entry) {
  stream.write(JSON.stringify(entry) + "\n");
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: null,
  args: ["--no-default-browser-check"],
});

ctx.on("page", attachToPage);
for (const p of ctx.pages()) attachToPage(p);

const open = ctx.pages()[0] ?? (await ctx.newPage());
await open.goto("https://www.biji.com/").catch(() => {});

function attachToPage(page) {
  page.on("request", (req) => {
    const url = req.url();
    if (!DOMAINS.test(url)) return;
    if (NOISY_PATHS.test(url)) return;
    const headers = req.headers();
    let body = null;
    try {
      body = req.postData();
    } catch {}
    log({
      kind: "req",
      ts: Date.now(),
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      headers: pickHeaders(headers),
      body: body && body.length > 4000 ? body.slice(0, 4000) + "…[truncated]" : body,
    });
  });
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!DOMAINS.test(url)) return;
    if (NOISY_PATHS.test(url)) return;
    const req = resp.request();
    if (req.resourceType() === "image" || req.resourceType() === "font" || req.resourceType() === "stylesheet")
      return;
    let bodyPreview = null;
    try {
      const ct = resp.headers()["content-type"] || "";
      if (/json|text|event-stream/i.test(ct)) {
        const txt = await resp.text();
        bodyPreview = txt && txt.length > 4000 ? txt.slice(0, 4000) + "…[truncated]" : txt;
      }
    } catch {}
    log({
      kind: "resp",
      ts: Date.now(),
      status: resp.status(),
      method: req.method(),
      url,
      bodyPreview,
    });
  });
  page.on("websocket", (ws) => {
    log({ kind: "ws-open", ts: Date.now(), url: ws.url() });
  });
}

function pickHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (
      key.startsWith("x-") ||
      key === "authorization" ||
      key === "content-type" ||
      key === "accept" ||
      key === "origin" ||
      key === "referer"
    ) {
      out[k] = key === "authorization" ? "Bearer ***" : v;
    }
  }
  return out;
}

console.log(`\n📡 Capturing → ${OUT}`);
console.log("Chromium opened with persistent profile. Log in, then do your actions.");
console.log("Type 'tag <label>' + Enter to write a marker into the log (e.g. 'tag add-note').");
console.log("Type 'quit' or Ctrl+C to stop.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  const s = line.trim();
  if (s === "quit" || s === "exit") {
    stream.end();
    ctx.close().finally(() => process.exit(0));
  } else if (s.startsWith("tag ")) {
    log({ kind: "marker", ts: Date.now(), label: s.slice(4).trim() });
    console.log(`  ✓ marker: ${s.slice(4).trim()}`);
  } else if (s === "stats") {
    const bytes = fs.statSync(OUT).size;
    console.log(`  log size: ${bytes} bytes`);
  }
});

process.on("SIGINT", () => {
  stream.end();
  ctx.close().finally(() => process.exit(0));
});
