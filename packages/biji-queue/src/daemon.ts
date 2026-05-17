import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logPath, pidPath } from "./paths.js";

export interface AliveInfo {
  alive: boolean;
  pid?: number;
}

export function isWorkerAlive(): AliveInfo {
  const pf = pidPath();
  if (!fs.existsSync(pf)) return { alive: false };
  const raw = fs.readFileSync(pf, "utf-8").trim();
  const pid = Number(raw);
  if (!pid) return { alive: false };
  try {
    process.kill(pid, 0);
    return { alive: true, pid };
  } catch {
    return { alive: false, pid };
  }
}

/**
 * Resolve the path to the standalone worker entry that the daemon should
 * spawn. By default uses the bin shipped with this package (`bin/worker.js`
 * sibling of this compiled file), but tests or alternative wrappers can pass
 * a custom entry.
 */
function defaultWorkerEntry(): string {
  return path.join(__dirname, "bin", "worker.js");
}

export interface EnsureDaemonOptions {
  /** Override the worker entry path. Defaults to bin/worker.js next to daemon.js. */
  workerEntry?: string;
}

/**
 * Ensure a background worker is running. If one isn't, spawn a detached child
 * process that runs the queue worker bin and immediately unrefs so the parent
 * can exit.
 */
export function ensureDaemon(opts: EnsureDaemonOptions = {}): { pid: number; started: boolean } {
  const cur = isWorkerAlive();
  if (cur.alive && cur.pid !== undefined) return { pid: cur.pid, started: false };

  const entry = opts.workerEntry ?? defaultWorkerEntry();
  const out = fs.openSync(logPath(), "a");
  const err = fs.openSync(logPath(), "a");
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env,
  });
  child.unref();
  if (child.pid === undefined) throw new Error("failed to spawn worker daemon");
  fs.writeFileSync(pidPath(), String(child.pid));
  return { pid: child.pid, started: true };
}

export function writePid(pid: number): void {
  fs.writeFileSync(pidPath(), String(pid));
}

export function clearPid(): void {
  try { fs.unlinkSync(pidPath()); } catch { /* ignore */ }
}

export function stopDaemon(): { stopped: boolean; pid?: number } {
  const cur = isWorkerAlive();
  if (!cur.alive || cur.pid === undefined) {
    clearPid();
    return { stopped: false };
  }
  process.kill(cur.pid, "SIGTERM");
  return { stopped: true, pid: cur.pid };
}
