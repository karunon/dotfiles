import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface AuditConfig {
  enabled?: boolean;
  logDir?: string;
  includePrompts?: boolean;
  includeToolInputs?: boolean;
  includeToolResults?: boolean;
  otlp?: {
    enabled?: boolean;
    endpoint?: string;
    headers?: Record<string, string>;
  };
}

const DEFAULT_CONFIG: Required<Omit<AuditConfig, "otlp">> & { otlp: Required<NonNullable<AuditConfig["otlp"]>> } = {
  enabled: true,
  logDir: path.join(getAgentDir(), "audit"),
  includePrompts: false,
  includeToolInputs: true,
  includeToolResults: false,
  otlp: { enabled: false, endpoint: "", headers: {} },
};

function expandHome(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function readJson(filePath: string): Partial<AuditConfig> {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<AuditConfig>;
  } catch {
    return {};
  }
}

function loadConfig(cwd: string): Required<Omit<AuditConfig, "otlp">> & { otlp: Required<NonNullable<AuditConfig["otlp"]>> } {
  const global = readJson(path.join(getAgentDir(), "audit.json"));
  const project = readJson(path.join(cwd, ".pi", "audit.json"));
  return {
    ...DEFAULT_CONFIG,
    ...global,
    ...project,
    logDir: expandHome(project.logDir ?? global.logDir ?? DEFAULT_CONFIG.logDir),
    otlp: { ...DEFAULT_CONFIG.otlp, ...(global.otlp ?? {}), ...(project.otlp ?? {}) },
  };
}

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-REDACTED")
      .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_REDACTED")
      .replace(/(api[_-]?key|token|password|secret)(=|:|\s+)\S+/gi, "$1$2REDACTED")
      .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "PRIVATE_KEY_REDACTED");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/token|password|secret|apiKey|authorization/i.test(key)) result[key] = "REDACTED";
      else result[key] = redact(child);
    }
    return result;
  }
  return value;
}

function dailyLogPath(config: ReturnType<typeof loadConfig>): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(config.logDir, `${day}.jsonl`);
}

async function postOtel(config: ReturnType<typeof loadConfig>, event: Record<string, unknown>): Promise<void> {
  if (!config.otlp.enabled || !config.otlp.endpoint) return;
  try {
    await fetch(config.otlp.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...config.otlp.headers },
      body: JSON.stringify({ resource: { serviceName: "pi-dotfiles" }, events: [event] }),
    });
  } catch {
    // Audit logging must never break agent execution.
  }
}

function baseEvent(type: string, ctx: ExtensionContext): Record<string, unknown> {
  return {
    type,
    timestamp: new Date().toISOString(),
    cwd: ctx.cwd,
    sessionId: ctx.sessionManager.getSessionId(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
  };
}

export default function auditLog(pi: ExtensionAPI): void {
  async function writeAudit(ctx: ExtensionContext, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;
    const event = redact({ ...baseEvent(type, ctx), ...payload }) as Record<string, unknown>;
    try {
      fs.mkdirSync(config.logDir, { recursive: true });
      fs.appendFileSync(dailyLogPath(config), `${JSON.stringify(event)}\n`);
    } catch {
      // Do not interrupt the agent for audit I/O failures.
    }
    await postOtel(config, event);
  }

  pi.registerCommand("audit", {
    description: "Show audit log location and current audit settings",
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      ctx.ui.notify(
        [
          `enabled: ${config.enabled}`,
          `logDir: ${config.logDir}`,
          `today: ${dailyLogPath(config)}`,
          `includePrompts: ${config.includePrompts}`,
          `includeToolInputs: ${config.includeToolInputs}`,
          `includeToolResults: ${config.includeToolResults}`,
          `otlp: ${config.otlp.enabled ? config.otlp.endpoint || "enabled" : "disabled"}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("session_start", async (event, ctx) => {
    await writeAudit(ctx, "session_start", { reason: event.reason, previousSessionFile: event.previousSessionFile });
  });

  pi.on("input", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    await writeAudit(ctx, "input", {
      source: event.source,
      streamingBehavior: event.streamingBehavior,
      text: config.includePrompts ? event.text : undefined,
      textLength: event.text.length,
      imageCount: event.images?.length ?? 0,
    });
    return { action: "continue" as const };
  });

  pi.on("model_select", async (event, ctx) => {
    await writeAudit(ctx, "model_select", {
      source: event.source,
      previousModel: event.previousModel ? `${event.previousModel.provider}/${event.previousModel.id}` : undefined,
      model: `${event.model.provider}/${event.model.id}`,
    });
  });

  pi.on("thinking_level_select", async (event, ctx) => {
    await writeAudit(ctx, "thinking_level_select", { level: event.level, previousLevel: event.previousLevel });
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    await writeAudit(ctx, "tool_execution_start", {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      args: config.includeToolInputs ? event.args : undefined,
    });
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    await writeAudit(ctx, "tool_execution_end", {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError,
      result: config.includeToolResults ? event.result : undefined,
    });
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    await writeAudit(ctx, "assistant_message_end", {
      provider: event.message.provider,
      model: event.message.model,
      stopReason: event.message.stopReason,
      usage: event.message.usage,
      errorMessage: event.message.errorMessage,
    });
  });

  pi.on("agent_end", async (event, ctx) => {
    await writeAudit(ctx, "agent_end", { messageCount: event.messages.length });
  });

  pi.on("session_shutdown", async (event, ctx) => {
    await writeAudit(ctx, "session_shutdown", { reason: event.reason, targetSessionFile: event.targetSessionFile });
  });
}
