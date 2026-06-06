import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RULE_FILE_NAMES = [
  "AGENTS.override.md",
  "AGENTS.local.md",
  "CLAUDE.local.md",
  "CLAUDE.override.md",
  ".claude/CLAUDE.md",
  ".claude/AGENTS.md",
  ".codex/AGENTS.md",
  ".codex/instructions.md",
  ".codex/CLAUDE.md",
  ".cursor/AGENTS.md",
  ".cursor/rules.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  ".github/instructions.md",
  ".gemini/GEMINI.md",
  ".windsurfrules",
  "GEMINI.md",
];

const RULE_DIRS = [
  ".claude/rules",
  ".claude/rules.d",
  ".codex/rules",
  ".codex/rules.d",
  ".cursor/rules",
  ".cursor/rules.d",
  ".github/instructions",
  ".gemini/rules",
  ".windsurf/rules",
];

const RULE_EXTENSIONS = new Set([".md", ".mdc", ".txt"]);

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findRepositoryRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (isDirectory(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function existingDirectories(root: string, candidates: string[]): string[] {
  return candidates.map((candidate) => path.join(root, candidate)).filter(isDirectory);
}

function collectRuleFiles(dir: string, maxFiles = 50): string[] {
  const result: string[] = [];
  const visit = (current: string) => {
    if (result.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.length >= maxFiles) return;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && RULE_EXTENSIONS.has(path.extname(entry.name))) result.push(fullPath);
    }
  };
  if (isDirectory(dir)) visit(dir);
  return result;
}

function loadRuleContext(root: string): string | undefined {
  const files = [
    ...RULE_FILE_NAMES.map((name) => path.join(root, name)).filter(isFile),
    ...RULE_DIRS.flatMap((dir) => collectRuleFiles(path.join(root, dir))),
  ];

  if (files.length === 0) return undefined;

  const sections = files.map((file) => {
    const relative = path.relative(root, file);
    const content = fs.readFileSync(file, "utf-8");
    return `## ${relative}\n\n${content}`;
  });

  return [
    "[REPOSITORY COMPATIBILITY RULES]",
    "The following files were loaded from repository-local agent compatibility files, including AGENTS/CLAUDE local or override files and .claude/.codex/.cursor/.github/.gemini configuration files.",
    "Treat them as repository instructions unless they conflict with higher-priority system/developer instructions.",
    "",
    ...sections,
  ].join("\n");
}

export default function repositoryResources(pi: ExtensionAPI): void {
  pi.on("resources_discover", (event) => {
    const root = findRepositoryRoot(event.cwd);
    return {
      skillPaths: existingDirectories(root, [".claude/skills", ".codex/skills", ".cursor/skills", ".gemini/skills"]),
      promptPaths: existingDirectories(root, [
        ".claude/commands",
        ".codex/prompts",
        ".codex/commands",
        ".cursor/commands",
        ".github/prompts",
        ".gemini/prompts",
      ]),
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const root = findRepositoryRoot(ctx.cwd);
    const content = loadRuleContext(root);
    if (!content) return;
    return {
      // Keep local/override rule files out of the saved session log.
      systemPrompt: `${event.systemPrompt}\n\n${content}`,
    };
  });
}
