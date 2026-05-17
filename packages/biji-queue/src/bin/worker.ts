#!/usr/bin/env node
import {
  FileAuthStorage,
  loadAuth,
  setAuthStorage,
} from "@biji/client";
import { clearPid, writePid } from "../daemon.js";
import { runWorker } from "../worker.js";

setAuthStorage(new FileAuthStorage());
if (!loadAuth()) {
  console.error(`${new Date().toISOString()} worker abort: auth load failed (run \`biji auth login\` first)`);
  process.exit(1);
}

writePid(process.pid);
const cleanup = (): void => clearPid();
process.on("exit", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

runWorker().catch((e) => {
  console.error(`${new Date().toISOString()} worker fatal: ${(e as Error).stack || (e as Error).message || e}`);
  process.exit(1);
});
