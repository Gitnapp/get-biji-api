import { claimNext, counts, failJob, finishJob, resetStuckRunning } from "./store.js";
import { runLinkJob, runUploadJob } from "./runners.js";
import type { Job, JobResult, LinkPayload, UploadPayload } from "./types.js";

const CONCURRENCY = 3;
const IDLE_EXIT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 1500;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 10 * 60_000;
const JOB_TIMEOUT_MS = 10 * 60_000;
const STUCK_THRESHOLD_MS = 15 * 60_000;

function log(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    timer.unref?.();
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function executeJob(job: Job): Promise<JobResult> {
  if (job.kind === "link") return runLinkJob(job.payload as LinkPayload);
  if (job.kind === "upload") return runUploadJob(job.payload as UploadPayload);
  throw new Error(`unknown job kind: ${(job as { kind: string }).kind}`);
}

async function processOne(job: Job): Promise<void> {
  const label = `[${job.id}] ${job.kind}`;
  log(`${label} START attempt=${job.attempt}/${job.max_attempts}`);
  try {
    const result = await withTimeout(executeJob(job), JOB_TIMEOUT_MS, label);
    finishJob(job.id, result);
    log(`${label} OK note_id=${result.note_id ?? "—"} title="${(result.title ?? "—").slice(0, 60)}"`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const isRateLimit = /40014|rate.?limit|too many request/i.test(msg);
    if (isRateLimit && job.attempt < job.max_attempts) {
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (job.attempt - 1));
      log(`${label} RATE_LIMIT — sleeping ${wait}ms before requeue`);
      await new Promise((r) => setTimeout(r, wait));
      failJob(job.id, msg, true);
    } else if (job.attempt < job.max_attempts) {
      log(`${label} RETRY (${job.attempt}/${job.max_attempts}): ${msg.slice(0, 200).replace(/\s+/g, " ")}`);
      failJob(job.id, msg, true);
    } else {
      log(`${label} FAIL: ${msg.slice(0, 200).replace(/\s+/g, " ")}`);
      failJob(job.id, msg, false);
    }
  }
}

let active = 0;
let lastWorkAt = Date.now();
let shutdown = false;

async function loop(): Promise<void> {
  while (!shutdown) {
    while (active < CONCURRENCY) {
      const job = claimNext();
      if (!job) break;
      lastWorkAt = Date.now();
      active++;
      processOne(job).finally(() => {
        active--;
        lastWorkAt = Date.now();
      });
    }
    if (active === 0 && Date.now() - lastWorkAt > IDLE_EXIT_MS) {
      log(`idle ${Math.round(IDLE_EXIT_MS / 1000)}s — exiting`);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  while (active > 0) await new Promise((r) => setTimeout(r, 200));
}

export async function runWorker(): Promise<void> {
  process.on("SIGTERM", () => { log("SIGTERM received — finishing in-flight then exit"); shutdown = true; });
  process.on("SIGINT", () => { log("SIGINT received — finishing in-flight then exit"); shutdown = true; });
  const reset = resetStuckRunning(STUCK_THRESHOLD_MS);
  if (reset) log(`reset ${reset} stuck running job(s) (started_at > ${Math.round(STUCK_THRESHOLD_MS / 60000)}m ago) to pending`);
  log(`worker started concurrency=${CONCURRENCY} pid=${process.pid} job_timeout=${Math.round(JOB_TIMEOUT_MS / 60000)}m backoff_max=${Math.round(BACKOFF_MAX_MS / 60000)}m queue=${JSON.stringify(counts())}`);
  await loop();
  log("worker exit");
}
