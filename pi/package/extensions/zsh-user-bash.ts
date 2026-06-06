import * as fs from "node:fs";
import type {
  BashOperations,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, `'"'"'`)}'`;

const findZsh = (): string | undefined =>
  [process.env.SHELL, "/bin/zsh", "/usr/bin/zsh", "/opt/homebrew/bin/zsh"]
    .filter((value): value is string => Boolean(value && value.endsWith("zsh")))
    .find((candidate) => fs.existsSync(candidate));

const createZshOperations = (zsh: string): BashOperations => {
  const local = createLocalBashOperations();
  return {
    exec: (command, cwd, options) =>
      // `!command` and `!!command` should behave like the user's zsh prompt.
      // -i loads ~/.zshrc, so aliases/functions are available.
      // -c executes the provided command and then exits.
      local.exec(`${shellQuote(zsh)} -ic ${shellQuote(command)}`, cwd, options),
  };
};

export default function zshUserBash(pi: ExtensionAPI): void {
  pi.on("user_bash", () => {
    const zsh = findZsh();
    if (!zsh) return;

    return { operations: createZshOperations(zsh) };
  });
}
