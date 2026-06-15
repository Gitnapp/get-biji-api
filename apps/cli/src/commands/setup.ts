import { Command } from "commander";
import * as fs from "fs";
import {
  TARGETS,
  SERVER_NAME,
  findTarget,
  localMcpEntry,
  resolveServerSpec,
  installServer,
  installServerToFile,
  uninstallServer,
  allStatuses,
  type McpServerSpec,
} from "../mcp-targets.js";

function knownIds(): string {
  return TARGETS.map((t) => t.id).join(", ");
}

function warnIfUnbuilt(spec: McpServerSpec): void {
  // The local-node spec points at apps/mcp/dist/index.js; warn early if it's missing.
  if (spec.command !== "npx" && !fs.existsSync(localMcpEntry())) {
    console.warn(`⚠ MCP server not built yet: ${localMcpEntry()}`);
    console.warn("  Run `pnpm -r build` so the configured server can start.\n");
  }
}

export function registerSetupCommand(program: Command): void {
  const setup = program
    .command("setup")
    .description("Auto-configure MCP clients (Claude Desktop/Code, Cursor, Windsurf, Cline, Gemini)");

  setup
    .command("add [tool]")
    .description("Write the get-biji MCP server into a client config (merges, backs up existing)")
    .option("--npx", "use the published `npx -y biji-mcp` form instead of the local build")
    .option("--node", "use the literal `node` command instead of an absolute node path")
    .option("--file <path>", "install into an arbitrary JSON config file (for unsupported clients)")
    .option("--key <key>", "server map key for --file (default: mcpServers)", "mcpServers")
    .option("--name <name>", "server name to register", SERVER_NAME)
    .option("--json", "JSON output")
    .action((
      tool: string | undefined,
      opts: { npx?: boolean; node?: boolean; file?: string; key?: string; name?: string; json?: boolean },
    ) => {
      const spec = resolveServerSpec({ npx: opts.npx, node: opts.node });
      const name = opts.name || SERVER_NAME;
      warnIfUnbuilt(spec);

      if (opts.file) {
        const r = installServerToFile(opts.file, spec, opts.key || "mcpServers", name);
        if (opts.json) { console.log(JSON.stringify({ ...r }, null, 2)); return; }
        console.log(`✓ ${name} → ${r.path}${r.created ? " (created)" : ""}`);
        if (r.backedUp) console.log(`  backup: ${r.backedUp}`);
        return;
      }

      if (!tool) {
        console.error(`Specify a tool (${knownIds()}) or use --file <path>.`);
        console.error("Tip: `biji setup list` shows config paths and current status.");
        process.exit(1);
      }

      const target = findTarget(tool);
      if (!target) {
        console.error(`Unknown tool '${tool}'. Known: ${knownIds()}.`);
        console.error(`For others: biji setup add --file <config.json> [--key mcpServers]`);
        console.error(`Manual snippet:\n${JSON.stringify({ [name]: spec }, null, 2)}`);
        process.exit(1);
      }

      const file = target.configPath();
      if (!file) {
        console.error(`${target.label} has no known config path on ${process.platform}.`);
        console.error(`Use: biji setup add --file <config.json>`);
        process.exit(1);
      }

      const r = installServer(target, spec, name);
      if (opts.json) { console.log(JSON.stringify({ tool: target.id, ...r }, null, 2)); return; }
      console.log(`✓ Configured ${target.label}: ${name} → ${r.path}${r.created ? " (created)" : ""}`);
      console.log(`  command: ${spec.command} ${spec.args.join(" ")}`);
      if (r.backedUp) console.log(`  backup:  ${r.backedUp}`);
      if (target.note) console.log(`  note:    ${target.note}`);
      console.log(`Restart ${target.label} to pick up the new server.`);
    });

  setup
    .command("remove [tool]")
    .alias("rm")
    .description("Remove the get-biji MCP server from a client config")
    .option("--name <name>", "server name to remove", SERVER_NAME)
    .option("--json", "JSON output")
    .action((tool: string | undefined, opts: { name?: string; json?: boolean }) => {
      const name = opts.name || SERVER_NAME;
      if (!tool) {
        console.error(`Specify a tool (${knownIds()}).`);
        process.exit(1);
      }
      const target = findTarget(tool);
      if (!target) {
        console.error(`Unknown tool '${tool}'. Known: ${knownIds()}.`);
        process.exit(1);
      }
      const r = uninstallServer(target, name);
      if (opts.json) { console.log(JSON.stringify({ tool: target.id, ...r }, null, 2)); return; }
      if (!r.removed) {
        console.log(`${name} not present in ${target.label}${r.path ? ` (${r.path})` : ""}.`);
        return;
      }
      console.log(`✓ Removed ${name} from ${target.label}: ${r.path}`);
      if (r.backedUp) console.log(`  backup: ${r.backedUp}`);
    });

  setup
    .command("list")
    .alias("ls")
    .description("Show every known MCP client, its config path, and whether get-biji is configured")
    .option("--name <name>", "server name to check", SERVER_NAME)
    .option("--json", "JSON output")
    .action((opts: { name?: string; json?: boolean }) => {
      const name = opts.name || SERVER_NAME;
      const rows = allStatuses(name);
      if (opts.json) {
        console.log(JSON.stringify(
          rows.map((r) => ({ tool: r.target.id, label: r.target.label, path: r.path, exists: r.exists, configured: r.configured })),
          null,
          2,
        ));
        return;
      }
      console.log(`MCP clients (server name: ${name}):\n`);
      for (const r of rows) {
        const mark = r.configured ? "✓ configured" : r.exists ? "· not set" : "· no config";
        console.log(`  ${r.target.id.padEnd(16)} ${mark.padEnd(14)} ${r.path ?? "(n/a on this OS)"}`);
      }
      console.log(`\nAdd:  biji setup add <tool>     Remove:  biji setup remove <tool>`);
      console.log(`Other clients:  biji setup add --file <config.json> [--key mcpServers]`);
    });
}
