import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const DANGEROUS_BASH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-rf?|--recursive|--force)\b/i, reason: "recursive/forced remove" },
  { pattern: /\bsudo\b/i, reason: "sudo" },
  { pattern: /\b(chmod|chown|chgrp)\b/i, reason: "permission/owner change" },
  { pattern: /\bdd\b|\bmkfs\b|\bdiskutil\s+erase/i, reason: "disk operation" },
  { pattern: /\b(reboot|shutdown|halt)\b/i, reason: "system shutdown" },
  { pattern: /\b(kill|pkill|killall)\b/i, reason: "process termination" },
  { pattern: /\bgit\s+(reset\s+--hard|clean\s+-[xdf]+|push\s+--force|rebase|checkout\s+-f)\b/i, reason: "destructive git operation" },
  { pattern: /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|uninstall|update|upgrade)\b/i, reason: "package mutation" },
  { pattern: /\b(brew|apt|apt-get|dnf|yum|pacman)\s+(install|remove|upgrade|update)\b/i, reason: "system package mutation" },
  { pattern: /\bcurl\b[^|;]*\|\s*(sh|bash|zsh)\b/i, reason: "pipe remote script to shell" },
  { pattern: /\bwget\b[^|;]*\|\s*(sh|bash|zsh)\b/i, reason: "pipe remote script to shell" },
];

function normalizeToolPath(rawPath: unknown, cwd: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim() === "") return undefined;

  let input = rawPath.trim();
  if (input.startsWith("@")) input = input.slice(1);
  if (input === "~" || input.startsWith("~/")) {
    input = path.join(os.homedir(), input.slice(2));
  }
  return path.resolve(cwd, input);
}

function pathComponents(filePath: string): string[] {
  return filePath.split(path.sep).filter(Boolean);
}

function isProtectedPath(filePath: string): string | undefined {
  const home = os.homedir();
  const base = path.basename(filePath);
  const components = pathComponents(filePath);

  if (components.includes(".git")) return ".git";
  if (components.includes("node_modules")) return "node_modules";

  if (base.startsWith(".env") && !/\.(example|sample|template)$/i.test(base)) return ".env";
  if ([".npmrc", ".netrc", "auth.json"].includes(base)) return base;
  if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/.test(base)) return "SSH private/public key";

  const protectedHomeDirs = [".ssh", ".gnupg", ".aws", ".config/gcloud", ".kube"];
  for (const protectedDir of protectedHomeDirs) {
    const protectedPath = path.join(home, protectedDir);
    if (filePath === protectedPath || filePath.startsWith(`${protectedPath}${path.sep}`)) {
      return protectedDir;
    }
  }

  if (filePath === path.join(home, ".pi", "agent", "auth.json")) return "pi auth.json";

  return undefined;
}

function collectCommandRiskReasons(command: string): string[] {
  const reasons = DANGEROUS_BASH_PATTERNS
    .filter(({ pattern }) => pattern.test(command))
    .map(({ reason }) => reason);
  return Array.from(new Set(reasons));
}

function commandFromToolCall(toolName: string, input: Record<string, unknown>): string | undefined {
  if (toolName === "bash" || toolName === "container_bash") {
    const command = input.command;
    return typeof command === "string" && command.trim() ? command : undefined;
  }

  if (toolName === "background_bash") {
    const action = input.action;
    const command = input.command;
    if (action !== "start") return undefined;
    return typeof command === "string" && command.trim() ? command : undefined;
  }

  return undefined;
}

function textBeforeToolCall(ctx: ExtensionContext, toolCallId: string): string | undefined {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;

    const content = entry.message.content;
    const toolIndex = content.findIndex((part) => part.type === "toolCall" && part.id === toolCallId);
    const relevantContent = toolIndex >= 0 ? content.slice(0, toolIndex) : content;
    const text = relevantContent
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .replace(/```[\s\S]*?```/g, "[code]")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;
    return text.length > 320 ? `${text.slice(0, 317)}...` : text;
  }

  return undefined;
}

function formatCommandApprovalBody(toolName: string, command: string, riskReasons: string[], agentReason?: string): string {
  return [
    `Tool: ${toolName}`,
    `Risk reason: ${riskReasons.join(", ")}`,
    `Agent reason: ${agentReason ?? "No explicit rationale was provided before the tool call."}`,
    "",
    "Command:",
    command,
    "",
    "Allow this command?",
  ].join("\n");
}

export default function safetyGates(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n## Command approval rationale\nWhen using bash, background_bash, or container_bash, include a concise one-sentence reason immediately before the tool call. The approval dialog may show this reason to the user. Keep it factual and do not reveal hidden chain-of-thought.`,
  }));

  pi.on("tool_call", async (event, ctx) => {
    const command = commandFromToolCall(event.toolName, event.input as Record<string, unknown>);
    if (command) {
      const riskReasons = collectCommandRiskReasons(command);
      if (riskReasons.length === 0) return;

      const reasonText = riskReasons.join(", ");
      if (!ctx.hasUI) {
        return { block: true, reason: `Dangerous command blocked (${reasonText}).` };
      }

      const ok = await ctx.ui.confirm(
        `Approve ${event.toolName} command`,
        formatCommandApprovalBody(event.toolName, command, riskReasons, textBeforeToolCall(ctx, event.toolCallId)),
      );
      if (!ok) return { block: true, reason: `Blocked by safety gate (${reasonText}).` };
      return;
    }

    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const targetPath = normalizeToolPath(event.input.path ?? event.input.file_path, ctx.cwd);
    if (!targetPath) return;

    const protectedReason = isProtectedPath(targetPath);
    if (!protectedReason) return;

    if (ctx.hasUI) {
      ctx.ui.notify(`Blocked ${event.toolName} to protected path: ${targetPath}`, "warning");
    }
    return { block: true, reason: `Protected path blocked (${protectedReason}): ${targetPath}` };
  });
}
