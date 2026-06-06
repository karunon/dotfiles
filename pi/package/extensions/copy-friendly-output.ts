import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TUI } from "@earendil-works/pi-tui";

const PATCH_MARKER = Symbol.for("karunon.pi.copyFriendlyOutput.patch");

type PatchableTuiPrototype = {
  applyLineResets: (lines: string[]) => string[];
  [PATCH_MARKER]?: true;
};

const TRAILING_ANSI_RE =
  /(?:\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b_[\s\S]*?(?:\x07|\x1b\\))$/;
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";

const splitTrailingAnsi = (line: string): { body: string; suffix: string } => {
  const match = line.match(TRAILING_ANSI_RE);
  if (!match) return { body: line, suffix: "" };

  const previous = splitTrailingAnsi(line.slice(0, -match[0].length));
  return { body: previous.body, suffix: `${previous.suffix}${match[0]}` };
};

const trimTrailingSpacesBeforeAnsi = (line: string): string => {
  const { body, suffix } = splitTrailingAnsi(line);
  return `${body.replace(/[ \t]+$/g, "")}${suffix}`;
};

const mapWithState = <T, U, S>(
  items: T[],
  initialState: S,
  mapper: (state: S, item: T) => { state: S; value: U },
): U[] => {
  const output: U[] = [];
  items.reduce((state, item) => {
    const next = mapper(state, item);
    output.push(next.value);
    return next.state;
  }, initialState);
  return output;
};

const trimCopyPaddingButKeepUserMessageBands = (lines: string[]): string[] =>
  mapWithState(lines, false, (inUserMessageZone, line) => {
    const startsUserMessage = line.includes(OSC133_ZONE_START);
    const endsUserMessage = line.includes(OSC133_ZONE_END);
    const preserveFullWidthBackground = inUserMessageZone || startsUserMessage;
    const nextLine = preserveFullWidthBackground
      ? line
      : trimTrailingSpacesBeforeAnsi(line);

    return {
      state: startsUserMessage || (inUserMessageZone && !endsUserMessage),
      value: nextLine,
    };
  });

const installCopyFriendlyOutputPatch = (): void => {
  const proto = TUI.prototype as unknown as PatchableTuiPrototype;
  if (proto[PATCH_MARKER]) return;

  const originalApplyLineResets = proto.applyLineResets;
  proto.applyLineResets = function patchedApplyLineResets(
    lines: string[],
  ): string[] {
    return originalApplyLineResets.call(
      this,
      trimCopyPaddingButKeepUserMessageBands(lines),
    );
  };

  proto[PATCH_MARKER] = true;
};

export default function copyFriendlyOutput(_pi: ExtensionAPI): void {
  // Pi's built-in TUI components pad many rows to the terminal width so background
  // bands render cleanly. That makes mouse selection copy a large amount of
  // invisible trailing whitespace. Trim only trailing padding at render time, while
  // preserving ANSI reset/control sequences. Keep user message bands full width so
  // submitted prompts remain visually prominent.
  installCopyFriendlyOutputPatch();
}
