import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface UsageGuardConfig {
  enabled?: boolean;
  maxSessionCostUsd?: number;
  maxSessionTokens?: number;
  warnCostUsd?: number;
  warnTokens?: number;
  maxParallelSubagents?: number;
  maxMcpCallsPerTurn?: number;
  maxToolCallsPerTurn?: number;
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

const DEFAULT_CONFIG: Required<UsageGuardConfig> = {
  enabled: true,
  maxSessionCostUsd: 20,
  maxSessionTokens: 2_000_000,
  warnCostUsd: 5,
  warnTokens: 800_000,
  maxParallelSubagents: 4,
  maxMcpCallsPerTurn: 20,
  maxToolCallsPerTurn: 80,
};

const emptyTotals = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 });

const readJson = (filePath: string): Partial<UsageGuardConfig> => {
  try {
    return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<UsageGuardConfig>) : {};
  } catch {
    return {};
  }
};

const loadConfig = (cwd: string): Required<UsageGuardConfig> => {
  const global = readJson(path.join(getAgentDir(), "usage-guard.json"));
  const project = readJson(path.join(cwd, ".pi", "usage-guard.json"));
  return { ...DEFAULT_CONFIG, ...global, ...project };
};

const usageFromBranch = (ctx: ExtensionContext): UsageTotals =>
  ctx.sessionManager.getBranch().reduce((totals, entry) => {
    if (entry.type !== "message" || entry.message.role !== "assistant") return totals;
    const usage = entry.message.usage;
    return {
      input: totals.input + (usage?.input ?? 0),
      output: totals.output + (usage?.output ?? 0),
      cacheRead: totals.cacheRead + (usage?.cacheRead ?? 0),
      cacheWrite: totals.cacheWrite + (usage?.cacheWrite ?? 0),
      totalTokens: totals.totalTokens + (usage?.totalTokens ?? 0),
      cost: totals.cost + (usage?.cost?.total ?? 0),
    };
  }, emptyTotals());

const formatTotals = (totals: UsageTotals): string =>
  [`tokens=${totals.totalTokens}`, `input=${totals.input}`, `output=${totals.output}`, `cost=$${totals.cost.toFixed(4)}`].join(" ");

const overHardLimit = (config: Required<UsageGuardConfig>, totals: UsageTotals): string | undefined => {
  if (totals.cost >= config.maxSessionCostUsd) return `session cost limit reached ($${totals.cost.toFixed(4)} >= $${config.maxSessionCostUsd})`;
  if (totals.totalTokens >= config.maxSessionTokens) return `session token limit reached (${totals.totalTokens} >= ${config.maxSessionTokens})`;
  return undefined;
};

const overWarnLimit = (config: Required<UsageGuardConfig>, totals: UsageTotals): string | undefined => {
  if (totals.cost >= config.warnCostUsd) return `session cost warning ($${totals.cost.toFixed(4)} >= $${config.warnCostUsd})`;
  if (totals.totalTokens >= config.warnTokens) return `session token warning (${totals.totalTokens} >= ${config.warnTokens})`;
  return undefined;
};

const subagentTaskCount = (input: Record<string, unknown>): number => {
  if (Array.isArray(input.tasks)) return input.tasks.length;
  if (Array.isArray(input.chain)) return 1;
  return 1;
};

export default function usageGuard(pi: ExtensionAPI): void {
  let toolCallsThisTurn = 0;
  let mcpCallsThisTurn = 0;
  let warned = false;

  pi.registerCommand("usage-guard", {
    description: "Show cost/rate-limit guard status",
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      const totals = usageFromBranch(ctx);
      ctx.ui.notify(
        [
          `enabled: ${config.enabled}`,
          formatTotals(totals),
          `maxSessionCostUsd: ${config.maxSessionCostUsd}`,
          `maxSessionTokens: ${config.maxSessionTokens}`,
          `maxParallelSubagents: ${config.maxParallelSubagents}`,
          `maxToolCallsPerTurn: ${config.maxToolCallsPerTurn}`,
          `maxMcpCallsPerTurn: ${config.maxMcpCallsPerTurn}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("turn_start", async () => {
    toolCallsThisTurn = 0;
    mcpCallsThisTurn = 0;
  });

  pi.on("input", async (_event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return { action: "continue" as const };
    const totals = usageFromBranch(ctx);
    const hardLimit = overHardLimit(config, totals);
    if (!hardLimit) return { action: "continue" as const };
    if (ctx.hasUI) ctx.ui.notify(`Usage guard blocked prompt: ${hardLimit}`, "error");
    return { action: "handled" as const };
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;
    toolCallsThisTurn += 1;
    if (toolCallsThisTurn > config.maxToolCallsPerTurn) {
      return { block: true, reason: `Usage guard: too many tool calls in one turn (${toolCallsThisTurn} > ${config.maxToolCallsPerTurn}).` };
    }

    if (event.toolName === "mcp_bridge") {
      mcpCallsThisTurn += 1;
      if (mcpCallsThisTurn > config.maxMcpCallsPerTurn) {
        return { block: true, reason: `Usage guard: too many MCP calls in one turn (${mcpCallsThisTurn} > ${config.maxMcpCallsPerTurn}).` };
      }
    }

    if (event.toolName === "subagent") {
      const count = subagentTaskCount(event.input as Record<string, unknown>);
      if (count > config.maxParallelSubagents) {
        return { block: true, reason: `Usage guard: subagent fan-out ${count} exceeds maxParallelSubagents=${config.maxParallelSubagents}.` };
      }
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;
    const totals = usageFromBranch(ctx);
    const warning = overWarnLimit(config, totals);
    if (warning && !warned && ctx.hasUI) {
      warned = true;
      ctx.ui.notify(`Usage guard warning: ${warning}\n${formatTotals(totals)}`, "warning");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;
    const totals = usageFromBranch(ctx);
    return {
      systemPrompt: `${event.systemPrompt}\n\n[ACTIVE USAGE GUARD]\nCurrent session usage: ${formatTotals(totals)}. Avoid unnecessary tool fan-out, repeated MCP calls, and large context reads.`,
    };
  });
}
