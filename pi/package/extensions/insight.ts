import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface InsightState {
  enabled: boolean;
}

const STATE_TYPE = "insight-state";

const INSIGHT_PROMPT = `The user wants occasional educational implementation Insights while you work.

When it is genuinely helpful, include a concise callout labeled "Insight:" that explains one of:
- why you chose an implementation approach or trade-off,
- a codebase pattern, convention, or architecture detail you noticed,
- a subtle pitfall, constraint, or verification strategy relevant to the current work.

Guidelines for Insights:
- Keep them short: usually 1-3 sentences.
- Use the user's language.
- Include at most two Insights in a response, and often zero if there is nothing worth teaching.
- Do not interrupt urgent, terse, or purely mechanical replies.
- Do not restate obvious facts or generic programming advice.
- The Insight should support the task; it must not replace concrete progress, code changes, or verification.`;

function restoreState(ctx: ExtensionContext): InsightState | undefined {
  const entries = ctx.sessionManager.getEntries();
  return entries
    .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === STATE_TYPE)
    .map((entry) => (entry as { data?: InsightState }).data)
    .filter((state): state is InsightState => typeof state?.enabled === "boolean")
    .pop();
}

function setStatus(ctx: ExtensionContext, enabled: boolean): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("insight", enabled ? ctx.ui.theme.fg("accent", "insights") : ctx.ui.theme.fg("dim", "insights:off"));
}

export default function insight(pi: ExtensionAPI): void {
  let enabled = true;

  function persist(): void {
    pi.appendEntry<InsightState>(STATE_TYPE, { enabled });
  }

  pi.registerCommand("insight", {
    description: "Toggle educational implementation Insights (usage: /insight [on|off|status])",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (!action || action === "status") {
        ctx.ui.notify(`Educational Insights are ${enabled ? "on" : "off"}.`, "info");
        setStatus(ctx, enabled);
        return;
      }

      if (["on", "enable", "enabled", "true"].includes(action)) {
        enabled = true;
      } else if (["off", "disable", "disabled", "false"].includes(action)) {
        enabled = false;
      } else {
        ctx.ui.notify("Usage: /insight [on|off|status]", "warning");
        return;
      }

      persist();
      setStatus(ctx, enabled);
      ctx.ui.notify(`Educational Insights ${enabled ? "enabled" : "disabled"}.`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    enabled = restoreState(ctx)?.enabled ?? true;
    setStatus(ctx, enabled);
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${INSIGHT_PROMPT}` };
  });
}
