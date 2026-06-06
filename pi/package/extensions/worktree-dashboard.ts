import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, getAgentDir, truncateTail, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface AgentJob {
  id: string;
  name: string;
  prompt: string;
  repoRoot: string;
  worktreePath: string;
  branch: string;
  pid: number;
  startedAt: string;
  logPath: string;
  promptPath: string;
}

const STATE_DIR = path.join(getAgentDir(), "worktree-agents");
const JOBS_PATH = path.join(STATE_DIR, "jobs.json");

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJobs(): AgentJob[] {
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf-8")) as AgentJob[];
  } catch {
    return [];
  }
}

function writeJobs(jobs: AgentJob[]): void {
  ensureStateDir();
  fs.writeFileSync(JOBS_PATH, `${JSON.stringify(jobs, null, 2)}\n`, "utf-8");
}

function safeName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `agent-${Date.now().toString(36)}`
  );
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailFile(filePath: string, bytes: number): string {
  try {
    const stat = fs.statSync(filePath);
    const size = Math.min(stat.size, bytes);
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, stat.size - size);
    fs.closeSync(fd);
    return buffer.toString("utf-8");
  } catch (error) {
    return `Unable to read log: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function truncateForTool(text: string): string {
  const truncation = truncateTail(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  if (!truncation.truncated) return truncation.content;
  return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ${formatSize(
    truncation.outputBytes,
  )}/${formatSize(truncation.totalBytes)}.]`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

async function git(pi: ExtensionAPI, cwd: string, args: string[], timeout = 30_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const result = await pi.exec("git", args, { cwd, timeout });
  return { code: result.code, stdout: result.stdout, stderr: result.stderr };
}

async function repoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
  const result = await git(pi, cwd, ["rev-parse", "--show-toplevel"], 10_000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Not inside a git repository.");
  return result.stdout.trim();
}

async function gitPath(pi: ExtensionAPI, root: string, gitPathName: string): Promise<string> {
  const result = await git(pi, root, ["rev-parse", "--git-path", gitPathName], 10_000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `Unable to resolve git path: ${gitPathName}`);
  const raw = result.stdout.trim();
  return path.isAbsolute(raw) ? raw : path.join(root, raw);
}

async function ensureLocalExclude(pi: ExtensionAPI, root: string): Promise<void> {
  const excludePath = await gitPath(pi, root, "info/exclude");
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf-8") : "";
  const additions = [".pi/worktrees/", ".pi/worktree-agents/", ".pi/reviews/"].filter((line) => !existing.includes(line));
  if (additions.length > 0) fs.appendFileSync(excludePath, `${existing.endsWith("\n") || !existing ? "" : "\n"}${additions.join("\n")}\n`);
}

function worktreePath(root: string, name: string): string {
  return path.join(root, ".pi", "worktrees", safeName(name));
}

function branchName(name: string): string {
  return `pi/${safeName(name)}`;
}

async function createWorktree(pi: ExtensionAPI, cwd: string, name: string, base = "HEAD"): Promise<{ root: string; worktree: string; branch: string; created: boolean }> {
  const root = await repoRoot(pi, cwd);
  await ensureLocalExclude(pi, root);

  const wt = worktreePath(root, name);
  const branch = branchName(name);
  if (fs.existsSync(wt)) return { root, worktree: wt, branch, created: false };

  fs.mkdirSync(path.dirname(wt), { recursive: true });

  const addNew = await git(pi, root, ["worktree", "add", "-b", branch, wt, base], 120_000);
  if (addNew.code === 0) return { root, worktree: wt, branch, created: true };

  // If the branch already exists, attach the worktree to it.
  const addExisting = await git(pi, root, ["worktree", "add", wt, branch], 120_000);
  if (addExisting.code !== 0) {
    throw new Error(addExisting.stderr || addExisting.stdout || addNew.stderr || addNew.stdout || `Failed to create worktree ${wt}`);
  }
  return { root, worktree: wt, branch, created: true };
}

async function listWorktrees(pi: ExtensionAPI, cwd: string): Promise<string> {
  const root = await repoRoot(pi, cwd);
  const result = await git(pi, root, ["worktree", "list", "--porcelain"], 30_000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "git worktree list failed");
  return result.stdout.trim() || "No git worktrees.";
}

async function removeWorktree(pi: ExtensionAPI, cwd: string, name: string, force = false): Promise<string> {
  const root = await repoRoot(pi, cwd);
  const wt = worktreePath(root, name);
  const args = ["worktree", "remove", ...(force ? ["--force"] : []), wt];
  const result = await git(pi, root, args, 120_000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `Failed to remove worktree ${wt}`);
  return wt;
}

function findJob(id: string): AgentJob | undefined {
  return readJobs().find((job) => job.id === id || job.id.startsWith(id));
}

function pruneStoppedJobs(removeLogs = false): { kept: AgentJob[]; removed: AgentJob[] } {
  const jobs = readJobs();
  const kept: AgentJob[] = [];
  const removed: AgentJob[] = [];
  for (const job of jobs) {
    if (isRunning(job.pid)) kept.push(job);
    else {
      removed.push(job);
      if (removeLogs) {
        for (const file of [job.logPath, job.promptPath]) {
          try {
            fs.unlinkSync(file);
          } catch {
            // ignore
          }
        }
      }
    }
  }
  writeJobs(kept);
  return { kept, removed };
}

async function startAgent(pi: ExtensionAPI, cwd: string, name: string, prompt: string, base?: string): Promise<AgentJob> {
  if (!prompt.trim()) throw new Error("Agent prompt is required.");

  ensureStateDir();
  const { root, worktree, branch } = await createWorktree(pi, cwd, name, base || "HEAD");
  const id = `${Date.now().toString(36)}-${safeName(name).slice(0, 24)}`;
  const promptPath = path.join(STATE_DIR, `${id}.prompt.md`);
  const logPath = path.join(STATE_DIR, `${id}.jsonl.log`);

  await withFileMutationQueue(promptPath, async () => {
    fs.writeFileSync(promptPath, prompt, { encoding: "utf-8", mode: 0o600 });
  });

  const invocation = getPiInvocation(["--mode", "json", "-p", "--no-session", `@${promptPath}`]);
  const out = fs.openSync(logPath, "a");
  const child = spawn(invocation.command, invocation.args, {
    cwd: worktree,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, HOME: os.homedir() },
  });
  fs.closeSync(out);
  child.unref();

  if (!child.pid || child.pid <= 0) throw new Error("Failed to start worktree agent: missing child pid.");

  const job: AgentJob = {
    id,
    name,
    prompt,
    repoRoot: root,
    worktreePath: worktree,
    branch,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    logPath,
    promptPath,
  };
  writeJobs([...readJobs(), job]);
  return job;
}

function formatJob(job: AgentJob): string {
  return `${job.id}\t${isRunning(job.pid) ? "running" : "stopped"}\tpid=${job.pid}\t${job.name}\t${job.branch}\t${job.worktreePath}`;
}

async function toolResponseForAction(pi: ExtensionAPI, ctx: ExtensionContext, params: any): Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown; isError?: boolean }> {
  const action = params.action as string;

  if (action === "start") {
    if (!params.name || !params.prompt) return { content: [{ type: "text", text: "action=start requires name and prompt." }], isError: true };
    const job = await startAgent(pi, ctx.cwd, params.name, params.prompt, params.base);
    return {
      content: [{ type: "text", text: `Started worktree agent ${job.id}\n${formatJob(job)}\nlog: ${job.logPath}` }],
      details: { job },
    };
  }

  if (action === "list") {
    const jobs = readJobs();
    return { content: [{ type: "text", text: jobs.length ? jobs.map(formatJob).join("\n") : "No worktree agents." }], details: { jobs } };
  }

  if (action === "prune") {
    const { kept, removed } = pruneStoppedJobs(params.removeLogs ?? false);
    return {
      content: [{ type: "text", text: `Pruned ${removed.length} stopped agent(s). ${kept.length} running agent(s) kept.` }],
      details: { kept, removed },
    };
  }

  if (!params.id) return { content: [{ type: "text", text: `action=${action} requires id.` }], isError: true };
  const job = findJob(params.id);
  if (!job) return { content: [{ type: "text", text: `Unknown worktree agent: ${params.id}` }], isError: true };

  if (action === "status") {
    const logs = tailFile(job.logPath, params.tailBytes ?? 4096);
    return { content: [{ type: "text", text: `${formatJob(job)}\n\n${truncateForTool(logs)}` }], details: { job, running: isRunning(job.pid) } };
  }

  if (action === "logs") {
    return { content: [{ type: "text", text: truncateForTool(tailFile(job.logPath, params.tailBytes ?? 16384)) }], details: { job } };
  }

  if (action === "stop") {
    try {
      process.kill(-job.pid, "SIGTERM");
    } catch {
      try {
        process.kill(job.pid, "SIGTERM");
      } catch {
        // already stopped
      }
    }
    return { content: [{ type: "text", text: `Sent SIGTERM to ${job.id} (pid ${job.pid}).` }], details: { job } };
  }

  return { content: [{ type: "text", text: `Unknown action: ${action}` }], isError: true };
}

export default function worktreeDashboard(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "worktree_agent",
    label: "Worktree Agent",
    description: "Start and monitor independent Pi agents running in isolated git worktrees.",
    promptSnippet: "Start/list/status/logs/stop background Pi agents in isolated git worktrees.",
    promptGuidelines: [
      "Use worktree_agent only when the user wants parallel independent work that should not touch the current checkout.",
      "Use worktree_agent status/logs before starting duplicate agents for the same task.",
      "Do not use worktree_agent for simple sub-tasks; prefer subagent for isolated context without a separate git worktree.",
    ],
    parameters: Type.Object({
      action: StringEnum(["start", "list", "status", "logs", "stop", "prune"] as const),
      name: Type.Optional(Type.String({ description: "Human-readable agent/worktree name for action=start" })),
      prompt: Type.Optional(Type.String({ description: "Prompt for the background Pi agent. Required for action=start." })),
      base: Type.Optional(Type.String({ description: "Git base ref for creating the worktree. Defaults to HEAD." })),
      id: Type.Optional(Type.String({ description: "Agent job id for status/logs/stop" })),
      tailBytes: Type.Optional(Type.Number({ description: "Bytes of logs to return for status/logs" })),
      removeLogs: Type.Optional(Type.Boolean({ description: "For prune: delete stopped agent logs and prompt files. Default false." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return toolResponseForAction(pi, ctx, params);
    },
  });

  pi.registerCommand("worktree", {
    description: "Manage Pi git worktrees (usage: /worktree list|create <name> [base]|remove <name> [--force]|path <name>)",
    handler: async (args, ctx) => {
      const [cmdRaw, ...rest] = args.trim().split(/\s+/);
      const cmd = cmdRaw || "list";
      try {
        if (cmd === "list") {
          ctx.ui.notify(await listWorktrees(pi, ctx.cwd), "info");
          return;
        }
        if (cmd === "create") {
          const name = rest[0];
          if (!name) {
            ctx.ui.notify("Usage: /worktree create <name> [base]", "error");
            return;
          }
          const result = await createWorktree(pi, ctx.cwd, name, rest[1] || "HEAD");
          ctx.ui.notify(`${result.created ? "Created" : "Exists"}: ${result.worktree}\nbranch: ${result.branch}`, "info");
          return;
        }
        if (cmd === "remove") {
          const name = rest[0];
          if (!name) {
            ctx.ui.notify("Usage: /worktree remove <name> [--force]", "error");
            return;
          }
          if (ctx.hasUI) {
            const ok = await ctx.ui.confirm("Remove worktree?", `Remove worktree ${name}?`);
            if (!ok) return;
          }
          const removed = await removeWorktree(pi, ctx.cwd, name, rest.includes("--force"));
          ctx.ui.notify(`Removed worktree: ${removed}`, "info");
          return;
        }
        if (cmd === "path") {
          const root = await repoRoot(pi, ctx.cwd);
          ctx.ui.notify(worktreePath(root, rest[0] || "default"), "info");
          return;
        }
        ctx.ui.notify("Usage: /worktree list|create <name> [base]|remove <name> [--force]|path <name>", "error");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  async function handleAgentsCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const [cmdRaw, ...rest] = args.trim().split(/\s+/);
    const cmd = cmdRaw || "list";
    try {
      if (cmd === "list") {
        const jobs = readJobs();
        ctx.ui.notify(jobs.length ? jobs.map(formatJob).join("\n") : "No worktree agents.", "info");
        return;
      }
      if (cmd === "start") {
        const separator = rest.indexOf("--");
        const name = rest[0];
        const prompt = separator >= 0 ? rest.slice(separator + 1).join(" ") : rest.slice(1).join(" ");
        if (!name || !prompt.trim()) {
          ctx.ui.notify("Usage: /agents start <name> -- <prompt>", "error");
          return;
        }
        const job = await startAgent(pi, ctx.cwd, name, prompt);
        ctx.ui.notify(`Started worktree agent:\n${formatJob(job)}\nlog: ${job.logPath}`, "info");
        return;
      }
      if (cmd === "status" || cmd === "logs" || cmd === "stop") {
        const id = rest[0];
        const response = await toolResponseForAction(pi, ctx, { action: cmd, id, tailBytes: 12000 });
        ctx.ui.notify(response.content[0]?.text ?? "", response.isError ? "error" : "info");
        return;
      }
      if (cmd === "prune") {
        const { kept, removed } = pruneStoppedJobs(rest.includes("--remove-logs"));
        ctx.ui.notify(`Pruned ${removed.length} stopped agent(s). ${kept.length} running agent(s) kept.`, "info");
        return;
      }
      ctx.ui.notify("Usage: /agents list|start <name> -- <prompt>|status <id>|logs <id>|stop <id>|prune [--remove-logs]", "error");
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  pi.registerCommand("agents", {
    description: "Dashboard for background worktree agents",
    handler: async (args, ctx) => handleAgentsCommand(args, ctx),
  });

  pi.registerCommand("agent-dashboard", {
    description: "Alias for /agents",
    handler: async (args, ctx) => handleAgentsCommand(args, ctx),
  });
}
