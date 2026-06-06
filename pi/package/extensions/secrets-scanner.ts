import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface SecretPattern {
  name: string;
  pattern: string;
  action?: "block" | "redact" | "warn";
}

interface SecretsConfig {
  enabled?: boolean;
  scanToolInputs?: boolean;
  scanToolResults?: boolean;
  defaultAction?: "block" | "redact" | "warn";
  patterns?: SecretPattern[];
}

interface SecretFinding {
  name: string;
  action: "block" | "redact" | "warn";
  count: number;
}

const DEFAULT_PATTERNS: SecretPattern[] = [
  { name: "OpenAI/Anthropic style API key", pattern: "\\bsk-[A-Za-z0-9_-]{20,}\\b", action: "block" },
  { name: "GitHub token", pattern: "\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b", action: "block" },
  { name: "AWS access key", pattern: "\\bAKIA[0-9A-Z]{16}\\b", action: "block" },
  { name: "Private key", pattern: "-----BEGIN [^-]+ PRIVATE KEY-----[\\s\\S]*?-----END [^-]+ PRIVATE KEY-----", action: "block" },
  { name: "Generic secret assignment", pattern: "(api[_-]?key|token|password|secret)\\s*[:=]\\s*[^\\s'\"]{8,}", action: "redact" },
];

const DEFAULT_CONFIG: Required<SecretsConfig> = {
  enabled: true,
  scanToolInputs: true,
  scanToolResults: true,
  defaultAction: "redact",
  patterns: DEFAULT_PATTERNS,
};

const readJson = (filePath: string): Partial<SecretsConfig> => {
  try {
    return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<SecretsConfig>) : {};
  } catch {
    return {};
  }
};

const loadConfig = (cwd: string): Required<SecretsConfig> => {
  const global = readJson(path.join(getAgentDir(), "secrets.json"));
  const project = readJson(path.join(cwd, ".pi", "secrets.json"));
  return {
    ...DEFAULT_CONFIG,
    ...global,
    ...project,
    patterns: [...DEFAULT_PATTERNS, ...(global.patterns ?? []), ...(project.patterns ?? [])],
  };
};

const safeRegExp = (pattern: string): RegExp | undefined => {
  try {
    return new RegExp(pattern, "gi");
  } catch {
    return undefined;
  }
};

const textFromUnknown = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const scanText = (config: Required<SecretsConfig>, text: string): SecretFinding[] =>
  config.patterns
    .map((entry) => {
      const re = safeRegExp(entry.pattern);
      if (!re) return undefined;
      const matches = text.match(re) ?? [];
      return matches.length > 0 ? { name: entry.name, action: entry.action ?? config.defaultAction, count: matches.length } : undefined;
    })
    .filter((finding): finding is SecretFinding => Boolean(finding));

const redactText = (config: Required<SecretsConfig>, text: string): string =>
  config.patterns.reduce((current, entry) => {
    const action = entry.action ?? config.defaultAction;
    const re = safeRegExp(entry.pattern);
    return re && (action === "redact" || action === "block") ? current.replace(re, `[REDACTED:${entry.name}]`) : current;
  }, text);

const redactContent = (config: Required<SecretsConfig>, content: any): any =>
  Array.isArray(content)
    ? content.map((part) => (part?.type === "text" ? { ...part, text: redactText(config, String(part.text ?? "")) } : part))
    : content;

const formatFindings = (findings: SecretFinding[]): string =>
  findings.map((finding) => `${finding.name} (${finding.count}, ${finding.action})`).join(", ");

const hasBlockingFinding = (findings: SecretFinding[]): boolean => findings.some((finding) => finding.action === "block");

export default function secretsScanner(pi: ExtensionAPI): void {
  pi.registerCommand("secrets", {
    description: "Show secrets scanner status",
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      ctx.ui.notify(
        [
          `enabled: ${config.enabled}`,
          `scanToolInputs: ${config.scanToolInputs}`,
          `scanToolResults: ${config.scanToolResults}`,
          `patterns: ${config.patterns.length}`,
          "Config files: ~/.pi/agent/secrets.json and .pi/secrets.json",
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled || !config.scanToolInputs) return;
    const findings = scanText(config, textFromUnknown(event.input));
    if (findings.length === 0) return;
    const summary = formatFindings(findings);
    if (hasBlockingFinding(findings)) return { block: true, reason: `Secret scanner blocked tool input: ${summary}` };
    if (ctx.hasUI) ctx.ui.notify(`Secret scanner warning in ${event.toolName}: ${summary}`, "warning");
  });

  pi.on("tool_result", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled || !config.scanToolResults) return;
    const text = textFromUnknown(event.content);
    const findings = scanText(config, text);
    if (findings.length === 0) return;
    const summary = formatFindings(findings);
    if (ctx.hasUI) ctx.ui.notify(`Secret scanner redacted ${event.toolName} result: ${summary}`, "warning");
    return { content: redactContent(config, event.content), details: { ...event.details, secretScannerFindings: findings } };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n[ACTIVE SECRETS SCANNER]\nTool inputs and outputs are scanned for secret-like values. Do not attempt to print, transform, exfiltrate, or persist secrets. If a task requires secrets, ask the user for a safer workflow.`,
    };
  });
}
