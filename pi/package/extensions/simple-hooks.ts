import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface HookHandler {
  enabled?: boolean;
  type?: "command" | "http";
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  matcher?: string;
  if?: string;
  timeoutMs?: number;
  statusMessage?: string;
}

interface HooksConfig {
  hooks?: Record<string, HookHandler[]>;
}

interface HookDecision {
  block?: boolean;
  reason?: string;
  notify?: string;
  notifyType?: "info" | "warning" | "error";
  systemPrompt?: string;
  systemPromptAppend?: string;
}

const SUPPORTED_EVENTS = [
  "session_start",
  "before_agent_start",
  "tool_call",
  "tool_result",
  "agent_end",
  "session_shutdown",
] as const;

type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

function isSupportedEvent(value: string): value is SupportedEvent {
  return (SUPPORTED_EVENTS as readonly string[]).includes(value);
}

function readJson(filePath: string): HooksConfig {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as HooksConfig;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, config: HooksConfig): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function globalConfigPath(): string {
  return path.join(getAgentDir(), "hooks.json");
}

function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".pi", "hooks.json");
}

function loadConfig(cwd: string): HooksConfig {
  const global = readJson(globalConfigPath());
  const project = readJson(projectConfigPath(cwd));
  return { hooks: { ...(global.hooks ?? {}), ...(project.hooks ?? {}) } };
}

function loadProjectConfig(cwd: string): HooksConfig {
  return readJson(projectConfigPath(cwd));
}

function saveProjectConfig(cwd: string, config: HooksConfig): void {
  writeJson(projectConfigPath(cwd), config);
}

function isExactMatcher(pattern: string): boolean {
  return /^[A-Za-z0-9_|:-]+$/.test(pattern);
}

function matches(pattern: string | undefined, value: string): boolean {
  if (!pattern || pattern === "*") return true;
  if (isExactMatcher(pattern)) return pattern.split("|").includes(value);
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function matchesIf(pattern: string | undefined, payload: unknown): boolean {
  if (!pattern) return true;
  const text = JSON.stringify(payload);
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.includes(pattern);
  }
}

function eventMatcherValue(eventName: SupportedEvent, payload: any): string {
  if (eventName === "tool_call" || eventName === "tool_result") return String(payload.toolName ?? "");
  if (eventName === "session_start") return String(payload.reason ?? "startup");
  if (eventName === "session_shutdown") return String(payload.reason ?? "quit");
  return eventName;
}

function safePayload(eventName: SupportedEvent, event: any, ctx: ExtensionContext): Record<string, unknown> {
  const base = {
    event: eventName,
    cwd: ctx.cwd,
    sessionFile: ctx.sessionManager.getSessionFile(),
    sessionId: ctx.sessionManager.getSessionId(),
    model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
    timestamp: new Date().toISOString(),
  };

  if (eventName === "tool_call") return { ...base, toolName: event.toolName, toolCallId: event.toolCallId, input: event.input };
  if (eventName === "tool_result") {
    return {
      ...base,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      input: event.input,
      isError: event.isError,
      content: event.content,
      details: event.details,
    };
  }
  if (eventName === "before_agent_start") return { ...base, prompt: event.prompt, imageCount: event.images?.length ?? 0 };
  if (eventName === "agent_end") return { ...base, messageCount: event.messages?.length ?? 0 };
  return { ...base, ...event };
}

function parseDecision(output: string): HookDecision | undefined {
  const text = output.trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as HookDecision;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return { notify: text.slice(0, 1000), notifyType: "info" };
  }
}

function runCommandHook(handler: HookHandler, payload: Record<string, unknown>, signal?: AbortSignal): Promise<HookDecision | undefined> {
  if (!handler.command) return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", handler.command!], {
      cwd: typeof payload.cwd === "string" ? payload.cwd : process.cwd(),
      env: { ...process.env, PI_HOOK_EVENT: String(payload.event ?? "") },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Hook timed out after ${handler.timeoutMs ?? 30_000}ms: ${handler.command}`));
    }, handler.timeoutMs ?? 30_000);

    const abort = () => {
      child.kill("SIGTERM");
      reject(new Error("Hook aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (code === 2) {
        resolve({ block: true, reason: stderr.trim() || stdout.trim() || `Hook denied: ${handler.command}` });
        return;
      }
      if (code && code !== 0) {
        resolve({ notify: stderr.trim() || `Hook exited with code ${code}: ${handler.command}`, notifyType: "warning" });
        return;
      }
      resolve(parseDecision(stdout));
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function runHttpHook(handler: HookHandler, payload: Record<string, unknown>, signal?: AbortSignal): Promise<HookDecision | undefined> {
  if (!handler.url) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), handler.timeoutMs ?? 30_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(handler.url, {
      method: handler.method ?? "POST",
      headers: { "content-type": "application/json", ...(handler.headers ?? {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.status === 403) return { block: true, reason: text || `HTTP hook denied: ${handler.url}` };
    if (!response.ok) return { notify: `HTTP hook ${handler.url} returned ${response.status}: ${text}`, notifyType: "warning" };
    return parseDecision(text);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function runHandler(handler: HookHandler, payload: Record<string, unknown>, ctx: ExtensionContext): Promise<HookDecision | undefined> {
  if (handler.enabled === false) return undefined;
  if (handler.type === "http" || handler.url) return runHttpHook(handler, payload, ctx.signal);
  return runCommandHook(handler, payload, ctx.signal);
}

function notifyDecision(ctx: ExtensionContext, decision: HookDecision | undefined): void {
  if (!decision?.notify || !ctx.hasUI) return;
  ctx.ui.notify(decision.notify, decision.notifyType ?? "info");
}

function formatHooks(config: HooksConfig): string {
  const hooks = config.hooks ?? {};
  const lines = Object.entries(hooks).flatMap(([eventName, handlers]) =>
    handlers.map((handler, index) => {
      const kind = handler.type ?? (handler.url ? "http" : "command");
      const target = handler.url ?? handler.command ?? "(missing target)";
      const disabled = handler.enabled === false ? " disabled" : "";
      return `${eventName}[${index}]${disabled} ${kind} matcher=${handler.matcher ?? "*"} ${target}`;
    }),
  );
  return lines.length ? lines.join("\n") : "No hooks configured.";
}

function templateConfig(): HooksConfig {
  return {
    hooks: {
      agent_end: [
        {
          enabled: false,
          type: "command",
          command: "printf '%s\\n' '{\"notify\":\"Agent finished\",\"notifyType\":\"info\"}'",
          statusMessage: "running agent_end hook",
        },
      ],
      tool_call: [
        {
          enabled: false,
          matcher: "bash|container_bash|background_bash",
          type: "command",
          command: "node .pi/hooks/approve-command.js",
          timeoutMs: 30000,
        },
      ],
    },
  };
}

function addProjectHook(cwd: string, eventName: SupportedEvent, handler: HookHandler): number {
  const config = loadProjectConfig(cwd);
  const hooks = { ...(config.hooks ?? {}) };
  const handlers = [...(hooks[eventName] ?? []), handler];
  hooks[eventName] = handlers;
  saveProjectConfig(cwd, { hooks });
  return handlers.length - 1;
}

function removeProjectHook(cwd: string, eventName: SupportedEvent, index: number): boolean {
  const config = loadProjectConfig(cwd);
  const hooks = { ...(config.hooks ?? {}) };
  const handlers = [...(hooks[eventName] ?? [])];
  if (index < 0 || index >= handlers.length) return false;
  handlers.splice(index, 1);
  if (handlers.length) hooks[eventName] = handlers;
  else delete hooks[eventName];
  saveProjectConfig(cwd, { hooks });
  return true;
}

export default function simpleHooks(pi: ExtensionAPI): void {
  async function runHooks(eventName: SupportedEvent, event: any, ctx: ExtensionContext): Promise<HookDecision[]> {
    const handlers = loadConfig(ctx.cwd).hooks?.[eventName] ?? [];
    if (handlers.length === 0) return [];

    const payload = safePayload(eventName, event, ctx);
    const matcherValue = eventMatcherValue(eventName, payload);
    const decisions: HookDecision[] = [];

    for (const handler of handlers) {
      if (handler.enabled === false) continue;
      if (!matches(handler.matcher, matcherValue)) continue;
      if (!matchesIf(handler.if, payload)) continue;
      if (handler.statusMessage && ctx.hasUI) ctx.ui.setStatus("simple-hooks", ctx.ui.theme.fg("muted", handler.statusMessage));
      try {
        const decision = await runHandler(handler, payload, ctx);
        if (decision) decisions.push(decision);
        notifyDecision(ctx, decision);
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify(`Hook error (${eventName}): ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        if (handler.statusMessage && ctx.hasUI) ctx.ui.setStatus("simple-hooks", undefined);
      }
    }

    return decisions;
  }

  pi.registerCommand("hooks", {
    description: "Manage declarative hooks (usage: /hooks list|events|init|template|add|remove|clear)",
    handler: async (args, ctx) => {
      const [cmdRaw, ...rest] = args.trim().split(/\s+/);
      const cmd = cmdRaw || "list";

      if (cmd === "list" || cmd === "show") {
        ctx.ui.notify(formatHooks(loadConfig(ctx.cwd)), "info");
        return;
      }

      if (cmd === "events") {
        ctx.ui.notify(SUPPORTED_EVENTS.join("\n"), "info");
        return;
      }

      if (cmd === "init") {
        const filePath = projectConfigPath(ctx.cwd);
        if (!fs.existsSync(filePath)) saveProjectConfig(ctx.cwd, { hooks: {} });
        ctx.ui.notify(`Project hooks file ready: ${filePath}`, "info");
        return;
      }

      if (cmd === "template") {
        const filePath = projectConfigPath(ctx.cwd);
        if (fs.existsSync(filePath) && ctx.hasUI) {
          const ok = await ctx.ui.confirm("Overwrite hooks template?", `${filePath} already exists. Overwrite with disabled examples?`);
          if (!ok) return;
        }
        saveProjectConfig(ctx.cwd, templateConfig());
        ctx.ui.notify(`Wrote disabled project hook examples: ${filePath}`, "info");
        return;
      }

      if (cmd === "add") {
        const [eventNameRaw, maybeMatcher] = rest;
        if (!eventNameRaw || !isSupportedEvent(eventNameRaw)) {
          ctx.ui.notify(`Usage: /hooks add <event> [matcher] -- <command>\nEvents: ${SUPPORTED_EVENTS.join(", ")}`, "error");
          return;
        }
        const separator = rest.indexOf("--");
        if (separator < 0) {
          ctx.ui.notify("Usage: /hooks add <event> [matcher] -- <command>", "error");
          return;
        }
        const matcher = separator === 1 ? "*" : maybeMatcher;
        const command = rest.slice(separator + 1).join(" ").trim();
        if (!command) {
          ctx.ui.notify("Hook command is empty.", "error");
          return;
        }
        const index = addProjectHook(ctx.cwd, eventNameRaw, { type: "command", matcher, command });
        ctx.ui.notify(`Added project hook ${eventNameRaw}[${index}] in ${projectConfigPath(ctx.cwd)}`, "info");
        return;
      }

      if (cmd === "remove") {
        const [eventNameRaw, indexRaw] = rest;
        if (!eventNameRaw || !isSupportedEvent(eventNameRaw) || indexRaw === undefined) {
          ctx.ui.notify("Usage: /hooks remove <event> <index>", "error");
          return;
        }
        const ok = removeProjectHook(ctx.cwd, eventNameRaw, Number(indexRaw));
        ctx.ui.notify(ok ? `Removed project hook ${eventNameRaw}[${indexRaw}]` : `No such project hook ${eventNameRaw}[${indexRaw}]`, ok ? "info" : "error");
        return;
      }

      if (cmd === "clear") {
        const [eventNameRaw] = rest;
        const config = loadProjectConfig(ctx.cwd);
        const hooks = { ...(config.hooks ?? {}) };
        if (eventNameRaw) {
          if (!isSupportedEvent(eventNameRaw)) {
            ctx.ui.notify(`Unknown event: ${eventNameRaw}`, "error");
            return;
          }
          delete hooks[eventNameRaw];
        } else {
          for (const eventName of SUPPORTED_EVENTS) delete hooks[eventName];
        }
        saveProjectConfig(ctx.cwd, { hooks });
        ctx.ui.notify(eventNameRaw ? `Cleared project hooks for ${eventNameRaw}` : "Cleared all project hooks", "info");
        return;
      }

      ctx.ui.notify("Usage: /hooks list|events|init|template|add <event> [matcher] -- <command>|remove <event> <index>|clear [event]", "error");
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const decisions = await runHooks("before_agent_start", event, ctx);
    let systemPrompt = event.systemPrompt;
    for (const decision of decisions) {
      if (decision.systemPrompt) systemPrompt = decision.systemPrompt;
      if (decision.systemPromptAppend) systemPrompt += `\n\n${decision.systemPromptAppend}`;
    }
    return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
  });

  pi.on("tool_call", async (event, ctx) => {
    const decisions = await runHooks("tool_call", event, ctx);
    const block = decisions.find((decision) => decision.block);
    if (block) return { block: true, reason: block.reason ?? "Blocked by simple hook." };
  });

  pi.on("tool_result", async (event, ctx) => {
    await runHooks("tool_result", event, ctx);
  });
  pi.on("agent_end", async (event, ctx) => {
    await runHooks("agent_end", event, ctx);
  });
  pi.on("session_start", async (event, ctx) => {
    await runHooks("session_start", event, ctx);
  });
  pi.on("session_shutdown", async (event, ctx) => {
    await runHooks("session_shutdown", event, ctx);
  });
}
