import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

interface HistoryEntry {
  text: string;
  cwd: string;
  timestamp: string;
}

interface DraftEntry extends HistoryEntry {
  title: string;
}

interface HistoryFile {
  history: HistoryEntry[];
  drafts: DraftEntry[];
}

const HISTORY_PATH = path.join(getAgentDir(), "prompt-history.json");
const MAX_HISTORY = 300;
const MAX_DRAFTS = 100;

function readStore(): HistoryFile {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return { history: [], drafts: [] };
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8")) as Partial<HistoryFile>;
    return { history: parsed.history ?? [], drafts: parsed.drafts ?? [] };
  } catch {
    return { history: [], drafts: [] };
  }
}

function writeStore(store: HistoryFile): void {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(store, null, 2));
}

function oneLine(text: string, max = 100): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}

function addHistory(text: string, cwd: string): void {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/history") || trimmed.startsWith("/draft")) return;
  const store = readStore();
  store.history = store.history.filter((entry) => entry.text !== trimmed);
  store.history.unshift({ text: trimmed, cwd, timestamp: new Date().toISOString() });
  store.history = store.history.slice(0, MAX_HISTORY);
  writeStore(store);
}

function addDraft(text: string, cwd: string, title?: string): DraftEntry {
  const entry: DraftEntry = {
    text,
    cwd,
    title: title?.trim() || oneLine(text, 60) || "untitled draft",
    timestamp: new Date().toISOString(),
  };
  const store = readStore();
  store.drafts.unshift(entry);
  store.drafts = store.drafts.slice(0, MAX_DRAFTS);
  writeStore(store);
  return entry;
}

function filterEntries<T extends HistoryEntry>(entries: T[], query: string, cwd?: string): T[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (cwd && entry.cwd !== cwd && !entry.cwd.startsWith(cwd) && !cwd.startsWith(entry.cwd)) return false;
    if (!q) return true;
    return `${entry.text} ${(entry as DraftEntry).title ?? ""}`.toLowerCase().includes(q);
  });
}

export default function promptHistory(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (!event.text.trim().startsWith("/")) addHistory(event.text, ctx.cwd);
    return { action: "continue" as const };
  });

  pi.registerCommand("history", {
    description: "Search prompt history and restore a prompt to the editor (usage: /history [query])",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const entries = filterEntries(readStore().history, args, ctx.cwd).slice(0, 80);
      if (entries.length === 0) {
        ctx.ui.notify("No matching prompt history.", "warning");
        return;
      }
      const labels = entries.map((entry) => `${new Date(entry.timestamp).toLocaleString()} — ${oneLine(entry.text, 120)}`);
      const selected = await ctx.ui.select("Prompt history", labels);
      if (!selected) return;
      const index = labels.indexOf(selected);
      if (index >= 0) ctx.ui.setEditorText(entries[index].text);
    },
  });

  pi.registerCommand("draft-save", {
    description: "Save text as a draft (usage: /draft-save <draft text>; Ctrl+Shift+S saves the editor)",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const text = args.trim() || ctx.ui.getEditorText().trim();
      if (!text) {
        ctx.ui.notify("No draft text provided and the editor is empty.", "warning");
        return;
      }
      const draft = addDraft(text, ctx.cwd);
      ctx.ui.notify(`Draft saved: ${draft.title}`, "info");
    },
  });

  pi.registerCommand("drafts", {
    description: "Search saved drafts and restore one to the editor (usage: /drafts [query])",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const drafts = filterEntries(readStore().drafts, args, ctx.cwd).slice(0, 80);
      if (drafts.length === 0) {
        ctx.ui.notify("No matching drafts.", "warning");
        return;
      }
      const labels = drafts.map((draft) => `${draft.title} — ${new Date(draft.timestamp).toLocaleString()} — ${oneLine(draft.text, 100)}`);
      const selected = await ctx.ui.select("Saved drafts", labels);
      if (!selected) return;
      const index = labels.indexOf(selected);
      if (index >= 0) ctx.ui.setEditorText(drafts[index].text);
    },
  });

  pi.registerCommand("draft-clear", {
    description: "Delete all saved drafts",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const ok = await ctx.ui.confirm("Clear drafts?", "Delete all saved prompt drafts?");
      if (!ok) return;
      const store = readStore();
      store.drafts = [];
      writeStore(store);
      ctx.ui.notify("Drafts cleared.", "info");
    },
  });

  pi.registerShortcut(Key.ctrlShift("s"), {
    description: "Save current prompt draft",
    handler: async (ctx) => {
      if (!ctx.hasUI) return;
      const text = ctx.ui.getEditorText().trim();
      if (!text) {
        ctx.ui.notify("Editor is empty; nothing to save as a draft.", "warning");
        return;
      }
      const draft = addDraft(text, ctx.cwd);
      ctx.ui.notify(`Draft saved: ${draft.title}`, "info");
    },
  });
}
