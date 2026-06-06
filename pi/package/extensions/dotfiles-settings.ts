import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface ToggleSpec {
  label: string;
  file: string;
  path: string[];
  defaultValue: boolean;
}

const specs: ToggleSpec[] = [
  { label: "Audit log", file: "audit.json", path: ["enabled"], defaultValue: true },
  { label: "Secrets scanner", file: "secrets.json", path: ["enabled"], defaultValue: true },
  { label: "Usage guard", file: "usage-guard.json", path: ["enabled"], defaultValue: true },
  { label: "Network policy", file: "network-policy.json", path: ["networkPolicy", "enabled"], defaultValue: true },
];

const readJson = (filePath: string): any => {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
  } catch {
    return {};
  }
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

const getIn = (value: any, keys: readonly string[], fallback: boolean): boolean => {
  const found = keys.reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), value);
  return typeof found === "boolean" ? found : fallback;
};

const setIn = (value: any, [key, ...rest]: string[], next: boolean): any => {
  if (!key) return next;
  return { ...(value && typeof value === "object" ? value : {}), [key]: setIn(value?.[key], rest, next) };
};

const filePathFor = (scope: "global" | "project", cwd: string, spec: ToggleSpec): string =>
  scope === "global" ? path.join(getAgentDir(), spec.file) : path.join(cwd, ".pi", spec.file);

const rowFor = (cwd: string, scope: "global" | "project", spec: ToggleSpec): string => {
  const filePath = filePathFor(scope, cwd, spec);
  const value = getIn(readJson(filePath), spec.path, spec.defaultValue);
  return `${value ? "✓" : "○"} ${scope} ${spec.label} (${spec.file}:${spec.path.join(".")})`;
};

const toggle = (cwd: string, scope: "global" | "project", spec: ToggleSpec): boolean => {
  const filePath = filePathFor(scope, cwd, spec);
  const current = readJson(filePath);
  const next = !getIn(current, spec.path, spec.defaultValue);
  writeJson(filePath, setIn(current, [...spec.path], next));
  return next;
};

export default function dotfilesSettings(pi: ExtensionAPI): void {
  pi.registerCommand("dotfiles-settings", {
    description: "Configure dotfiles pi extension toggles",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const options = [
        ...specs.map((spec) => rowFor(ctx.cwd, "global", spec)),
        ...specs.map((spec) => rowFor(ctx.cwd, "project", spec)),
        "Open config paths",
      ];
      const selected = await ctx.ui.select("Dotfiles Pi settings", options);
      if (!selected) return;
      if (selected === "Open config paths") {
        ctx.ui.notify(
          [
            `global: ${getAgentDir()}`,
            `project: ${path.join(ctx.cwd, ".pi")}`,
            "Note: global files managed by Home Manager may be overwritten on switch.",
          ].join("\n"),
          "info",
        );
        return;
      }

      const scope = selected.includes(" global ") ? "global" : "project";
      const spec = specs.find((candidate) => selected.includes(candidate.label));
      if (!spec) return;
      const next = toggle(ctx.cwd, scope, spec);
      ctx.ui.notify(`${scope} ${spec.label}: ${next ? "enabled" : "disabled"}`, "info");
    },
  });
}
