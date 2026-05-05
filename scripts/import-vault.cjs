#!/usr/bin/env node
// Bulk import an Obsidian vault into Get笔记 (biji.com).
// Resumable via progress.json — keyed by file absolute path.
// Usage: node scripts/import-vault.cjs [--limit N] [--dry] [--sleep MS]

const fs = require("fs");
const path = require("path");

const { createNote } = require(path.join(__dirname, "..", "apps", "cli", "dist", "api.js"));
const { loadAuth, authStatus } = require(path.join(__dirname, "..", "packages", "biji-client", "dist", "auth.js"));

if (!loadAuth()) {
  console.error("auth load failed — run `node apps/cli/dist/cli.js auth login` first");
  process.exit(1);
}
const _st = authStatus();
console.log(`[auth] authenticated=${_st.authenticated} jwt_expire_in=${_st.jwt_expire_in_seconds}s refresh_expire_in=${_st.refresh_expire_in_seconds}s`);

const VAULT = "/Users/admin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notee";
const PROGRESS_PATH = path.join(__dirname, "..", "biji-import-progress.json");
const SUBDIRS = ["distill", "input", "archive"]; // small first, archive last

const args = process.argv.slice(2);
const argVal = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = argVal("--limit") ? parseInt(argVal("--limit"), 10) : Infinity;
const DRY = args.includes("--dry");
const SLEEP_MS = argVal("--sleep") ? parseInt(argVal("--sleep"), 10) : 1500;

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8")); }
  catch { return {}; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

function walkMd(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(full);
    }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const progress = loadProgress();

  // Persist on Ctrl+C
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    saveProgress(progress);
    console.log("\n[interrupted] progress saved to", PROGRESS_PATH);
    process.exit(130);
  });

  const files = [];
  for (const sub of SUBDIRS) {
    const root = path.join(VAULT, sub);
    if (!fs.existsSync(root)) continue;
    files.push(...walkMd(root));
  }
  console.log(`[plan] found ${files.length} .md files across ${SUBDIRS.join("/")}`);
  console.log(`[plan] progress.json has ${Object.keys(progress).length} entries (${Object.values(progress).filter(v => v.prime_id).length} successful)`);

  let processed = 0, skipped = 0, ok = 0, failed = 0;

  for (const fp of files) {
    if (processed >= LIMIT) break;
    if (interrupted) break;

    const rec = progress[fp];
    if (rec && rec.prime_id) { skipped++; continue; }

    processed++;
    const title = path.basename(fp, ".md");
    let content;
    try { content = fs.readFileSync(fp, "utf-8"); }
    catch (e) {
      progress[fp] = { error: `read: ${e.message}`, time: Date.now() };
      failed++;
      console.log(`[${processed}] FAIL read  ${title}: ${e.message}`);
      continue;
    }
    if (!content.trim()) {
      progress[fp] = { error: "empty file", time: Date.now() };
      skipped++;
      console.log(`[${processed}] skip empty  ${title}`);
      continue;
    }

    if (DRY) {
      console.log(`[${processed}] DRY ${title}  (${content.length} chars)`);
      continue;
    }

    // Retry with exponential backoff on rate-limit (40014).
    let attempt = 0;
    let result = null;
    while (attempt < 6) {
      try {
        const res = await createNote({ content, title });
        const cRaw = res && res.c;
        const note = (cRaw && cRaw.data) ? cRaw.data : cRaw;
        const isRateLimit = res && res.h && res.h.c === 40014;
        if (isRateLimit) {
          const wait = Math.min(60_000, 5_000 * Math.pow(2, attempt));
          console.log(`[${processed}/${files.length}] rate-limit, backoff ${wait}ms (attempt ${attempt + 1})  ${title}`);
          await sleep(wait);
          attempt++;
          continue;
        }
        if (!note || !note.note_id) {
          result = { ok: false, kind: "resp", detail: JSON.stringify(res).slice(0, 200) };
          break;
        }
        result = { ok: true, prime_id: note.prime_id, note_id: note.note_id, returned_title: note.title };
        break;
      } catch (e) {
        result = { ok: false, kind: "throw", detail: e.message || String(e) };
        break;
      }
    }

    if (!result) {
      progress[fp] = { error: "rate-limit-exhausted", time: Date.now() };
      failed++;
      console.log(`[${processed}] FAIL backoff exhausted  ${title}`);
    } else if (result.ok) {
      progress[fp] = {
        prime_id: result.prime_id,
        note_id: result.note_id,
        title: result.returned_title || title,
        time: Date.now(),
      };
      ok++;
      console.log(`[${processed}/${files.length}] ok  ${result.prime_id}  ${title}`);
    } else {
      progress[fp] = { error: `${result.kind}: ${result.detail}`, time: Date.now() };
      failed++;
      console.log(`[${processed}] FAIL ${result.kind}  ${title}: ${result.detail}`);
    }

    if (processed % 10 === 0) saveProgress(progress);
    await sleep(SLEEP_MS);
  }

  saveProgress(progress);
  console.log(`\n[done] processed=${processed} ok=${ok} skipped=${skipped} failed=${failed}`);
  console.log(`[done] progress.json → ${PROGRESS_PATH}`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
