import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const safeName = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "pi-session";

const defaultExportPath = (cwd: string, sessionName?: string): string => {
  const dir = path.join(cwd, ".pi", "exports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `${stamp}-${safeName(sessionName ?? "session")}.html`);
};

const resolveExportPath = (
  cwd: string,
  requested: string,
  sessionName?: string,
): string =>
  path.resolve(cwd, requested.trim() || defaultExportPath(cwd, sessionName));

const exportFailureMessage = (result: {
  stderr?: string;
  stdout?: string;
  code: number;
}): string =>
  `Export failed: ${result.stderr || result.stdout || `exit code ${result.code}`}`;

const shareHelpText = (): string =>
  [
    "Session sharing helpers:",
    "- /export-html [file] : export this session to HTML under .pi/exports by default",
    "- Built-in /export [file] : export from interactive pi",
    "- Built-in /share : upload as a private GitHub gist when available",
    "",
    "Tip: review exported HTML before sharing; sessions may contain secrets or private paths.",
  ].join("\n");

export default function exportShare(pi: ExtensionAPI): void {
  pi.registerCommand("export-html", {
    description:
      "Export current session to HTML (usage: /export-html [output.html])",
    handler: async (args, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify(
          "Current session is ephemeral and cannot be exported.",
          "warning",
        );
        return;
      }

      const outPath = resolveExportPath(ctx.cwd, args, pi.getSessionName());
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      const result = await pi.exec("pi", ["--export", sessionFile, outPath], {
        cwd: ctx.cwd,
        timeout: 60_000,
      });
      if (result.code === 0) {
        ctx.ui.notify(`Session exported: ${outPath}`, "info");
        return;
      }

      ctx.ui.notify(exportFailureMessage(result), "error");
    },
  });

  pi.registerCommand("share-help", {
    description: "Show pi session export/share helper commands",
    handler: async (_args, ctx) => {
      ctx.ui.notify(shareHelpText(), "info");
    },
  });
}
