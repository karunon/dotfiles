import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface PermissionRule {
  id?: string;
  effect: "allow" | "ask" | "deny";
  tool?: string | string[];
  command?: string;
  path?: string;
  reason?: string;
  enabled?: boolean;
}

interface PermissionConfig {
  defaultEffect?: "allow" | "ask" | "deny";
  rules?: PermissionRule[];
}

interface ToolContext {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
}

const DEFAULT_CONFIG: Required<PermissionConfig> = { defaultEffect: "allow", rules: [] };

const readJson = (filePath: string): Partial<PermissionConfig> => {
  try {
    return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<PermissionConfig>) : {};
  } catch {
    return {};
  }
};

const writeJson = (filePath: string, config: PermissionConfig): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
};

const globalConfigPath = (): string => path.join(getAgentDir(), "permissions.json");
const projectConfigPath = (cwd: string): string => path.join(cwd, ".pi", "permissions.json");

const loadConfig = (cwd: string): Required<PermissionConfig> => {
  const global = readJson(globalConfigPath());
  const project = readJson(projectConfigPath(cwd));
  return {
    ...DEFAULT_CONFIG,
    ...global,
    ...project,
    rules: [...(global.rules ?? []), ...(project.rules ?? [])],
  };
};

const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const wildcardToRegExp = (pattern: string): RegExp =>
  new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");

const matchesPattern = (pattern: string | undefined, value: string): boolean =>
  !pattern || pattern === "*" || wildcardToRegExp(pattern).test(value);

const resolveToolPath = (cwd: string, rawPath: unknown): string | undefined => {
  if (typeof rawPath !== "string" || !rawPath.trim()) return undefined;
  const normalized = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
  const expanded = normalized === "~" || normalized.startsWith("~/") ? path.join(os.homedir(), normalized.slice(2)) : normalized;
  return path.resolve(cwd, expanded);
};

const targetPathFromInput = ({ toolName, input, cwd }: ToolContext): string | undefined => {
  if (!["read", "write", "edit", "ls", "grep", "find"].includes(toolName)) return undefined;
  return resolveToolPath(cwd, input.path ?? input.file_path);
};

const commandFromInput = ({ toolName, input }: ToolContext): string | undefined => {
  if (toolName === "bash" || toolName === "container_bash") return typeof input.command === "string" ? input.command : undefined;
  if (toolName === "background_bash" && input.action === "start") return typeof input.command === "string" ? input.command : undefined;
  return undefined;
};

const ruleMatchesTool = (rule: PermissionRule, toolName: string): boolean => {
  const tools = toArray(rule.tool);
  return tools.length === 0 || tools.some((tool) => matchesPattern(tool, toolName));
};

const compileRegex = (pattern: string): RegExp | undefined => {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return undefined;
  }
};

const ruleMatchesCommand = (rule: PermissionRule, command: string | undefined): boolean => {
  if (!rule.command) return true;
  if (command === undefined) return false;
  const regex = compileRegex(rule.command);
  return regex ? regex.test(command) : command.includes(rule.command);
};

const ruleMatchesPath = (rule: PermissionRule, targetPath: string | undefined, cwd: string): boolean => {
  if (!rule.path) return true;
  if (!targetPath) return false;
  const patternPath = path.isAbsolute(rule.path) ? rule.path : path.resolve(cwd, rule.path);
  return matchesPattern(patternPath, targetPath);
};

const matchingRules = (config: Required<PermissionConfig>, context: ToolContext): PermissionRule[] => {
  const command = commandFromInput(context);
  const targetPath = targetPathFromInput(context);
  return config.rules.filter(
    (rule) =>
      rule.enabled !== false &&
      ruleMatchesTool(rule, context.toolName) &&
      ruleMatchesCommand(rule, command) &&
      ruleMatchesPath(rule, targetPath, context.cwd),
  );
};

const strongestRule = (rules: PermissionRule[], defaultEffect: PermissionRule["effect"]): PermissionRule => {
  const rank = { allow: 0, ask: 1, deny: 2 } as const;
  return rules.reduce<PermissionRule>((best, rule) => (rank[rule.effect] >= rank[best.effect] ? rule : best), { effect: defaultEffect });
};

const describeDecision = (rule: PermissionRule, context: ToolContext): string => {
  const command = commandFromInput(context);
  const targetPath = targetPathFromInput(context);
  return [
    `Rule: ${rule.id ?? "(unnamed)"}`,
    `Effect: ${rule.effect}`,
    rule.reason ? `Reason: ${rule.reason}` : undefined,
    `Tool: ${context.toolName}`,
    command ? `Command: ${command}` : undefined,
    targetPath ? `Path: ${targetPath}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
};

const appendProjectRule = (cwd: string, rule: PermissionRule): void => {
  const filePath = projectConfigPath(cwd);
  const current = readJson(filePath);
  writeJson(filePath, { ...current, rules: [...(current.rules ?? []), rule] });
};

export default function permissionRules(pi: ExtensionAPI): void {
  pi.registerCommand("permissions", {
    description: "List or add permission rules (usage: /permissions list|add-deny <tool> <regex>|add-ask <tool> <regex>)",
    handler: async (args, ctx) => {
      const [action, tool, ...patternParts] = args.trim().split(/\s+/);
      if (!action || action === "list") {
        const config = loadConfig(ctx.cwd);
        const lines = config.rules.map(
          (rule, index) => `${index + 1}. ${rule.enabled === false ? "disabled " : ""}${rule.effect} tool=${toArray(rule.tool).join("|") || "*"} command=${rule.command ?? "*"} path=${rule.path ?? "*"}${rule.reason ? ` — ${rule.reason}` : ""}`,
        );
        ctx.ui.notify(lines.length ? lines.join("\n") : "No permission rules configured.", "info");
        return;
      }

      if ((action === "add-deny" || action === "add-ask") && tool && patternParts.length > 0) {
        const rule: PermissionRule = {
          id: `${action}-${tool}-${Date.now().toString(36)}`,
          effect: action === "add-deny" ? "deny" : "ask",
          tool,
          command: patternParts.join(" "),
          reason: "Added from /permissions command",
        };
        appendProjectRule(ctx.cwd, rule);
        ctx.ui.notify(`Added project permission rule in ${projectConfigPath(ctx.cwd)}.`, "info");
        return;
      }

      ctx.ui.notify("Usage: /permissions list|add-deny <tool> <command-regex>|add-ask <tool> <command-regex>", "error");
    },
  });

  pi.registerTool({
    name: "permission_rules",
    label: "Permission Rules",
    description: "Inspect active permission rules. Use to understand why a tool call may be blocked or require approval.",
    parameters: Type.Object({
      action: StringEnum(["list"] as const),
    }),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }], details: config };
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const context: ToolContext = { toolName: event.toolName, input: event.input as Record<string, unknown>, cwd: ctx.cwd };
    const config = loadConfig(ctx.cwd);
    const rule = strongestRule(matchingRules(config, context), config.defaultEffect);
    if (rule.effect === "allow") return;
    if (rule.effect === "deny") return { block: true, reason: rule.reason ?? describeDecision(rule, context) };
    if (!ctx.hasUI) return { block: true, reason: `Permission rule requires approval but UI is unavailable.\n${describeDecision(rule, context)}` };
    const ok = await ctx.ui.confirm("Permission rule approval", `${describeDecision(rule, context)}\n\nAllow this tool call?`);
    if (!ok) return { block: true, reason: `Denied by permission rule. ${rule.reason ?? ""}`.trim() };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const rules = loadConfig(ctx.cwd).rules.filter((rule) => rule.enabled !== false);
    if (rules.length === 0) return;
    const summary = rules
      .map((rule) => `- ${rule.effect.toUpperCase()} ${toArray(rule.tool).join("|") || "*"}${rule.command ? ` command~/${rule.command}/` : ""}${rule.path ? ` path=${rule.path}` : ""}${rule.reason ? ` (${rule.reason})` : ""}`)
      .join("\n");
    return { systemPrompt: `${event.systemPrompt}\n\n[ACTIVE PERMISSION RULES]\n${summary}` };
  });
}
