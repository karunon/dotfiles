import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  fuzzyFilter,
} from "@earendil-works/pi-tui";

type GitHubItem = {
  number: number;
  title: string;
  state: string;
  kind: "issue" | "pr";
};

const MAX_ITEMS = 100;
const MAX_SUGGESTIONS = 20;

function extractToken(textBeforeCursor: string): string | undefined {
  return textBeforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/)?.[1];
}

function parseGitHubRepo(remoteUrl: string): string | undefined {
  const ssh = remoteUrl.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return ssh[1];
  const https = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (https) return https[1];
  return undefined;
}

async function resolveRepo(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
  const result = await pi.exec("git", ["remote", "-v"], { cwd, timeout: 5_000 });
  if (result.code !== 0) return undefined;

  for (const line of result.stdout.split("\n")) {
    const remoteUrl = line.trim().split(/\s+/)[1];
    if (!remoteUrl) continue;
    const repo = parseGitHubRepo(remoteUrl);
    if (repo) return repo;
  }
  return undefined;
}

function itemToAutocomplete(item: GitHubItem): AutocompleteItem {
  const prefix = item.kind === "pr" ? "PR" : "Issue";
  return {
    value: `#${item.number}`,
    label: `#${item.number}`,
    description: `[${prefix}:${item.state.toLowerCase()}] ${item.title}`,
  };
}

function filterItems(items: GitHubItem[], query: string): AutocompleteItem[] {
  if (!query.trim()) return items.slice(0, MAX_SUGGESTIONS).map(itemToAutocomplete);

  if (/^\d+$/.test(query)) {
    const numeric = items.filter((item) => String(item.number).startsWith(query)).slice(0, MAX_SUGGESTIONS);
    if (numeric.length > 0) return numeric.map(itemToAutocomplete);
  }

  return fuzzyFilter(items, query, (item) => `${item.number} ${item.kind} ${item.title}`)
    .slice(0, MAX_SUGGESTIONS)
    .map(itemToAutocomplete);
}

async function listGhItems(pi: ExtensionAPI, cwd: string, repo: string): Promise<GitHubItem[] | undefined> {
  const [issues, prs] = await Promise.all([
    pi.exec(
      "gh",
      ["issue", "list", "--repo", repo, "--state", "open", "--limit", String(MAX_ITEMS), "--json", "number,title,state"],
      { cwd, timeout: 8_000 },
    ),
    pi.exec(
      "gh",
      ["pr", "list", "--repo", repo, "--state", "open", "--limit", String(MAX_ITEMS), "--json", "number,title,state"],
      { cwd, timeout: 8_000 },
    ),
  ]);

  const result: GitHubItem[] = [];
  if (issues.code === 0) {
    try {
      result.push(...(JSON.parse(issues.stdout) as Array<Omit<GitHubItem, "kind">>).map((item) => ({ ...item, kind: "issue" as const })));
    } catch {
      /* ignore parse errors */
    }
  }
  if (prs.code === 0) {
    try {
      result.push(...(JSON.parse(prs.stdout) as Array<Omit<GitHubItem, "kind">>).map((item) => ({ ...item, kind: "pr" as const })));
    } catch {
      /* ignore parse errors */
    }
  }

  return result.length > 0 ? result.sort((a, b) => b.number - a.number) : undefined;
}

function createProvider(current: AutocompleteProvider, getItems: () => Promise<GitHubItem[] | undefined>): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const token = extractToken(beforeCursor);
      if (token === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const items = await getItems();
      if (options.signal.aborted || !items?.length) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const suggestions = filterItems(items, token);
      if (suggestions.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);
      return { prefix: `#${token}`, items: suggestions };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

export default function githubAutocomplete(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const repo = await resolveRepo(pi, ctx.cwd);
    if (!repo) return;

    let itemsPromise: Promise<GitHubItem[] | undefined> | undefined;
    const getItems = () => {
      itemsPromise ||= listGhItems(pi, ctx.cwd, repo);
      return itemsPromise;
    };

    void getItems();
    ctx.ui.addAutocompleteProvider((current) => createProvider(current, getItems));
    ctx.ui.setStatus("github", ctx.ui.theme.fg("dim", `gh:${repo}`));
  });
}
