import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadNetworkPolicy, validateNetworkText, type NetworkPolicy } from "./lib/network-policy.ts";

interface ContainerConfig {
  runtime?: "docker" | "podman";
  image?: string;
  network?: "none" | "bridge" | "host";
  extraArgs?: string[];
  networkPolicy?: NetworkPolicy;
}

const DEFAULT_CONFIG = {
  runtime: "docker" as const,
  image: "ubuntu:24.04",
  network: "none" as const,
  extraArgs: [] as string[],
  networkPolicy: undefined as NetworkPolicy | undefined,
};

function loadJson(filePath: string): Partial<ContainerConfig> {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ContainerConfig>;
  } catch {
    return {};
  }
}

function loadConfig(cwd: string): typeof DEFAULT_CONFIG & Partial<ContainerConfig> {
  const homeConfig = path.join(os.homedir(), ".pi", "agent", "container.json");
  const projectConfig = path.join(cwd, ".pi", "container.json");
  return { ...DEFAULT_CONFIG, ...loadJson(homeConfig), ...loadJson(projectConfig) };
}

function resolveInsideProject(cwd: string, requested?: string): string {
  const resolved = path.resolve(cwd, requested ?? ".");
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`container_bash cwd must stay inside the current project: ${requested}`);
  }
  return resolved;
}

async function pickRuntime(pi: ExtensionAPI, preferred: "docker" | "podman", cwd: string): Promise<"docker" | "podman"> {
  const preferredResult = await pi.exec(preferred, ["--version"], { cwd, timeout: 5_000 });
  if (preferredResult.code === 0) return preferred;
  const fallback = preferred === "docker" ? "podman" : "docker";
  const fallbackResult = await pi.exec(fallback, ["--version"], { cwd, timeout: 5_000 });
  if (fallbackResult.code === 0) return fallback;
  throw new Error(`Neither ${preferred} nor ${fallback} is available.`);
}

function writeFullOutput(text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-container-bash-"));
  const file = path.join(dir, "output.log");
  fs.writeFileSync(file, text, "utf-8");
  return file;
}

export default function containerBash(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "container_bash",
    label: "Container Bash",
    description:
      "Run a shell command inside a Docker/Podman container with the project mounted at /workspace. Use for risky, untrusted, or dependency-heavy commands.",
    promptSnippet: "Run commands in an isolated Docker/Podman container with project mounted at /workspace.",
    promptGuidelines: [
      "Use container_bash instead of bash for risky commands, untrusted scripts, or commands that should not mutate the host outside the project.",
      "container_bash defaults to network=none; request network explicitly only when necessary.",
    ],
    parameters: Type.Object({
      command: Type.String({ description: "Command to run inside the container" }),
      cwd: Type.Optional(Type.String({ description: "Working directory inside the current project to mount/run from" })),
      image: Type.Optional(Type.String({ description: "Container image. Defaults to config image or ubuntu:24.04" })),
      network: Type.Optional(StringEnum(["none", "bridge", "host"] as const, { description: "Container network mode" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      const hostCwd = resolveInsideProject(ctx.cwd, params.cwd);
      const runtime = await pickRuntime(pi, config.runtime, ctx.cwd);
      const image = params.image ?? config.image;
      const network = params.network ?? config.network;
      const policy = { ...loadNetworkPolicy(ctx.cwd), ...(config.networkPolicy ?? {}) };
      const networkCheck = network === "none" ? { ok: true } : validateNetworkText(policy, params.command);
      if (!networkCheck.ok) {
        return {
          content: [
            {
              type: "text",
              text: `container_bash network policy blocked this command. ${networkCheck.reason ?? "Network destination is not allowed."}`,
            },
          ],
          details: { policy, network, networkCheck },
        };
      }

      const args = [
        "run",
        "--rm",
        "-i",
        "--network",
        network,
        "-v",
        `${hostCwd}:/workspace`,
        "-w",
        "/workspace",
        ...config.extraArgs,
        image,
        "bash",
        "-lc",
        params.command,
      ];

      const result = await pi.exec(runtime, args, { cwd: ctx.cwd, timeout: params.timeout ?? 120, signal });
      const fullOutput = [
        `$ ${runtime} ${args.join(" ")}`,
        result.stdout,
        result.stderr ? `\n[stderr]\n${result.stderr}` : "",
      ].join("\n");

      const truncation = truncateTail(fullOutput, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
      let text = truncation.content;
      if (truncation.truncated) {
        const fullOutputPath = writeFullOutput(fullOutput);
        text += `\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ${formatSize(
          truncation.outputBytes,
        )}/${formatSize(truncation.totalBytes)}. Full output: ${fullOutputPath}]`;
      }
      text += `\n\nExit code: ${result.code}`;

      return {
        content: [{ type: "text", text }],
        details: { runtime, image, network, hostCwd, exitCode: result.code, killed: result.killed },
      };
    },
  });

  pi.registerCommand("container-sandbox", {
    description: "Show container_bash sandbox configuration",
    handler: async (_args, ctx) => {
      const config = loadConfig(ctx.cwd);
      ctx.ui.notify(
        [
          "container_bash configuration:",
          `runtime: ${config.runtime}`,
          `image: ${config.image}`,
          `network: ${config.network}`,
          `extraArgs: ${config.extraArgs.join(" ") || "(none)"}`,
          `networkPolicy: ${JSON.stringify({ ...loadNetworkPolicy(ctx.cwd), ...(config.networkPolicy ?? {}) })}`,
          "Config files: ~/.pi/agent/container.json, ~/.pi/agent/network-policy.json, .pi/container.json, and .pi/network-policy.json",
        ].join("\n"),
        "info",
      );
    },
  });
}
