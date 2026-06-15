import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * One-stop registry of MCP clients that can auto-install the get-biji server,
 * plus the read/merge/remove plumbing shared by `biji setup` and `biji doctor`.
 *
 * Every supported client here consumes the identical `{ "<key>": { "<name>": spec } }`
 * shape (Claude Desktop / Claude Code / Cursor / Windsurf / Cline / Gemini CLI all
 * use the `mcpServers` key with a `{ command, args }` server spec). Clients with a
 * different schema (e.g. VS Code's `servers` + `type: stdio`) are covered by the
 * generic `--file/--key` escape hatch in the setup command, which prints the raw
 * snippet for manual paste.
 */

export const SERVER_NAME = "get-biji";

export interface McpServerSpec {
  command: string;
  args: string[];
}

export interface McpTarget {
  id: string;
  label: string;
  /** JSON config path for the current OS, or null if this client has no known path here. */
  configPath: () => string | null;
  /** Top-level key the server map lives under (every registered client uses `mcpServers`). */
  serversKey: string;
  /** Hint shown by `setup list` / `doctor` for clients that prefer their own CLI. */
  note?: string;
}

function home(...p: string[]): string {
  return path.join(os.homedir(), ...p);
}

/** Per-OS application-data root (macOS App Support / Windows APPDATA / XDG config). */
function appData(...p: string[]): string {
  if (process.platform === "darwin") return home("Library", "Application Support", ...p);
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || home("AppData", "Roaming"), ...p);
  }
  return path.join(process.env.XDG_CONFIG_HOME || home(".config"), ...p);
}

export const TARGETS: McpTarget[] = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    serversKey: "mcpServers",
    configPath: () => appData("Claude", "claude_desktop_config.json"),
  },
  {
    id: "claude-code",
    label: "Claude Code (user scope)",
    serversKey: "mcpServers",
    configPath: () => home(".claude.json"),
    note: "Alternative: `claude mcp add-json get-biji '<spec>' -s user`",
  },
  {
    id: "cursor",
    label: "Cursor",
    serversKey: "mcpServers",
    configPath: () => home(".cursor", "mcp.json"),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    serversKey: "mcpServers",
    configPath: () => home(".codeium", "windsurf", "mcp_config.json"),
  },
  {
    id: "cline",
    label: "Cline (VS Code)",
    serversKey: "mcpServers",
    configPath: () =>
      appData("Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    serversKey: "mcpServers",
    configPath: () => home(".gemini", "settings.json"),
  },
];

export function findTarget(id: string): McpTarget | undefined {
  return TARGETS.find((t) => t.id === id);
}

/**
 * Absolute path to the locally built MCP server entry (apps/mcp/dist/index.js).
 * Works from both the compiled CLI (apps/cli/dist/) and tsx dev (apps/cli/src/),
 * since both sit two levels under the `apps/` parent.
 */
export function localMcpEntry(): string {
  return path.resolve(__dirname, "..", "..", "mcp", "dist", "index.js");
}

export interface ServerSpecOptions {
  /** Emit the published `npx -y biji-mcp` form instead of the local node path. */
  npx?: boolean;
  /** Use the literal `"node"` command instead of an absolute node path. */
  node?: boolean;
}

export function resolveServerSpec(opts: ServerSpecOptions = {}): McpServerSpec {
  if (opts.npx) return { command: "npx", args: ["-y", "biji-mcp"] };
  const command = opts.node ? "node" : process.execPath;
  return { command, args: [localMcpEntry()] };
}

type JsonObject = Record<string, unknown>;

function readJson(file: string): JsonObject {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf-8").trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Strict JSON only — several clients tolerate JSONC (comments / trailing
    // commas), but we refuse to silently rewrite (and drop) the user's comments.
    throw new Error(
      `${file} is not strict JSON (comments or trailing commas are not supported): ${(e as Error).message}. ` +
      `Edit it by hand or fix the JSON, then retry.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`config is not a JSON object: ${file}`);
  }
  return parsed as JsonObject;
}

/** Atomic write: temp file in the same dir → fsync → rename. Never leaves a
 *  half-written target if the process dies mid-write (protects large stateful
 *  configs like ~/.claude.json). */
function writeJson(file: string, obj: JsonObject): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = JSON.stringify(obj, null, 2) + "\n";
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/** Copy to a unique, timestamped backup so prior good backups are never clobbered. */
function backupFile(file: string): string {
  const bak = `${file}.bak-${Date.now()}`;
  fs.copyFileSync(file, bak);
  return bak;
}

export interface ConfigStatus {
  target: McpTarget;
  path: string | null;
  exists: boolean;
  configured: boolean;
}

/** Whether `name` is already registered in the target's config. */
export function statusOf(target: McpTarget, name = SERVER_NAME): ConfigStatus {
  const file = target.configPath();
  if (!file || !fs.existsSync(file)) {
    return { target, path: file, exists: false, configured: false };
  }
  let configured = false;
  try {
    const obj = readJson(file);
    const servers = obj[target.serversKey];
    configured = !!servers && typeof servers === "object" && name in (servers as JsonObject);
  } catch {
    configured = false;
  }
  return { target, path: file, exists: true, configured };
}

export function allStatuses(name = SERVER_NAME): ConfigStatus[] {
  return TARGETS.map((t) => statusOf(t, name));
}

export interface WriteResult {
  path: string;
  created: boolean;
  backedUp: string | null;
  spec: McpServerSpec;
}

/** Merge the server spec into the target's config, backing up any existing file first. */
export function installServer(
  target: McpTarget,
  spec: McpServerSpec,
  name = SERVER_NAME,
): WriteResult {
  const file = target.configPath();
  if (!file) throw new Error(`${target.label} has no known config path on ${process.platform}`);
  const created = !fs.existsSync(file);
  // Parse FIRST: a throw here (corrupt / JSONC file) aborts before we touch
  // anything, so a good backup is never overwritten with garbage.
  const obj = readJson(file);
  const key = target.serversKey;
  if (!obj[key] || typeof obj[key] !== "object" || Array.isArray(obj[key])) obj[key] = {};
  (obj[key] as JsonObject)[name] = spec as unknown as JsonObject;
  const backedUp = created ? null : backupFile(file);
  writeJson(file, obj);
  return { path: file, created, backedUp, spec };
}

export interface RemoveResult {
  path: string | null;
  removed: boolean;
  backedUp: string | null;
}

export function uninstallServer(target: McpTarget, name = SERVER_NAME): RemoveResult {
  const file = target.configPath();
  if (!file || !fs.existsSync(file)) return { path: file, removed: false, backedUp: null };
  const obj = readJson(file);
  const servers = obj[target.serversKey];
  if (!servers || typeof servers !== "object" || !(name in (servers as JsonObject))) {
    return { path: file, removed: false, backedUp: null };
  }
  const backedUp = backupFile(file);
  delete (servers as JsonObject)[name];
  writeJson(file, obj);
  return { path: file, removed: true, backedUp };
}

/** Install into an arbitrary config file (escape hatch for unsupported clients). */
export function installServerToFile(
  file: string,
  spec: McpServerSpec,
  serversKey = "mcpServers",
  name = SERVER_NAME,
): WriteResult {
  const synthetic: McpTarget = {
    id: "custom",
    label: file,
    serversKey,
    configPath: () => file,
  };
  return installServer(synthetic, spec, name);
}
