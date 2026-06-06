import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

interface GoalState {
  objective: string;
  status: "active" | "complete" | "blocked";
  createdAt: string;
  updatedAt: string;
}

let state: GoalState | undefined;

type GoalCommandResult = {
  nextState: GoalState | undefined;
  message: string;
  level: "info" | "warning";
  persist: boolean;
};

const persist = (pi: ExtensionAPI): void => {
  pi.appendEntry("goal-state", state ?? null);
};

const renderGoal = (goal: GoalState): string =>
  [
    `[GOAL ACTIVE]`,
    `Objective: ${goal.objective}`,
    `Status: ${goal.status}`,
    `Created: ${goal.createdAt}`,
    `Updated: ${goal.updatedAt}`,
    "",
    "Keep working toward this goal across turns. Do not mark it complete until the objective is actually achieved.",
  ].join("\n");

const restoreFromSession = (ctx: ExtensionContext): void => {
  const last = ctx.sessionManager
    .getEntries()
    .filter(
      (entry: { type: string; customType?: string }) =>
        entry.type === "custom" && entry.customType === "goal-state",
    )
    .pop() as { data?: GoalState | null } | undefined;
  state = last?.data ?? undefined;
};

const createGoal = (objective: string, now: string): GoalState => ({
  objective,
  status: "active",
  createdAt: now,
  updatedAt: now,
});

const updateGoalStatus = (
  current: GoalState | undefined,
  status: Extract<GoalState["status"], "complete" | "blocked">,
  now: string,
): GoalCommandResult =>
  current
    ? {
        nextState: { ...current, status, updatedAt: now },
        message:
          status === "complete"
            ? "Goal marked complete."
            : "Goal marked blocked.",
        level: status === "complete" ? "info" : "warning",
        persist: true,
      }
    : {
        nextState: current,
        message:
          status === "complete"
            ? "No active goal to complete."
            : "No active goal to block.",
        level: "warning",
        persist: false,
      };

const runGoalCommand = (
  current: GoalState | undefined,
  input: string,
  now: string,
): GoalCommandResult => {
  if (!input || input === "status") {
    return {
      nextState: current,
      message: current ? renderGoal(current) : "No active goal.",
      level: "info",
      persist: false,
    };
  }

  if (input === "clear")
    return {
      nextState: undefined,
      message: "Goal cleared.",
      level: "info",
      persist: true,
    };
  if (input === "complete" || input === "done")
    return updateGoalStatus(current, "complete", now);
  if (input === "blocked") return updateGoalStatus(current, "blocked", now);

  return {
    nextState: createGoal(input, now),
    message: "Goal created.",
    level: "info",
    persist: true,
  };
};

export default function goalExtension(pi: ExtensionAPI): void {
  pi.registerCommand("goal", {
    description:
      "Create, inspect, complete, block, or clear a persistent session goal",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const now = new Date().toISOString();
      const result = runGoalCommand(state, trimmed, now);
      state = result.nextState;
      if (result.persist) persist(pi);
      ctx.ui.notify(result.message, result.level);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreFromSession(ctx);
  });

  pi.on("before_agent_start", async () => {
    if (!state || state.status !== "active") return;
    return {
      message: {
        customType: "goal-context",
        content: renderGoal(state),
        display: false,
      },
    };
  });
}
