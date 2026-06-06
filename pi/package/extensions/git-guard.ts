import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface CheckpointState {
  entryId: string;
  ref: string;
  createdAt: string;
}

async function gitStatus(pi: ExtensionAPI, ctx: ExtensionContext): Promise<{ ok: boolean; dirty: boolean; count: number }> {
  const result = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd, timeout: 10_000 });
  if (result.code !== 0) return { ok: false, dirty: false, count: 0 };
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  return { ok: true, dirty: lines.length > 0, count: lines.length };
}

async function confirmDirtyRepo(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  action: string,
): Promise<{ cancel: true } | undefined> {
  const status = await gitStatus(pi, ctx);
  if (!status.ok || !status.dirty) return;

  if (!ctx.hasUI) return { cancel: true };

  const ok = await ctx.ui.confirm(
    "Uncommitted git changes",
    `There are ${status.count} changed file(s). Continue with ${action}?`,
  );
  if (!ok) return { cancel: true };
}

export default function gitGuard(pi: ExtensionAPI): void {
  const checkpoints = new Map<string, CheckpointState>();

  async function createCheckpoint(ctx: ExtensionContext, entryId?: string): Promise<CheckpointState | undefined> {
    const targetEntryId = entryId ?? ctx.sessionManager.getLeafEntry()?.id;
    if (!targetEntryId) return undefined;

    const status = await gitStatus(pi, ctx);
    if (!status.ok || !status.dirty) return undefined;

    const result = await pi.exec("git", ["stash", "create", `pi-checkpoint-${targetEntryId}`], {
      cwd: ctx.cwd,
      timeout: 30_000,
    });
    const ref = result.stdout.trim();
    if (result.code !== 0 || !ref) return undefined;

    const state: CheckpointState = { entryId: targetEntryId, ref, createdAt: new Date().toISOString() };
    checkpoints.set(targetEntryId, state);
    pi.appendEntry("git-checkpoint", state);
    return state;
  }

  function restoreCheckpoints(ctx: ExtensionContext): void {
    checkpoints.clear();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom" || entry.customType !== "git-checkpoint") continue;
      const data = entry.data as CheckpointState | undefined;
      if (data?.entryId && data.ref) checkpoints.set(data.entryId, data);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    restoreCheckpoints(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    await createCheckpoint(ctx);
  });

  pi.registerCommand("checkpoint", {
    description: "Create a git checkpoint for the current dirty working tree",
    handler: async (_args, ctx) => {
      const checkpoint = await createCheckpoint(ctx);
      if (!checkpoint) {
        ctx.ui.notify("No dirty git changes to checkpoint, or git is unavailable.", "warning");
        return;
      }
      ctx.ui.notify(`Git checkpoint created for ${checkpoint.entryId}: ${checkpoint.ref}`, "info");
    },
  });

  pi.registerCommand("checkpoints", {
    description: "List git checkpoints recorded in this session",
    handler: async (_args, ctx) => {
      restoreCheckpoints(ctx);
      const lines = Array.from(checkpoints.values()).map(
        (checkpoint) => `${checkpoint.entryId}\t${checkpoint.createdAt}\t${checkpoint.ref}`,
      );
      ctx.ui.notify(lines.length ? lines.join("\n") : "No git checkpoints recorded in this session.", "info");
    },
  });

  pi.registerCommand("rollback", {
    description: "Rollback working tree to a recorded git checkpoint (usage: /rollback [entryId|latest])",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/rollback requires interactive confirmation.", "error");
        return;
      }
      restoreCheckpoints(ctx);
      const values = Array.from(checkpoints.values());
      if (values.length === 0) {
        ctx.ui.notify("No git checkpoints recorded in this session.", "warning");
        return;
      }

      let checkpoint: CheckpointState | undefined;
      const query = args.trim();
      if (!query || query === "latest") {
        checkpoint = values[values.length - 1];
      } else {
        checkpoint = values.find((value) => value.entryId.startsWith(query) || value.ref.startsWith(query));
      }

      if (!checkpoint && ctx.hasUI) {
        const labels = values.map((value) => `${value.entryId} — ${value.createdAt} — ${value.ref}`);
        const selected = await ctx.ui.select("Select checkpoint to rollback to", labels);
        if (!selected) return;
        checkpoint = values[labels.indexOf(selected)];
      }

      if (!checkpoint) {
        ctx.ui.notify(`No matching checkpoint: ${query}`, "error");
        return;
      }

      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Rollback working tree?",
          [
            "This will run:",
            "  git reset --hard HEAD",
            `  git stash apply ${checkpoint.ref}`,
            "",
            "Uncommitted tracked changes after the checkpoint will be discarded. Untracked files are not removed.",
            `Checkpoint: ${checkpoint.entryId} (${checkpoint.createdAt})`,
          ].join("\n"),
        );
        if (!ok) return;
      }

      const reset = await pi.exec("git", ["reset", "--hard", "HEAD"], { cwd: ctx.cwd, timeout: 60_000 });
      if (reset.code !== 0) {
        ctx.ui.notify(`Rollback reset failed: ${reset.stderr || reset.stdout}`, "error");
        return;
      }
      const apply = await pi.exec("git", ["stash", "apply", checkpoint.ref], { cwd: ctx.cwd, timeout: 60_000 });
      if (apply.code !== 0) {
        ctx.ui.notify(`Rollback apply failed: ${apply.stderr || apply.stdout}`, "error");
        return;
      }
      ctx.ui.notify(`Rolled back to checkpoint ${checkpoint.entryId}. Review git diff before continuing.`, "info");
    },
  });

  pi.on("session_before_switch", async (event, ctx) => {
    const action = event.reason === "new" ? "starting a new session" : "switching sessions";
    return confirmDirtyRepo(pi, ctx, action);
  });

  pi.on("session_before_fork", async (event, ctx) => {
    const dirtyResult = await confirmDirtyRepo(pi, ctx, "forking/cloning the session");
    if (dirtyResult?.cancel) return dirtyResult;

    const checkpoint = checkpoints.get(event.entryId);
    if (!checkpoint || !ctx.hasUI) return;

    const restore = await ctx.ui.confirm(
      "Restore git checkpoint?",
      [
        "A git checkpoint exists for the selected session entry.",
        `Ref: ${checkpoint.ref}`,
        "",
        "Apply this checkpoint to the working tree after fork/clone?",
      ].join("\n"),
    );
    if (!restore) return;

    const result = await pi.exec("git", ["stash", "apply", checkpoint.ref], { cwd: ctx.cwd, timeout: 60_000 });
    if (result.code === 0) ctx.ui.notify("Git checkpoint applied.", "info");
    else ctx.ui.notify(`Failed to apply checkpoint: ${result.stderr || result.stdout}`, "error");
  });
}
