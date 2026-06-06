import * as fs from "node:fs";
import * as path from "node:path";
import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation, withFileMutationQueue } from "@earendil-works/pi-coding-agent";

interface ProjectMemoryConfig {
  /** Disable project memory in this repository. */
  enabled?: boolean;
  /** Repository-relative file to update. Defaults to AGENTS.local.md. Never global. */
  target?: string;
  /** If true, propose memory updates after explicit correction/remember prompts. Default false. */
  autoSuggest?: boolean;
  /** Minimum turns between automatic suggestions. Default 4. */
  autoSuggestEveryTurns?: number;
}

const DEFAULT_CONFIG: Required<ProjectMemoryConfig> = {
  enabled: true,
  target: "AGENTS.local.md",
  autoSuggest: false,
  autoSuggestEveryTurns: 4,
};

const REPOSITORY_RESOURCES_LOADED_TARGETS = new Set(["AGENTS.local.md", "AGENTS.override.md", "CLAUDE.local.md", "CLAUDE.override.md"]);

const SYSTEM_PROMPT = `You create concise project-local memory notes for a coding agent.
Only extract durable repository guidance that should be remembered for future sessions.
Do not include one-off task details, secrets, credentials, private personal data, or generic advice.
Return Markdown bullet points only. If there is nothing worth remembering, return exactly: NO_MEMORY_UPDATE`;

function hasGitMarker(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function findRepositoryRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (hasGitMarker(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function readJson(filePath: string): Partial<ProjectMemoryConfig> {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ProjectMemoryConfig>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function configPath(root: string): string {
  return path.join(root, ".pi", "project-memory.json");
}

function loadConfig(root: string): Required<ProjectMemoryConfig> {
  return { ...DEFAULT_CONFIG, ...readJson(configPath(root)) };
}

function saveConfig(root: string, patch: Partial<ProjectMemoryConfig>): Required<ProjectMemoryConfig> {
  const next = { ...loadConfig(root), ...patch };
  writeJson(configPath(root), next);
  return next;
}

function resolveTarget(root: string, config: ProjectMemoryConfig): string {
  const target = config.target?.trim() || DEFAULT_CONFIG.target;
  if (path.isAbsolute(target)) throw new Error("Project memory target must be repository-relative, not absolute.");
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Project memory target must stay inside the repository: ${target}`);
  }
  return resolved;
}

function ensureMemoryFile(filePath: string): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      "# Project-local agent memory",
      "",
      "This file is project-local memory for coding agents. It is not written to global Pi/Claude/Codex memory.",
      "Keep entries short, durable, and repository-specific.",
      "",
      "## Notes",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function normalizeBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ""))
    .filter((line) => line && line !== "NO_MEMORY_UPDATE");
}

async function appendMemory(filePath: string, text: string): Promise<number> {
  const bullets = normalizeBullets(text);
  if (bullets.length === 0) return 0;

  let added = 0;
  await withFileMutationQueue(filePath, async () => {
    ensureMemoryFile(filePath);
    const existing = fs.readFileSync(filePath, "utf-8");
    const existingLower = existing.toLowerCase();
    const date = new Date().toISOString().slice(0, 10);
    const newLines = bullets
      .filter((bullet) => !existingLower.includes(bullet.toLowerCase()))
      .map((bullet) => `- [${date}] ${bullet}`);
    added = newLines.length;
    if (newLines.length === 0) return;
    const separator = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(filePath, `${existing}${separator}${newLines.join("\n")}\n`, "utf-8");
  });

  return added;
}

function entryToText(entry: SessionEntry): string | undefined {
  if (entry.type !== "message") return undefined;
  const message = entry.message;
  if (message.role === "toolResult") return undefined;
  try {
    return serializeConversation(convertToLlm([message]));
  } catch {
    return undefined;
  }
}

function recentConversation(ctx: ExtensionContext, maxEntries = 36): string {
  const entries = ctx.sessionManager.getBranch().slice(-maxEntries);
  return entries.map(entryToText).filter((text): text is string => Boolean(text)).join("\n\n---\n\n");
}

function shouldAutoSuggest(prompt: string): boolean {
  return /\b(remember|note this|from now on|next time|preference)\b/i.test(prompt) || /覚えて|記憶|次から|今後|以後|ルール|好み|方針/.test(prompt);
}

async function generateSuggestion(ctx: ExtensionContext, focus: string | undefined, signal?: AbortSignal): Promise<string | undefined> {
  if (!ctx.model) throw new Error("No active model.");
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);

  const userMessage: Message = {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          focus ? `Focus: ${focus}` : undefined,
          "Conversation excerpt:",
          recentConversation(ctx),
          "",
          "Extract only durable project-specific memory notes that would help future agent sessions in this repository.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    timestamp: Date.now(),
  };

  const response = await complete(
    ctx.model,
    { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
    { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 2048, signal },
  );

  if (response.stopReason === "aborted" || response.stopReason === "error") return undefined;
  const text = response.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text || text === "NO_MEMORY_UPDATE") return undefined;
  return text;
}

async function suggestAndMaybeAppend(ctx: ExtensionContext, focus?: string, auto = false): Promise<void> {
  const root = findRepositoryRoot(ctx.cwd);
  const config = loadConfig(root);
  if (!config.enabled) {
    ctx.ui.notify("Project memory is disabled for this repository.", "warning");
    return;
  }

  const target = resolveTarget(root, config);
  const relativeTarget = path.relative(root, target);

  if (!ctx.hasUI) {
    ctx.ui.notify("/memory suggest requires interactive UI for review before writing.", "error");
    return;
  }

  const suggestion = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, auto ? "Checking project memory..." : "Generating project memory suggestion...");
    loader.onAbort = () => done(null);
    generateSuggestion(ctx, focus, loader.signal)
      .then((text) => done(text ?? ""))
      .catch((error) => {
        console.error("Project memory suggestion failed:", error);
        done(null);
      });
    return loader;
  });

  if (suggestion === null) {
    ctx.ui.notify("Project memory suggestion cancelled.", "info");
    return;
  }
  if (!suggestion.trim()) {
    ctx.ui.notify("No durable project memory update found.", "info");
    return;
  }

  const edited = await ctx.ui.editor(`Review project memory update for ${relativeTarget}`, suggestion);
  if (edited === undefined) return;
  const count = await appendMemory(target, edited);
  ctx.ui.notify(count > 0 ? `Project memory updated: ${relativeTarget}` : "No new project memory entries added.", "info");
}

export default function projectMemory(pi: ExtensionAPI): void {
  let lastUserPrompt = "";
  let turnsSinceAutoSuggestion = 0;

  pi.on("input", async (event) => {
    if (event.source !== "extension") lastUserPrompt = event.text;
    return { action: "continue" as const };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const root = findRepositoryRoot(ctx.cwd);
    const config = loadConfig(root);
    if (!config.enabled) return;
    const target = resolveTarget(root, config);
    const relativeTarget = path.relative(root, target);
    if (REPOSITORY_RESOURCES_LOADED_TARGETS.has(relativeTarget)) return;
    if (!fs.existsSync(target)) return;
    const content = fs.readFileSync(target, "utf-8").trim();
    if (!content) return;
    return { systemPrompt: `${event.systemPrompt}\n\n[PROJECT-LOCAL MEMORY: ${relativeTarget}]\n${content}` };
  });

  pi.registerCommand("memory", {
    description: "Manage project-local agent memory only (usage: /memory status|init|add|suggest|enable-auto|disable-auto)",
    handler: async (args, ctx) => {
      const root = findRepositoryRoot(ctx.cwd);
      const [subcommandRaw, ...rest] = args.trim().split(/\s+/);
      const subcommand = subcommandRaw || "status";
      const restText = rest.join(" ").trim();
      const config = loadConfig(root);
      const target = resolveTarget(root, config);
      const relativeTarget = path.relative(root, target);

      if (subcommand === "status") {
        ctx.ui.notify(
          [
            "Project memory is project-local only; global memory files are never written.",
            `root: ${root}`,
            `config: ${path.relative(root, configPath(root))}`,
            `enabled: ${config.enabled}`,
            `target: ${relativeTarget}`,
            `autoSuggest: ${config.autoSuggest}`,
            `exists: ${fs.existsSync(target)}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      if (subcommand === "init") {
        const targetArg = restText || config.target || DEFAULT_CONFIG.target;
        const next = saveConfig(root, { enabled: true, target: targetArg, autoSuggest: false });
        const nextTarget = resolveTarget(root, next);
        ensureMemoryFile(nextTarget);
        ctx.ui.notify(`Project memory initialized: ${path.relative(root, nextTarget)}\nAuto-suggest is disabled by default.`, "info");
        return;
      }

      if (subcommand === "enable-auto") {
        saveConfig(root, { autoSuggest: true });
        ctx.ui.notify("Project memory auto-suggest enabled for this repository only.", "info");
        return;
      }

      if (subcommand === "disable-auto") {
        saveConfig(root, { autoSuggest: false });
        ctx.ui.notify("Project memory auto-suggest disabled for this repository.", "info");
        return;
      }

      if (subcommand === "add") {
        if (!restText) {
          ctx.ui.notify("Usage: /memory add <durable project-specific note>", "error");
          return;
        }
        const count = await appendMemory(target, restText);
        ctx.ui.notify(count > 0 ? `Project memory updated: ${relativeTarget}` : "No new project memory entries added.", "info");
        return;
      }

      if (subcommand === "suggest") {
        await suggestAndMaybeAppend(ctx, restText || undefined);
        return;
      }

      if (subcommand === "open") {
        ensureMemoryFile(target);
        ctx.ui.setEditorText(`@${relativeTarget}`);
        ctx.ui.notify(`Inserted memory file reference: @${relativeTarget}`, "info");
        return;
      }

      ctx.ui.notify("Usage: /memory status|init [target]|add <note>|suggest [focus]|enable-auto|disable-auto|open", "error");
    },
  });

  pi.on("agent_end", async (_event, ctx) => {
    const root = findRepositoryRoot(ctx.cwd);
    const config = loadConfig(root);
    if (!config.enabled || !config.autoSuggest || !ctx.hasUI) return;

    turnsSinceAutoSuggestion += 1;
    const due = turnsSinceAutoSuggestion >= config.autoSuggestEveryTurns;
    if (!due && !shouldAutoSuggest(lastUserPrompt)) return;

    const ok = await ctx.ui.confirm(
      "Project memory",
      "Check whether this turn contains durable project-local guidance to save? This never writes global memory.",
      { timeout: 7000 },
    );
    if (!ok) return;
    turnsSinceAutoSuggestion = 0;
    await suggestAndMaybeAppend(ctx, undefined, true);
  });
}
