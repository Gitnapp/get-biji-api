import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ROOT = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "get-biji",
  "queue",
);

export function queueDir(): string {
  fs.mkdirSync(ROOT, { recursive: true });
  return ROOT;
}

export const dbPath = (): string => path.join(queueDir(), "queue.db");
export const pidPath = (): string => path.join(queueDir(), "worker.pid");
export const logPath = (): string => path.join(queueDir(), "worker.log");
