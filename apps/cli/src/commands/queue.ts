import { Command } from "commander";
import * as fs from "fs";
import {
  addJob,
  cancelJob,
  clearAll,
  clearDone,
  clearPid,
  counts,
  ensureDaemon,
  getJob,
  isWorkerAlive,
  listJobs,
  logPath,
  requeueFailed,
  runWorker,
  stopDaemon,
  writePid,
  type JobStatus,
  type LinkPayload,
  type UploadPayload,
} from "@biji/queue";

function readUrlFile(file: string): string[] {
  const out: string[] = [];
  const text = fs.readFileSync(file, "utf-8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    out.push(line);
  }
  return out;
}

function fmtAgo(ms: number | undefined): string {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function jobOneLineWhat(kind: string, payload: LinkPayload | UploadPayload): string {
  if (kind === "link") return (payload as LinkPayload).url;
  if (kind === "upload") return (payload as UploadPayload).file;
  return JSON.stringify(payload);
}

export function registerQueueCommand(program: Command): void {
  const q = program
    .command("queue")
    .description("Background job queue — submit URLs, worker runs in background");

  q.command("add [urls...]")
    .description("Enqueue one or more URLs as link jobs (worker auto-starts; duplicates skipped)")
    .option("-f, --file <path>", "read URLs from a file (one per line; # comments)")
    .option("--topic <alias>", "drop resulting notes into a KB topic")
    .option("-p, --prompt <text>", "custom AI instruction (applies to every URL)")
    .option("--batch <name>", "tag these jobs with a batch id (for status/retry)")
    .option("--max-attempts <n>", "max attempts per job", "3")
    .option("--force", "skip dedupe — enqueue even if an identical URL is pending/running/done")
    .option("--no-daemon", "don't auto-start worker")
    .option("--json", "JSON output")
    .action(async (
      urls: string[],
      opts: {
        file?: string;
        topic?: string;
        prompt?: string;
        batch?: string;
        maxAttempts?: string;
        force?: boolean;
        daemon?: boolean;
        json?: boolean;
      },
    ) => {
      const all = [...(urls ?? [])];
      if (opts.file) all.push(...readUrlFile(opts.file));
      if (!all.length) {
        console.error("No URLs. Pass as args or via -f <file>.");
        process.exit(1);
      }
      const ids: string[] = [];
      const duplicates: Array<{ url: string; existing_id: string; status: string }> = [];
      for (const url of all) {
        const payload: LinkPayload = { url };
        if (opts.prompt) payload.prompt = opts.prompt;
        if (opts.topic) payload.topic_alias = opts.topic;
        const r = addJob(
          { kind: "link", payload, batch_id: opts.batch, max_attempts: Number(opts.maxAttempts ?? 3) },
          { force: opts.force },
        );
        if (r.id) ids.push(r.id);
        else if (r.deduped) duplicates.push({ url, existing_id: r.deduped.id, status: r.deduped.status });
      }
      const daemon = (opts.daemon === false || ids.length === 0) ? null : ensureDaemon();
      if (opts.json) {
        console.log(JSON.stringify({ enqueued: ids.length, ids, skipped: duplicates.length, duplicates, daemon }, null, 2));
        return;
      }
      const skipNote = duplicates.length
        ? `, skipped ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} (use --force to override)`
        : "";
      console.log(`Enqueued ${ids.length} new link job(s)${skipNote}.`);
      if (duplicates.length) {
        for (const d of duplicates.slice(0, 5)) {
          console.log(`  · dup [${d.status}] ${d.existing_id}  ${d.url.slice(0, 60)}`);
        }
        if (duplicates.length > 5) console.log(`  · …and ${duplicates.length - 5} more`);
      }
      if (daemon) {
        console.log(`Worker ${daemon.started ? "started" : "running"} (pid=${daemon.pid}, log=${logPath()})`);
      } else if (opts.daemon === false) {
        console.log("Worker not started (--no-daemon). Run: biji queue worker  — or — biji queue add <url> (auto-starts)");
      }
      if (ids.length) console.log("Track:  biji queue status  |  biji queue list  |  biji queue logs -f");
    });

  q.command("upload [files...]")
    .description("Enqueue local audio/video files as upload jobs (duplicates skipped)")
    .option("-f, --file-list <path>", "read file paths from a list (one per line)")
    .option("--topic <alias>", "drop resulting notes into a KB topic")
    .option("-p, --prompt <text>", "custom AI instruction")
    .option("-k, --kind <audio|video>", "force media kind (auto-detected from extension)")
    .option("--batch <name>", "tag these jobs with a batch id")
    .option("--max-attempts <n>", "max attempts per job", "3")
    .option("--force", "skip dedupe — enqueue even if the same file is pending/running/done")
    .option("--no-daemon", "don't auto-start worker")
    .option("--json", "JSON output")
    .action((
      files: string[],
      opts: {
        fileList?: string;
        topic?: string;
        prompt?: string;
        kind?: "audio" | "video";
        batch?: string;
        maxAttempts?: string;
        force?: boolean;
        daemon?: boolean;
        json?: boolean;
      },
    ) => {
      const all = [...(files ?? [])];
      if (opts.fileList) all.push(...readUrlFile(opts.fileList));
      if (!all.length) {
        console.error("No files. Pass as args or via -f <list>.");
        process.exit(1);
      }
      if (opts.kind && opts.kind !== "audio" && opts.kind !== "video") {
        console.error(`--kind must be 'audio' or 'video', got: ${opts.kind}`);
        process.exit(1);
      }
      const ids: string[] = [];
      const duplicates: Array<{ file: string; existing_id: string; status: string }> = [];
      for (const file of all) {
        const payload: UploadPayload = { file };
        if (opts.prompt) payload.prompt = opts.prompt;
        if (opts.topic) payload.topic_alias = opts.topic;
        if (opts.kind) payload.kind = opts.kind;
        const r = addJob(
          { kind: "upload", payload, batch_id: opts.batch, max_attempts: Number(opts.maxAttempts ?? 3) },
          { force: opts.force },
        );
        if (r.id) ids.push(r.id);
        else if (r.deduped) duplicates.push({ file, existing_id: r.deduped.id, status: r.deduped.status });
      }
      const daemon = (opts.daemon === false || ids.length === 0) ? null : ensureDaemon();
      if (opts.json) {
        console.log(JSON.stringify({ enqueued: ids.length, ids, skipped: duplicates.length, duplicates, daemon }, null, 2));
        return;
      }
      const skipNote = duplicates.length
        ? `, skipped ${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} (use --force to override)`
        : "";
      console.log(`Enqueued ${ids.length} new upload job(s)${skipNote}.`);
      if (duplicates.length) {
        for (const d of duplicates.slice(0, 5)) {
          console.log(`  · dup [${d.status}] ${d.existing_id}  ${d.file.slice(0, 60)}`);
        }
        if (duplicates.length > 5) console.log(`  · …and ${duplicates.length - 5} more`);
      }
      if (daemon) {
        console.log(`Worker ${daemon.started ? "started" : "running"} (pid=${daemon.pid}, log=${logPath()})`);
      }
    });

  q.command("status")
    .description("Show worker liveness and queue summary")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => {
      const alive = isWorkerAlive();
      const c = counts();
      if (opts.json) {
        console.log(JSON.stringify({ worker: alive, counts: c, log: logPath() }, null, 2));
        return;
      }
      console.log(`Worker: ${alive.alive ? `running (pid=${alive.pid})` : "not running"}`);
      console.log(`Queue:  pending=${c.pending} running=${c.running} done=${c.done} failed=${c.failed} canceled=${c.canceled}  (total=${c.total})`);
      console.log(`Log:    ${logPath()}`);
    });

  q.command("list")
    .description("List jobs (most recent first)")
    .option("-s, --status <status>", "filter by status (pending|running|done|failed|canceled)")
    .option("-n, --limit <n>", "limit", "20")
    .option("--batch <name>", "filter by batch id")
    .option("--json", "JSON output")
    .action((opts: { status?: string; limit?: string; batch?: string; json?: boolean }) => {
      const jobs = listJobs({
        status: opts.status as JobStatus | undefined,
        limit: Number(opts.limit ?? 20),
        batch_id: opts.batch,
      });
      if (opts.json) { console.log(JSON.stringify(jobs, null, 2)); return; }
      if (!jobs.length) { console.log("(no jobs)"); return; }
      for (const j of jobs) {
        const what = jobOneLineWhat(j.kind, j.payload).slice(0, 60);
        const note = j.result?.note_id ? ` → ${j.result.note_id}` : "";
        const err = j.error ? `  err=${j.error.slice(0, 50).replace(/\s+/g, " ")}` : "";
        console.log(`${j.id}  ${j.status.padEnd(8)} ${j.kind.padEnd(6)} a=${j.attempt}/${j.max_attempts}  ${fmtAgo(j.created_at).padEnd(8)}  ${what}${note}${err}`);
      }
    });

  q.command("show <id>")
    .description("Print a single job's full detail")
    .action((id: string) => {
      const j = getJob(id);
      if (!j) { console.error(`job not found: ${id}`); process.exit(1); }
      console.log(JSON.stringify(j, null, 2));
    });

  q.command("retry [ids...]")
    .description("Re-queue jobs. With --all-failed, re-queues every failed job.")
    .option("--all-failed", "re-queue every failed job (ignores [ids...])")
    .action((ids: string[], opts: { allFailed?: boolean }) => {
      if (!ids?.length && !opts.allFailed) {
        console.error("Pass job ids or --all-failed.");
        process.exit(1);
      }
      const n = requeueFailed(opts.allFailed ? [] : ids);
      console.log(`Re-queued ${n} job(s).`);
      if (n > 0) {
        const d = ensureDaemon();
        console.log(`Worker ${d.started ? "started" : "running"} (pid=${d.pid})`);
      }
    });

  q.command("cancel <ids...>")
    .description("Cancel pending jobs (running ones are not interrupted)")
    .action((ids: string[]) => {
      let n = 0;
      for (const id of ids) if (cancelJob(id)) n++;
      console.log(`Canceled ${n}/${ids.length} pending job(s).`);
    });

  q.command("clear")
    .description("Remove finished jobs (default: only 'done'; --all wipes everything)")
    .option("--all", "DELETE every job including pending/running")
    .action((opts: { all?: boolean }) => {
      if (opts.all) {
        const n = clearAll();
        console.log(`Deleted ${n} job(s) (full wipe).`);
      } else {
        const n = clearDone();
        console.log(`Deleted ${n} done job(s).`);
      }
    });

  q.command("logs")
    .description("Print the worker log (use -f to follow)")
    .option("-f, --follow", "follow new lines")
    .option("-n, --lines <n>", "tail N lines", "50")
    .action((opts: { follow?: boolean; lines?: string }) => {
      const lp = logPath();
      if (!fs.existsSync(lp)) { console.log("(no log file yet)"); return; }
      const data = fs.readFileSync(lp, "utf-8");
      const lines = data.split("\n");
      const n = Number(opts.lines ?? 50);
      process.stdout.write(lines.slice(-n - 1).join("\n"));
      if (!opts.follow) {
        if (!data.endsWith("\n")) process.stdout.write("\n");
        return;
      }
      let size = fs.statSync(lp).size;
      const timer = setInterval(() => {
        try {
          const cur = fs.statSync(lp).size;
          if (cur > size) {
            const fd = fs.openSync(lp, "r");
            const buf = Buffer.alloc(cur - size);
            fs.readSync(fd, buf, 0, buf.length, size);
            fs.closeSync(fd);
            process.stdout.write(buf);
            size = cur;
          }
        } catch { /* ignore */ }
      }, 1000);
      process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
    });

  q.command("worker")
    .description("Run the worker in the foreground (debug). With --daemon, marks itself as the background worker.")
    .option("--daemon", "mark this process as the queue daemon (writes PID, clears on exit)")
    .action(async (opts: { daemon?: boolean }) => {
      if (opts.daemon) {
        writePid(process.pid);
        const cleanup = (): void => clearPid();
        process.on("exit", cleanup);
        process.on("SIGTERM", cleanup);
        process.on("SIGINT", cleanup);
      }
      await runWorker();
    });

  q.command("stop")
    .description("Stop the background worker (SIGTERM — finishes in-flight then exits)")
    .action(() => {
      const r = stopDaemon();
      if (!r.stopped) {
        console.log("No worker running.");
      } else {
        console.log(`Sent SIGTERM to worker pid=${r.pid}. (worker will exit after finishing in-flight jobs)`);
      }
    });
}
