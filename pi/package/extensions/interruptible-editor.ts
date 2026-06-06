import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, type EditorTheme, type TUI } from "@earendil-works/pi-tui";

const DOUBLE_CTRL_C_WINDOW_MS = 1000;

class InterruptibleEditor extends CustomEditor {
  private lastCtrlCTime = 0;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly ctx: ExtensionContext,
  ) {
    super(tui, theme, keybindings);
  }

  override handleInput(data: string): void {
    if (matchesKey(data, "ctrl+c")) {
      this.handleCtrlC();
      return;
    }

    super.handleInput(data);
  }

  private handleCtrlC(): void {
    const now = Date.now();
    const isDoubleCtrlC = now - this.lastCtrlCTime < DOUBLE_CTRL_C_WINDOW_MS;
    this.lastCtrlCTime = now;

    if (isDoubleCtrlC) {
      this.lastCtrlCTime = 0;
      this.ctx.shutdown();
      return;
    }

    if (!this.ctx.isIdle()) {
      this.ctx.abort();
      return;
    }

    if (this.getText().length > 0) {
      this.setText("");
    }
  }
}

export default function interruptibleEditor(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setEditorComponent((tui, theme, keybindings) => new InterruptibleEditor(tui, theme, keybindings, ctx));
  });
}
