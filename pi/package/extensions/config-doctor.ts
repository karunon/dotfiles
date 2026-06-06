import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

type Severity = "ok" | "warn" | "error";

interface CheckResult {
  name: string;
  severity: Severity;
  message: string;
}

const configFiles = [
  "settings.json",
  "models.json",
  "presets.json",
  "container.json",
  "sandbox-profiles.json",
  "network-policy.json",
  "permissions.json",
  "hooks.json",
  "mcp.json",
  "secrets.json",
  "usage-guard.json",
  "audit.json",
];

const icon = (severity: Severity): string => ({ ok: "✓", warn: "!", error: "✗" })[severity];

const jsonCheck = (filePath: string): CheckResult => {
  if (!fs.existsSync(filePath)) return { name: path.basename(filePath), severity: "warn", message: "missing" };
  try {
    JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return { name: path.basename(filePath), severity: "ok", message: filePath };
  } catch (error) {
    return { name: path.basename(filePath), severity: "error", message: error instanceof Error ? error.message : String(error) };
  }
};

const commandCheck = async (pi: ExtensionAPI, cwd: string, command: string, args: string[] = ["--version"]): Promise<CheckResult> => {
  const result = await pi.exec(command, args, { cwd, timeout: 8_000 });
  return result.code === 0
    ? { name: command, severity: "ok", message: (result.stdout || result.stderr).split("\n")[0] ?? "available" }
    : { name: command, severity: "warn", message: "not available or failed" };
};

const packageCheck = (): CheckResult => {
  const packagePath = path.join(getAgentDir(), "dotfiles-package", "package.json");
  if (!fs.existsSync(packagePath)) return { name: "dotfiles-package", severity: "error", message: `missing: ${packagePath}` };
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
    const extensions = pkg?.pi?.extensions ?? [];
    return { name: "dotfiles-package", severity: extensions.length > 0 ? "ok" : "warn", message: `${extensions.length} extension(s)` };
  } catch (error) {
    return { name: "dotfiles-package", severity: "error", message: error instanceof Error ? error.message : String(error) };
  }
};

const mcpCheck = (cwd: string): CheckResult => {
  const paths = [path.join(getAgentDir(), "mcp.json"), path.join(cwd, ".pi", "mcp.json")];
  const serverCount = paths.reduce((count, filePath) => {
    try {
      const parsed = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
      return count + Object.keys(parsed.servers ?? {}).length;
    } catch {
      return count;
    }
  }, 0);
  return { name: "mcp servers", severity: "ok", message: `${serverCount} configured` };
};

const render = (checks: CheckResult[]): string =>
  checks.map((check) => `${icon(check.severity)} ${check.name}: ${check.message}`).join("\n");

export default function configDoctor(pi: ExtensionAPI): void {
  pi.registerCommand("doctor", {
    description: "Diagnose pi dotfiles package configuration and dependencies",
    handler: async (_args, ctx) => {
      const agentDir = getAgentDir();
      const globalChecks = configFiles.map((name) => jsonCheck(path.join(agentDir, name)));
      const projectChecks = configFiles
        .map((name) => path.join(ctx.cwd, ".pi", name))
        .filter((filePath) => fs.existsSync(filePath))
        .map(jsonCheck);
      const commandChecks = await Promise.all([
        commandCheck(pi, ctx.cwd, "git"),
        commandCheck(pi, ctx.cwd, "gh"),
        commandCheck(pi, ctx.cwd, "docker"),
        commandCheck(pi, ctx.cwd, "podman"),
        commandCheck(pi, ctx.cwd, "bun"),
        commandCheck(pi, ctx.cwd, "node"),
        commandCheck(pi, ctx.cwd, "aio-websearch", ["--help"]),
        commandCheck(pi, ctx.cwd, "text-browser", ["--help"]),
      ]);

      const checks = [packageCheck(), mcpCheck(ctx.cwd), ...globalChecks, ...projectChecks, ...commandChecks];
      ctx.ui.notify(render(checks), checks.some((check) => check.severity === "error") ? "error" : checks.some((check) => check.severity === "warn") ? "warning" : "info");
    },
  });
}
