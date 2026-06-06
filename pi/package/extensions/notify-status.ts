import { execFile } from "node:child_process";
import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const escapePowerShellSingleQuoted = (value: string): string =>
  value.replace(/'/g, "''");

const notifyOsc777 = (title: string, body: string): void => {
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
};

const notifyOsc99 = (title: string, body: string): void => {
  process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
  process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
};

const notifyWindows = (title: string, body: string): void => {
  const safeTitle = escapePowerShellSingleQuoted(title);
  const safeBody = escapePowerShellSingleQuoted(body);
  const script = [
    "$type = 'Windows.UI.Notifications'",
    "$mgr = '[' + $type + '.ToastNotificationManager, ' + $type + ', ContentType = WindowsRuntime]'",
    "Add-Type -AssemblyName System.Runtime.WindowsRuntime",
    "$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
    "$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02",
    "$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)",
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${safeTitle}')) > $null`,
    `$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('${safeBody}')) > $null`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pi').Show($toast)",
  ].join("; ");
  execFile("powershell.exe", ["-NoProfile", "-Command", script], () => {});
};

const notify = (title: string, body: string): void => {
  if (!process.stdout.isTTY) return;
  if (process.env.WT_SESSION) notifyWindows(title, body);
  else if (process.env.KITTY_WINDOW_ID) notifyOsc99(title, body);
  else notifyOsc777(title, body);
};

const isTextPart = (part: unknown): part is { type: "text"; text?: unknown } =>
  Boolean(
    part &&
    typeof part === "object" &&
    "type" in part &&
    (part as { type?: string }).type === "text",
  );

const extractTextContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (isTextPart(part) ? String(part.text ?? "") : ""))
    .join("\n");
};

const titleFromPrompt = (prompt: string): string =>
  prompt
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

const findFirstUserEntry = (
  entries: SessionEntry[],
): SessionEntry | undefined =>
  entries.find(
    (entry) => entry.type === "message" && entry.message.role === "user",
  );

const findLatestAssistantEntry = <
  T extends { id: string; type: string; message?: { role?: string } },
>(
  entries: T[],
): T | undefined =>
  [...entries]
    .reverse()
    .find(
      (entry) =>
        entry.type === "message" && entry.message?.role === "assistant",
    );

const findLatestLabelledEntry = <T extends { id: string }>(
  entries: T[],
  getLabel: (id: string) => string | undefined,
): { entry: T; label: string } | undefined =>
  [...entries]
    .reverse()
    .map((entry) => ({ entry, label: getLabel(entry.id) }))
    .find((item): item is { entry: T; label: string } => Boolean(item.label));

export default function notifyStatus(pi: ExtensionAPI): void {
  let turnCount = 0;

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("pi-ready", ctx.ui.theme.fg("dim", "ready"));
    if (ctx.model)
      ctx.ui.setStatus(
        "pi-model",
        ctx.ui.theme.fg("dim", `${ctx.model.provider}/${ctx.model.id}`),
      );
  });

  pi.on("model_select", async (event, ctx) => {
    ctx.ui.setStatus(
      "pi-model",
      ctx.ui.theme.fg("dim", `${event.model.provider}/${event.model.id}`),
    );
  });

  pi.on("turn_start", async (_event, ctx) => {
    turnCount += 1;
    ctx.ui.setStatus(
      "pi-ready",
      `${ctx.ui.theme.fg("accent", "●")} ${ctx.ui.theme.fg("dim", `turn ${turnCount}`)}`,
    );
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setStatus(
      "pi-ready",
      `${ctx.ui.theme.fg("success", "✓")} ${ctx.ui.theme.fg("dim", `turn ${turnCount}`)}`,
    );
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!pi.getSessionName()) {
      const firstUser = findFirstUserEntry(ctx.sessionManager.getEntries());
      if (firstUser?.type === "message") {
        const title = titleFromPrompt(
          extractTextContent(firstUser.message.content),
        );
        if (title) pi.setSessionName(title);
      }
    }

    notify("Pi", "Ready for input");
    if (ctx.hasUI)
      ctx.ui.setStatus("pi-ready", ctx.ui.theme.fg("success", "ready"));
  });

  pi.registerCommand("session-name", {
    description: "Set or show session name",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (name) {
        pi.setSessionName(name);
        ctx.ui.notify(`Session named: ${name}`, "info");
      } else {
        ctx.ui.notify(
          pi.getSessionName()
            ? `Session: ${pi.getSessionName()}`
            : "No session name set",
          "info",
        );
      }
    },
  });

  pi.registerCommand("bookmark", {
    description: "Bookmark the last assistant message for /tree navigation",
    handler: async (args, ctx) => {
      const label = args.trim() || `bookmark-${Date.now()}`;
      const entry = findLatestAssistantEntry(ctx.sessionManager.getEntries());
      if (entry) {
        pi.setLabel(entry.id, label);
        ctx.ui.notify(`Bookmarked: ${label}`, "info");
        return;
      }
      ctx.ui.notify("No assistant message to bookmark", "warning");
    },
  });

  pi.registerCommand("unbookmark", {
    description: "Remove the latest bookmark label",
    handler: async (_args, ctx) => {
      const item = findLatestLabelledEntry(
        ctx.sessionManager.getEntries(),
        (id) => ctx.sessionManager.getLabel(id),
      );
      if (item) {
        pi.setLabel(item.entry.id, undefined);
        ctx.ui.notify(`Removed bookmark: ${item.label}`, "info");
        return;
      }
      ctx.ui.notify("No bookmark found", "warning");
    },
  });
}
