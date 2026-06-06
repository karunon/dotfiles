import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface NetworkPolicy {
  enabled?: boolean;
  allow?: string[];
  deny?: string[];
  allowLocal?: boolean;
  requireKnownHosts?: boolean;
}

export interface NetworkPolicyConfig {
  networkPolicy?: NetworkPolicy;
}

const DEFAULT_POLICY: Required<NetworkPolicy> = {
  enabled: true,
  allow: [],
  deny: [],
  allowLocal: false,
  requireKnownHosts: true,
};

const readJson = <T extends object>(filePath: string): Partial<T> => {
  try {
    return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<T>) : {};
  } catch {
    return {};
  }
};

export const loadNetworkPolicy = (cwd: string): Required<NetworkPolicy> => {
  const global = readJson<NetworkPolicyConfig>(path.join(getAgentDir(), "network-policy.json"));
  const project = readJson<NetworkPolicyConfig>(path.join(cwd, ".pi", "network-policy.json"));
  return { ...DEFAULT_POLICY, ...(global.networkPolicy ?? {}), ...(project.networkPolicy ?? {}) };
};

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const hostFromToken = (token: string): string | undefined => {
  try {
    if (/^https?:\/\//i.test(token)) return new URL(token).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  const hostLike = token.match(/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/.*)?$/i)?.[0];
  return hostLike?.split(/[/:]/)[0]?.toLowerCase();
};

export const extractHosts = (text: string): string[] => {
  const tokens = text
    .replace(/["'`]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[),;]+$/g, ""));
  return unique(tokens.map(hostFromToken).filter((host): host is string => Boolean(host)));
};

const isLocalHost = (host: string): boolean =>
  host === "localhost" ||
  host.endsWith(".localhost") ||
  /^127\./.test(host) ||
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
  host === "::1";

const wildcardMatch = (pattern: string, host: string): boolean => {
  const normalized = pattern.toLowerCase();
  if (normalized === "*") return true;
  if (normalized.startsWith("**.")) {
    const suffix = normalized.slice(3);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(2);
    return host.endsWith(`.${suffix}`) && host !== suffix;
  }
  return host === normalized;
};

export const classifyHost = (policy: Required<NetworkPolicy>, host: string): "allowed" | "denied" => {
  const normalized = host.toLowerCase();
  if (isLocalHost(normalized) && !policy.allowLocal) return "denied";
  if (policy.deny.some((pattern) => wildcardMatch(pattern, normalized))) return "denied";
  if (policy.allow.some((pattern) => wildcardMatch(pattern, normalized))) return "allowed";
  return "denied";
};

export interface NetworkValidation {
  ok: boolean;
  hosts: string[];
  denied: string[];
  reason?: string;
}

export const validateNetworkText = (policy: Required<NetworkPolicy>, text: string): NetworkValidation => {
  if (!policy.enabled) return { ok: true, hosts: [], denied: [] };
  const hosts = extractHosts(text);
  if (hosts.length === 0 && policy.requireKnownHosts) {
    return { ok: false, hosts, denied: [], reason: "network access requested but no destination host was found in the command/config" };
  }
  const denied = hosts.filter((host) => classifyHost(policy, host) === "denied");
  return {
    ok: denied.length === 0,
    hosts,
    denied,
    reason: denied.length ? `network destination not allowed: ${denied.join(", ")}` : undefined,
  };
};

export const defaultNetworkPolicyFile = (): string => path.join(getAgentDir(), "network-policy.json");
export const projectNetworkPolicyFile = (cwd: string): string => path.join(cwd, ".pi", "network-policy.json");

export const expandHome = (value: string): string =>
  value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
