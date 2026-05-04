import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { AuthInfo } from "./auth.js";

/**
 * Pluggable persistence for AuthInfo. Hosts inject the strategy that fits them:
 *   CLI / stdio MCP → FileAuthStorage (~/.config/get-biji/auth.json)
 *   HTTP MCP server → MemoryAuthStorage or a custom multi-tenant adapter
 */
export interface AuthStorage {
  load(): AuthInfo | null;
  save(auth: AuthInfo): void;
}

const DEFAULT_AUTH_FILE = path.join(os.homedir(), ".config", "get-biji", "auth.json");

export class FileAuthStorage implements AuthStorage {
  readonly file: string;

  constructor(filePath?: string) {
    this.file = filePath ?? DEFAULT_AUTH_FILE;
  }

  load(): AuthInfo | null {
    try {
      if (!fs.existsSync(this.file)) return null;
      const data = JSON.parse(fs.readFileSync(this.file, "utf-8")) as AuthInfo;
      return data.token ? data : null;
    } catch {
      return null;
    }
  }

  save(auth: AuthInfo): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(auth, null, 2), { mode: 0o600 });
  }
}

export class MemoryAuthStorage implements AuthStorage {
  private value: AuthInfo | null = null;
  load(): AuthInfo | null {
    return this.value;
  }
  save(auth: AuthInfo): void {
    this.value = { ...auth };
  }
}
