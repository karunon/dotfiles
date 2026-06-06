import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface Preset {
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: string[];
  instructions?: string;
}

type PresetsConfig = Record<string, Preset>;

interface PresetState {
  name?: string;
}

let presets: PresetsConfig = {};
let activePresetName: string | undefined;
let activePreset: Preset | undefined;
let originalTools: string[] | undefined;
let originalThinkingLevel: ThinkingLevel | undefined;

function readJson(filePath: string): PresetsConfig {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as PresetsConfig;
  } catch {
    return {};
  }
}

function loadPresets(cwd: string): PresetsConfig {
  return {
    ...readJson(path.join(getAgentDir(), "presets.json")),
    ...readJson(path.join(cwd, ".pi", "presets.json")),
  };
}

function describePreset(preset: Preset): string {
  const parts: string[] = [];
  if (preset.provider && preset.model) parts.push(`${preset.provider}/${preset.model}`);
  if (preset.thinkingLevel) parts.push(`thinking:${preset.thinkingLevel}`);
  if (preset.tools?.length) parts.push(`tools:${preset.tools.join(",")}`);
  return parts.join(" | ") || "instructions only";
}

function persist(pi: ExtensionAPI): void {
  pi.appendEntry<PresetState>("preset-state", { name: activePresetName });
}

function setStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus("preset", activePresetName ? ctx.ui.theme.fg("accent", `preset:${activePresetName}`) : undefined);
}

async function applyPreset(pi: ExtensionAPI, ctx: ExtensionContext, name: string, preset: Preset): Promise<void> {
  if (!originalTools) originalTools = pi.getActiveTools();
  if (!originalThinkingLevel) originalThinkingLevel = pi.getThinkingLevel() as ThinkingLevel;

  if (preset.provider && preset.model) {
    const model = ctx.modelRegistry.find(preset.provider, preset.model);
    if (!model) {
      ctx.ui.notify(`Preset "${name}": model not found: ${preset.provider}/${preset.model}`, "warning");
    } else if (!(await pi.setModel(model))) {
      ctx.ui.notify(`Preset "${name}": no API key for ${preset.provider}/${preset.model}`, "warning");
    }
  }

  if (preset.thinkingLevel) pi.setThinkingLevel(preset.thinkingLevel);

  if (preset.tools?.length) {
    const known = new Set(pi.getAllTools().map((tool) => tool.name));
    const valid = preset.tools.filter((tool) => known.has(tool));
    const invalid = preset.tools.filter((tool) => !known.has(tool));
    if (invalid.length) ctx.ui.notify(`Preset "${name}": unknown tools: ${invalid.join(", ")}`, "warning");
    if (valid.length) pi.setActiveTools(valid);
  }

  activePresetName = name;
  activePreset = preset;
  setStatus(ctx);
  persist(pi);
}

function clearPreset(pi: ExtensionAPI, ctx: ExtensionContext): void {
  activePresetName = undefined;
  activePreset = undefined;
  if (originalThinkingLevel) pi.setThinkingLevel(originalThinkingLevel);
  if (originalTools?.length) pi.setActiveTools(originalTools);
  setStatus(ctx);
  persist(pi);
}

async function selectPreset(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const names = Object.keys(presets).sort();
  if (names.length === 0) {
    ctx.ui.notify("No presets found. Add ~/.pi/agent/presets.json or .pi/presets.json.", "warning");
    return;
  }

  const labels = ["(none) clear preset", ...names.map((name) => `${name} — ${describePreset(presets[name])}`)];
  const selected = await ctx.ui.select("Select preset", labels);
  if (!selected) return;
  if (selected.startsWith("(none)")) {
    clearPreset(pi, ctx);
    ctx.ui.notify("Preset cleared.", "info");
    return;
  }

  const name = selected.split(" — ")[0];
  await applyPreset(pi, ctx, name, presets[name]);
  ctx.ui.notify(`Preset activated: ${name}`, "info");
}

async function cyclePreset(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const names = Object.keys(presets).sort();
  if (names.length === 0) return;
  const cycle = [undefined, ...names];
  const current = cycle.indexOf(activePresetName);
  const next = cycle[(current + 1) % cycle.length];
  if (!next) {
    clearPreset(pi, ctx);
    ctx.ui.notify("Preset cleared.", "info");
    return;
  }
  await applyPreset(pi, ctx, next, presets[next]);
  ctx.ui.notify(`Preset activated: ${next}`, "info");
}

export default function presetExtension(pi: ExtensionAPI): void {
  pi.registerFlag("preset", {
    description: "Activate a named preset from presets.json",
    type: "string",
  });

  pi.registerCommand("preset", {
    description: "Switch model/thinking/tools preset",
    handler: async (args, ctx) => {
      presets = loadPresets(ctx.cwd);
      const name = args.trim();
      if (!name) return selectPreset(pi, ctx);
      if (name === "none" || name === "clear") {
        clearPreset(pi, ctx);
        ctx.ui.notify("Preset cleared.", "info");
        return;
      }
      const preset = presets[name];
      if (!preset) {
        ctx.ui.notify(`Unknown preset "${name}". Available: ${Object.keys(presets).sort().join(", ") || "none"}`, "error");
        return;
      }
      await applyPreset(pi, ctx, name, preset);
      ctx.ui.notify(`Preset activated: ${name}`, "info");
    },
  });

  pi.registerShortcut(Key.ctrlShift("u"), {
    description: "Cycle Pi presets",
    handler: async (ctx) => {
      presets = loadPresets(ctx.cwd);
      await cyclePreset(pi, ctx);
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!activePreset?.instructions) return;
    return { systemPrompt: `${event.systemPrompt}\n\n[ACTIVE PRESET: ${activePresetName}]\n${activePreset.instructions}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    presets = loadPresets(ctx.cwd);

    const entries = ctx.sessionManager.getEntries();
    const saved = entries
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "preset-state")
      .pop() as { data?: PresetState } | undefined;

    const flag = pi.getFlag("preset");
    const requestedName = typeof flag === "string" && flag ? flag : saved?.data?.name;
    if (requestedName && presets[requestedName]) {
      await applyPreset(pi, ctx, requestedName, presets[requestedName]);
    }
    setStatus(ctx);
  });
}
