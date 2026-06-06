import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_INLINE_DIFF_BYTES = 70 * 1024;

interface ReviewTarget {
  label: string;
  commands: Array<{ command: string; args: string[] }>;
  instructions: string;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "review";
}

function buildTarget(args: string): ReviewTarget {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "all" || trimmed === "working") {
    return {
      label: "working-tree",
      commands: [
        { command: "git", args: ["diff", "--cached", "--"] },
        { command: "git", args: ["diff", "--"] },
      ],
      instructions: "Review both staged and unstaged working-tree changes.",
    };
  }

  if (trimmed === "staged" || trimmed === "cached") {
    return {
      label: "staged",
      commands: [{ command: "git", args: ["diff", "--cached", "--"] }],
      instructions: "Review staged changes only.",
    };
  }

  if (trimmed === "unstaged") {
    return {
      label: "unstaged",
      commands: [{ command: "git", args: ["diff", "--"] }],
      instructions: "Review unstaged changes only.",
    };
  }

  if (trimmed === "last") {
    return {
      label: "last-commit",
      commands: [{ command: "git", args: ["show", "--format=fuller", "--stat", "--patch", "HEAD"] }],
      instructions: "Review the last commit.",
    };
  }

  const [kind, ...rest] = trimmed.split(/\s+/);
  const value = rest.join(" ").trim();
  if (kind === "commit" && value) {
    return {
      label: `commit-${safeName(value)}`,
      commands: [{ command: "git", args: ["show", "--format=fuller", "--stat", "--patch", value] }],
      instructions: `Review commit ${value}.`,
    };
  }

  if ((kind === "branch" || kind === "base") && value) {
    return {
      label: `branch-${safeName(value)}`,
      commands: [{ command: "git", args: ["diff", `${value}...HEAD`, "--"] }],
      instructions: `Review this branch against ${value} using merge-base diff semantics.`,
    };
  }

  if (trimmed.includes("..")) {
    return {
      label: `range-${safeName(trimmed)}`,
      commands: [{ command: "git", args: ["diff", trimmed, "--"] }],
      instructions: `Review git revision range ${trimmed}.`,
    };
  }

  return {
    label: `branch-${safeName(trimmed)}`,
    commands: [{ command: "git", args: ["diff", `${trimmed}...HEAD`, "--"] }],
    instructions: `Review this branch against ${trimmed} using merge-base diff semantics.`,
  };
}

async function collectDiff(pi: ExtensionAPI, cwd: string, target: ReviewTarget): Promise<{ text: string; errors: string[] }> {
  const parts: string[] = [];
  const errors: string[] = [];
  for (const spec of target.commands) {
    const result = await pi.exec(spec.command, spec.args, { cwd, timeout: 60_000 });
    parts.push(`$ ${spec.command} ${spec.args.join(" ")}\n${result.stdout}`);
    if (result.code !== 0) errors.push(result.stderr || result.stdout || `${spec.command} exited ${result.code}`);
  }
  return { text: parts.join("\n\n---\n\n"), errors };
}

function writeLargeDiff(cwd: string, label: string, diff: string): string {
  const dir = path.join(cwd, ".pi", "reviews");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeName(label)}.diff`);
  fs.writeFileSync(file, diff, "utf-8");
  return file;
}

function buildParallelReviewPrompt(target: ReviewTarget, diffText: string, diffPath?: string, extraInstructions?: string): string {
  const diffSection = diffPath
    ? `The diff is large and has been saved to: ${diffPath}. Each reviewer should inspect it plus relevant touched files.`
    : `Diff to review:\n\n\`\`\`diff\n${diffText}\n\`\`\``;

  return [
    "Run a parallel code review workflow. Do not modify files.",
    "",
    target.instructions,
    extraInstructions ? `Additional review focus: ${extraInstructions}` : undefined,
    "",
    "Use the subagent tool with parallel tasks if available. Spawn reviewer agents with these focuses:",
    "1. Correctness and behavior regressions",
    "2. Security and privacy",
    "3. Tests, validation, and edge cases",
    "4. Maintainability and complexity",
    "",
    "Wait for all reviewers, merge duplicate findings, sort by severity, and return one consolidated review.",
    "Report only actionable findings with file paths and line numbers when possible.",
    "",
    diffSection,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildReviewPrompt(target: ReviewTarget, diffText: string, diffPath?: string, extraInstructions?: string): string {
  const diffSection = diffPath
    ? `The diff is large and has been saved to: ${diffPath}\nUse read/bash as needed to inspect it and the touched files.`
    : `Diff to review:\n\n\`\`\`diff\n${diffText}\n\`\`\``;

  return [
    "Run a dedicated code review workflow. Do not modify files.",
    "",
    target.instructions,
    extraInstructions ? `Additional review focus: ${extraInstructions}` : undefined,
    "",
    "Review priorities:",
    "1. Correctness bugs and behavior regressions",
    "2. Security/privacy issues",
    "3. Missing validation or tests",
    "4. Race conditions and error handling gaps",
    "5. Maintainability problems with concrete impact",
    "",
    "If the subagent tool is available, prefer delegating to the reviewer agent and then consolidate the result.",
    "Report only actionable findings. Include file paths and line numbers when possible.",
    "Use this output format:",
    "",
    "## Critical",
    "- `path:line` - issue and why it matters",
    "",
    "## Warnings",
    "- `path:line` - issue and suggested fix",
    "",
    "## Suggestions",
    "- improvement ideas",
    "",
    "## Validation Gaps",
    "- checks that should be run or tests that are missing",
    "",
    "## Summary",
    "2-3 sentences.",
    "",
    diffSection,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function reviewWorkflow(pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review git changes without modifying files (usage: /review [--parallel] [all|staged|unstaged|last|commit <sha>|branch <base>] [-- focus])",
    handler: async (args, ctx) => {
      const parallel = /(^|\s)--parallel(\s|$)/.test(args);
      const normalizedArgs = args.replace(/(^|\s)--parallel(\s|$)/, " ").trim();
      const [targetArgs, ...focusParts] = normalizedArgs.split(/\s+--\s+/);
      const target = buildTarget(targetArgs ?? "");
      const extraFocus = focusParts.join(" -- ").trim() || undefined;

      const isGit = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ctx.cwd, timeout: 10_000 });
      if (isGit.code !== 0) {
        ctx.ui.notify("/review requires a git repository.", "error");
        return;
      }

      ctx.ui.notify(`Preparing review target: ${target.label}`, "info");
      const { text, errors } = await collectDiff(pi, ctx.cwd, target);
      if (errors.length > 0) {
        ctx.ui.notify(`Failed to collect part of the diff:\n${errors.join("\n")}`, "error");
        return;
      }
      if (!text.trim().replace(/^\$.*$/gm, "").trim()) {
        ctx.ui.notify(`No diff found for ${target.label}.`, "warning");
        return;
      }

      let diffPath: string | undefined;
      let inlineDiff = text;
      if (Buffer.byteLength(text, "utf-8") > MAX_INLINE_DIFF_BYTES) {
        diffPath = writeLargeDiff(ctx.cwd, target.label, text);
        inlineDiff = text.slice(0, 4000);
      }

      pi.sendUserMessage(parallel ? buildParallelReviewPrompt(target, inlineDiff, diffPath, extraFocus) : buildReviewPrompt(target, inlineDiff, diffPath, extraFocus));
    },
  });
}
