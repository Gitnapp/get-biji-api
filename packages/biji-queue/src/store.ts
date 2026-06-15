import type Database from "better-sqlite3";
import { dbPath } from "./paths.js";
import type { Job, JobKind, JobPayload, JobResult, JobStatus, LinkPayload, UploadPayload } from "./types.js";

let _db: Database.Database | null = null;
let _driver: typeof import("better-sqlite3") | null = null;

/**
 * Lazy-load the better-sqlite3 native addon. Importing it at module scope would
 * crash any consumer that never touches the queue (e.g. the MCP server's other
 * ~93 tools) when no prebuilt binary matches the host Node ABI. Loading it here
 * means only queue operations pay that cost — and fail with a clear message.
 */
function loadDriver(): typeof import("better-sqlite3") {
  if (_driver) return _driver;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _driver = require("better-sqlite3") as typeof import("better-sqlite3");
    return _driver;
  } catch (e) {
    throw new Error(
      `queue subsystem unavailable: better-sqlite3 failed to load (${(e as Error).message}). ` +
      `Use a Node version with prebuilt binaries (18-22) or install a C++ toolchain for a source build.`,
    );
  }
}

export function db(): Database.Database {
  if (_db) return _db;
  const Driver = loadDriver();
  _db = new Driver(dbPath());
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      result TEXT,
      error TEXT,
      batch_id TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_status_created ON jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_batch ON jobs(batch_id);
  `);
  migrate(_db);
  return _db;
}

/**
 * Equal keys mean "same target": link jobs key off the URL, upload jobs key
 * off the file path. URLs are NOT normalized — `?utm_source=…` variants count
 * as distinct (predictable, avoids accidental dedupe of meaningful params).
 */
export function dedupeKey(kind: JobKind, payload: JobPayload): string {
  if (kind === "link") return `link:${(payload as LinkPayload).url}`;
  if (kind === "upload") return `upload:${(payload as UploadPayload).file}`;
  return `${kind}:${JSON.stringify(payload)}`;
}

function migrate(d: Database.Database): void {
  const cols = d.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "dedupe_key")) {
    d.exec("ALTER TABLE jobs ADD COLUMN dedupe_key TEXT");
    const rows = d.prepare("SELECT id, kind, payload FROM jobs").all() as Array<{ id: string; kind: string; payload: string }>;
    const upd = d.prepare("UPDATE jobs SET dedupe_key = ? WHERE id = ?");
    const tx = d.transaction(() => {
      for (const r of rows) {
        try {
          const p = JSON.parse(r.payload) as JobPayload;
          upd.run(dedupeKey(r.kind as JobKind, p), r.id);
        } catch {
          /* leave NULL */
        }
      }
    });
    tx();
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_dedupe ON jobs(dedupe_key, status)");
}

function genId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}_${r}`;
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    kind: row.kind as JobKind,
    payload: JSON.parse(row.payload as string) as JobPayload,
    status: row.status as JobStatus,
    attempt: row.attempt as number,
    max_attempts: row.max_attempts as number,
    result: row.result ? (JSON.parse(row.result as string) as JobResult) : undefined,
    error: (row.error as string | null) ?? undefined,
    batch_id: (row.batch_id as string | null) ?? undefined,
    created_at: row.created_at as number,
    started_at: (row.started_at as number | null) ?? undefined,
    finished_at: (row.finished_at as number | null) ?? undefined,
  };
}

export interface AddJobInput {
  kind: JobKind;
  payload: JobPayload;
  batch_id?: string;
  max_attempts?: number;
}

export interface AddJobOptions {
  /** Skip dedupe check and always insert a fresh row. */
  force?: boolean;
}

export interface AddJobResult {
  /** New job id, populated when an insert happened. */
  id?: string;
  /** Existing job we deduplicated against, populated when insert was skipped. */
  deduped?: Job;
}

/**
 * Find live (non-terminal) jobs with the same dedupe key. "Live" here means
 * pending / running / done — `done` is included so we don't create a second
 * note for the same target. Failed and canceled jobs do NOT block re-submission.
 */
export function findLiveByDedupeKey(key: string): Job[] {
  const rows = db().prepare(
    "SELECT * FROM jobs WHERE dedupe_key = ? AND status IN ('pending','running','done') ORDER BY created_at DESC",
  ).all(key) as Array<Record<string, unknown>>;
  return rows.map(rowToJob);
}

export function addJob(input: AddJobInput, opts: AddJobOptions = {}): AddJobResult {
  const key = dedupeKey(input.kind, input.payload);
  if (!opts.force) {
    const existing = findLiveByDedupeKey(key);
    if (existing.length > 0) return { deduped: existing[0] };
  }
  const id = genId();
  db().prepare(
    "INSERT INTO jobs (id, kind, payload, status, attempt, max_attempts, batch_id, created_at, dedupe_key) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)",
  ).run(
    id,
    input.kind,
    JSON.stringify(input.payload),
    input.max_attempts ?? 3,
    input.batch_id ?? null,
    Date.now(),
    key,
  );
  return { id };
}

/**
 * Atomically claim the next pending job. SELECT + UPDATE happens in a single
 * SQLite transaction so concurrent workers cannot race on the same row.
 */
export function claimNext(): Job | null {
  const d = db();
  const tx = d.transaction((): Job | null => {
    const row = d.prepare(
      "SELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
    ).get() as { id?: string } | undefined;
    if (!row?.id) return null;
    d.prepare(
      "UPDATE jobs SET status='running', attempt = attempt + 1, started_at = ? WHERE id = ? AND status='pending'",
    ).run(Date.now(), row.id);
    const updated = d.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id) as Record<string, unknown>;
    return rowToJob(updated);
  });
  return tx();
}

export function finishJob(id: string, result: JobResult): void {
  db().prepare(
    "UPDATE jobs SET status='done', result=?, error=NULL, finished_at=? WHERE id=?",
  ).run(JSON.stringify(result), Date.now(), id);
}

export function failJob(id: string, error: string, retry: boolean): void {
  if (retry) {
    db().prepare(
      "UPDATE jobs SET status='pending', error=?, started_at=NULL WHERE id=?",
    ).run(error, id);
  } else {
    db().prepare(
      "UPDATE jobs SET status='failed', error=?, finished_at=? WHERE id=?",
    ).run(error, Date.now(), id);
  }
}

/**
 * Worker startup recovery: jobs whose `started_at` is older than
 * `stuckThresholdMs` are considered abandoned (previous worker crashed mid-run)
 * and returned to 'pending'. The threshold avoids misclassifying a job that's
 * genuinely still in-flight on a sibling worker. Jobs without a `started_at`
 * (legacy rows) are always reset.
 */
export function resetStuckRunning(stuckThresholdMs: number): number {
  const cutoff = Date.now() - stuckThresholdMs;
  return db().prepare(
    "UPDATE jobs SET status='pending', started_at=NULL WHERE status='running' AND (started_at IS NULL OR started_at < ?)",
  ).run(cutoff).changes;
}

export interface CountsByStatus {
  pending: number;
  running: number;
  done: number;
  failed: number;
  canceled: number;
  total: number;
}

export function counts(): CountsByStatus {
  const rows = db().prepare("SELECT status, COUNT(*) as n FROM jobs GROUP BY status").all() as Array<{ status: string; n: number }>;
  const out: CountsByStatus = { pending: 0, running: 0, done: 0, failed: 0, canceled: 0, total: 0 };
  for (const r of rows) {
    if (r.status === "pending" || r.status === "running" || r.status === "done" || r.status === "failed" || r.status === "canceled") {
      out[r.status] = r.n;
    }
    out.total += r.n;
  }
  return out;
}

export interface ListFilter {
  status?: JobStatus;
  limit?: number;
  batch_id?: string;
}

export function listJobs(filter: ListFilter = {}): Job[] {
  let sql = "SELECT * FROM jobs WHERE 1=1";
  const args: unknown[] = [];
  if (filter.status) { sql += " AND status = ?"; args.push(filter.status); }
  if (filter.batch_id) { sql += " AND batch_id = ?"; args.push(filter.batch_id); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  args.push(filter.limit ?? 50);
  const rows = db().prepare(sql).all(...args) as Array<Record<string, unknown>>;
  return rows.map(rowToJob);
}

export function getJob(id: string): Job | null {
  const row = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function requeueFailed(ids: string[]): number {
  if (!ids.length) {
    return db().prepare(
      "UPDATE jobs SET status='pending', attempt=0, error=NULL, finished_at=NULL, started_at=NULL WHERE status='failed'",
    ).run().changes;
  }
  const stmt = db().prepare(
    "UPDATE jobs SET status='pending', attempt=0, error=NULL, finished_at=NULL, started_at=NULL WHERE id=? AND status IN ('failed','canceled','done')",
  );
  let n = 0;
  for (const id of ids) n += stmt.run(id).changes;
  return n;
}

export function cancelJob(id: string): boolean {
  return db().prepare(
    "UPDATE jobs SET status='canceled', finished_at=? WHERE id=? AND status='pending'",
  ).run(Date.now(), id).changes > 0;
}

export function clearDone(): number {
  return db().prepare("DELETE FROM jobs WHERE status='done'").run().changes;
}

export function clearAll(): number {
  return db().prepare("DELETE FROM jobs").run().changes;
}
