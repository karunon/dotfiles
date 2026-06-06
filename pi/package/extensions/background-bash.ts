import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface JobRecord {
  id: string;
  command: string;
  cwd: string;
  pid: number;
  startedAt: string;
  logPath: string;
}

const STATE_DIR = path.join(getAgentDir(), "background");
const JOBS_PATH = path.join(STATE_DIR, "jobs.json");

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJobs(): JobRecord[] {
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf-8")) as JobRecord[];
  } catch {
    return [];
  }
}

function writeJobs(jobs: JobRecord[]): void {
  ensureStateDir();
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2));
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

function findJob(id: string): JobRecord | undefined {
  return readJobs().find((job) => job.id === id);
}

function pruneStoppedJobs(removeLogs = true): { kept: JobRecord[]; removed: JobRecord[] } {
  const jobs = readJobs();
  const kept: JobRecord[] = [];
  const removed: JobRecord[] = [];

  for (const job of jobs) {
    if (isRunning(job.pid)) {
      kept.push(job);
      continue;
    }
    removed.push(job);
    if (removeLogs) {
      try {
        fs.unlinkSync(job.logPath);
      } catch {
        /* ignore */
      }
    }
  }

  writeJobs(kept);
  return { kept, removed };
}

export default function backgroundBash(pi: ExtensionAPI): void {
  pi.registerCommand("background-prune", {
    description: "Remove stopped background_bash jobs and logs",
    handler: async (_args, ctx) => {
      const { kept, removed } = pruneStoppedJobs(true);
      ctx.ui.notify(`Pruned ${removed.length} stopped background job(s). ${kept.length} running job(s) kept.`, "info");
    },
  });

  pi.registerTool({
    name: "background_bash",
    label: "Background Bash",
    description:
      "Start and manage long-running shell commands without blocking the agent. Actions: start, list, status, logs, stop, prune/cleanup.",
    promptSnippet:
      "background_bash: run long-lived commands such as dev servers, watchers, and test loops in the background.",
    promptGuidelines: [
      "Use background_bash for commands expected to keep running, such as dev servers or file watchers.",
      "Use background_bash logs/status to inspect running jobs instead of starting duplicates.",
      "Use background_bash prune/cleanup to remove stopped jobs and old logs.",
      "Prefer normal bash for short commands that should finish during the current turn.",
    ],
    parameters: Type.Object({
      action: Type.String({ description: "One of: start, list, status, logs, stop, prune, cleanup" }),
      command: Type.Optional(Type.String({ description: "Shell command to start. Required for action=start." })),
      cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to the current Pi cwd." })),
      id: Type.Optional(Type.String({ description: "Background job id. Required for status/logs/stop." })),
      tailBytes: Type.Optional(Type.Number({ description: "Bytes of log output to return for logs/status." })),
      removeLogs: Type.Optional(Type.Boolean({ description: "For prune/cleanup: delete log files for stopped jobs. Default: true." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ensureStateDir();

      if (params.action === "start") {
        if (!params.command?.trim()) {
          return { content: [{ type: "text", text: "action=start requires command." }], isError: true };
        }

        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const cwd = params.cwd ?? ctx.cwd;
        const logPath = path.join(STATE_DIR, `${id}.log`);
        const out = fs.openSync(logPath, "a");
        const child = spawn("bash", ["-lc", params.command], {
          cwd,
          detached: true,
          stdio: ["ignore", out, out],
          env: { ...process.env, HOME: os.homedir() },
        });
        fs.closeSync(out);
        child.unref();

        if (!child.pid || child.pid <= 0) {
          return { content: [{ type: "text", text: "Failed to start background job: missing child pid." }], isError: true };
        }

        const job: JobRecord = {
          id,
          command: params.command,
          cwd,
          pid: child.pid,
          startedAt: new Date().toISOString(),
          logPath,
        };
        writeJobs([...readJobs(), job]);

        return {
          content: [
            {
              type: "text",
              text: `Started background job ${id}\npid: ${job.pid}\ncwd: ${cwd}\nlog: ${logPath}`,
            },
          ],
          details: job,
        };
      }

      if (params.action === "list") {
        const jobs = readJobs();
        if (jobs.length === 0) return { content: [{ type: "text", text: "No background jobs." }] };
        return {
          content: [
            {
              type: "text",
              text: jobs
                .map((job) => `${job.id} ${isRunning(job.pid) ? "running" : "stopped"} pid=${job.pid} ${job.command}`)
                .join("\n"),
            },
          ],
          details: { jobs },
        };
      }

      if (params.action === "prune" || params.action === "cleanup") {
        const { kept, removed } = pruneStoppedJobs(params.removeLogs ?? true);
        const removedLines = removed.map((job) => `${job.id} pid=${job.pid} ${job.command}`);
        return {
          content: [
            {
              type: "text",
              text:
                removed.length === 0
                  ? `No stopped background jobs to prune. ${kept.length} running job(s) kept.`
                  : [`Pruned ${removed.length} stopped job(s). ${kept.length} running job(s) kept.`, ...removedLines].join("\n"),
            },
          ],
          details: { kept, removed },
        };
      }

      if (!params.id) {
        return { content: [{ type: "text", text: `action=${params.action} requires id.` }], isError: true };
      }

      const job = findJob(params.id);
      if (!job) return { content: [{ type: "text", text: `Unknown background job: ${params.id}` }], isError: true };

      if (params.action === "status") {
        const status = isRunning(job.pid) ? "running" : "stopped";
        const logs = tailFile(job.logPath, params.tailBytes ?? 4096);
        return {
          content: [{ type: "text", text: `${job.id} is ${status}\npid: ${job.pid}\n\n${logs}` }],
          details: { job, status },
        };
      }

      if (params.action === "logs") {
        return {
          content: [{ type: "text", text: tailFile(job.logPath, params.tailBytes ?? 8192) }],
          details: { job },
        };
      }

      if (params.action === "stop") {
        if (job.pid <= 0) {
          return { content: [{ type: "text", text: `Invalid pid for ${job.id}: ${job.pid}` }], isError: true };
        }
        try {
          process.kill(-job.pid, "SIGTERM");
        } catch {
          try {
            process.kill(job.pid, "SIGTERM");
          } catch {
            /* already stopped */
          }
        }
        return { content: [{ type: "text", text: `Sent SIGTERM to ${job.id} (pid ${job.pid}).` }], details: { job } };
      }

      return { content: [{ type: "text", text: `Unknown action: ${params.action}` }], isError: true };
    },
  });
}
