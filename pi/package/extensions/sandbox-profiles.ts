import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./plan-mode/utils.ts";

interface SandboxProfile {
  description?: string;
  tools?: string[];
  instructions?: string;
  readOnlyBash?: boolean;
  forceContainerForBash?: boolean;
}

interface SandboxProfilesConfig {
  default?: string;
  profiles?: Record<string, SandboxProfile>;
}

interface SandboxState {
  profileName?: string;
  toolsBeforeProfile?: string[];
}

function readJson(filePath: string): SandboxProfilesConfig {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SandboxProfilesConfig;
  } catch {
    return {};
  }
}

function loadConfig(cwd: string): SandboxProfilesConfig {
  return {
    profiles: {},
    ...readJson(path.join(getAgentDir(), "sandbox-profiles.json")),
    ...readJson(path.join(cwd, ".pi", "sandbox-profiles.json")),
    profiles: {
      ...(readJson(path.join(getAgentDir(), "sandbox-profiles.json")).profiles ?? {}),
      ...(readJson(path.join(cwd, ".pi", "sandbox-profiles.json")).profiles ?? {}),
    },
  };
}

function summarizeProfile(name: string, profile: SandboxProfile): string {
  const parts = [name];
  if (profile.description) parts.push(`— ${profile.description}`);
  if (profile.tools?.length) parts.push(`tools:${profile.tools.join(",")}`);
  if (profile.readOnlyBash) parts.push("read-only bash");
  if (profile.forceContainerForBash) parts.push("container bash");
  return parts.join(" ");
}

export default function sandboxProfiles(pi: ExtensionAPI): void {
  let config: SandboxProfilesConfig = {};
  let activeProfileName: string | undefined;
  let activeProfile: SandboxProfile | undefined;
  let toolsBeforeProfile: string[] | undefined;

  pi.registerFlag("sandbox-profile", {
    description: "Activate a named sandbox execution profile from sandbox-profiles.json",
    type: "string",
  });

  function availableTools(names: string[]): string[] {
    const known = new Set(pi.getAllTools().map((tool) => tool.name));
    return names.filter((name) => known.has(name));
  }

  function persist(): void {
    pi.appendEntry<SandboxState>("sandbox-profile", { profileName: activeProfileName, toolsBeforeProfile });
  }

  function setStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      "sandbox-profile",
      activeProfileName ? ctx.ui.theme.fg("warning", `sandbox:${activeProfileName}`) : undefined,
    );
  }

  function applyProfile(ctx: ExtensionContext, name: string, profile: SandboxProfile): void {
    if (!toolsBeforeProfile) toolsBeforeProfile = pi.getActiveTools();
    activeProfileName = name;
    activeProfile = profile;

    if (profile.tools?.length) {
      const tools = availableTools(profile.tools);
      if (tools.length > 0) pi.setActiveTools(tools);
    }

    setStatus(ctx);
    persist();
  }

  function clearProfile(ctx: ExtensionContext): void {
    activeProfileName = undefined;
    activeProfile = undefined;
    if (toolsBeforeProfile?.length) pi.setActiveTools(availableTools(toolsBeforeProfile));
    toolsBeforeProfile = undefined;
    setStatus(ctx);
    persist();
  }

  async function chooseProfile(ctx: ExtensionContext): Promise<void> {
    const profiles = config.profiles ?? {};
    const names = Object.keys(profiles).sort();
    if (names.length === 0) {
      ctx.ui.notify("No sandbox profiles found. Add ~/.pi/agent/sandbox-profiles.json or .pi/sandbox-profiles.json.", "warning");
      return;
    }

    const selected = await ctx.ui.select("Select sandbox profile", [
      "(none) clear sandbox profile",
      ...names.map((name) => summarizeProfile(name, profiles[name])),
    ]);
    if (!selected) return;
    if (selected.startsWith("(none)")) {
      clearProfile(ctx);
      ctx.ui.notify("Sandbox profile cleared.", "info");
      return;
    }

    const name = selected.split(" ")[0];
    applyProfile(ctx, name, profiles[name]);
    ctx.ui.notify(`Sandbox profile activated: ${name}`, "info");
  }

  pi.registerCommand("sandbox", {
    description: "List, select, or activate sandbox execution profiles (usage: /sandbox [name|list|clear])",
    handler: async (args, ctx) => {
      config = loadConfig(ctx.cwd);
      const profiles = config.profiles ?? {};
      const name = args.trim();

      if (!name) return chooseProfile(ctx);
      if (name === "list") {
        const lines = Object.entries(profiles).map(([profileName, profile]) => summarizeProfile(profileName, profile));
        ctx.ui.notify(lines.length ? lines.join("\n") : "No sandbox profiles configured.", "info");
        return;
      }
      if (["none", "clear", "off"].includes(name)) {
        clearProfile(ctx);
        ctx.ui.notify("Sandbox profile cleared.", "info");
        return;
      }

      const profile = profiles[name];
      if (!profile) {
        ctx.ui.notify(`Unknown sandbox profile "${name}". Available: ${Object.keys(profiles).sort().join(", ") || "none"}`, "error");
        return;
      }
      applyProfile(ctx, name, profile);
      ctx.ui.notify(`Sandbox profile activated: ${name}`, "info");
    },
  });

  pi.on("tool_call", async (event) => {
    if (!activeProfile) return;
    if (event.toolName !== "bash") return;

    const command = typeof event.input.command === "string" ? event.input.command : "";
    if (activeProfile.forceContainerForBash) {
      return { block: true, reason: "Active sandbox profile requires container_bash instead of bash." };
    }
    if (activeProfile.readOnlyBash && !isSafeCommand(command)) {
      return { block: true, reason: `Active sandbox profile allows only read-only bash commands. Command: ${command}` };
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (!activeProfileName || !activeProfile) return;
    const profileText = [
      `[ACTIVE SANDBOX PROFILE: ${activeProfileName}]`,
      activeProfile.description ? `Description: ${activeProfile.description}` : undefined,
      activeProfile.readOnlyBash ? "Bash is restricted to read-only allowlisted commands." : undefined,
      activeProfile.forceContainerForBash ? "Use container_bash instead of bash for shell commands." : undefined,
      activeProfile.instructions,
    ]
      .filter(Boolean)
      .join("\n");
    return { systemPrompt: `${event.systemPrompt}\n\n${profileText}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(ctx.cwd);

    const entries = ctx.sessionManager.getEntries();
    const saved = entries
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "sandbox-profile")
      .pop() as { data?: SandboxState } | undefined;

    const flag = pi.getFlag("sandbox-profile");
    const requested = typeof flag === "string" && flag ? flag : saved?.data?.profileName ?? config.default;
    toolsBeforeProfile = saved?.data?.toolsBeforeProfile;

    if (requested && config.profiles?.[requested]) {
      applyProfile(ctx, requested, config.profiles[requested]);
    } else {
      setStatus(ctx);
    }
  });
}
