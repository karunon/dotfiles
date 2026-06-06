import { complete, type AssistantMessage, type Message, type UserMessage } from "@earendil-works/pi-ai";
import {
  BorderedLoader,
  buildSessionContext,
  convertToLlm,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

interface BtwExchange {
  question: string;
  answer: string;
  timestamp: number;
}

interface BtwGeneration {
  exchange: BtwExchange;
  conversationMessages: Message[];
  userMessage: UserMessage;
  assistantMessage: AssistantMessage;
}

type OverlayAction = "dismiss" | "fork";

const MAX_BODY_LINES = 24;
const MAX_HISTORY_ITEMS = 5;
const MAX_HISTORY_ANSWER_PREVIEW_LINES = 3;

const BTW_SYSTEM_PROMPT = `You answer ephemeral /btw side questions for a coding-agent session.

Rules:
- Answer only from the conversation context you are given.
- You have no tool access. Do not claim to read files, run commands, browse, or inspect anything now.
- If the answer is not in the current context, say that clearly and mention what information is missing.
- Keep the answer concise and useful.
- Use the user's language.
- Do not continue the main coding task; answer only the side question.`;

function assistantText(message: AssistantMessage): string {
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (text) return text;
  if (message.errorMessage) return message.errorMessage;
  return "(no answer)";
}

function buildQuestionPrompt(question: string): string {
  return [`Side question: ${question}`, "", "Answer the side question using only the conversation context above."].join("\n");
}

function currentConversationMessages(ctx: ExtensionCommandContext): Message[] {
  const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
  return convertToLlm(sessionContext.messages);
}

async function generateBtwAnswer(ctx: ExtensionCommandContext, question: string, signal?: AbortSignal): Promise<BtwGeneration> {
  if (!ctx.model) throw new Error("No active model.");

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);

  const conversationMessages = currentConversationMessages(ctx);
  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: buildQuestionPrompt(question) }],
    timestamp: Date.now(),
  };

  const assistantMessage = await complete(
    ctx.model,
    {
      systemPrompt: BTW_SYSTEM_PROMPT,
      messages: [...conversationMessages, userMessage],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 2048,
      signal,
      sessionId: ctx.sessionManager.getSessionId(),
      cacheRetention: "short",
    },
  );

  if (assistantMessage.stopReason === "aborted") throw new Error("Side question cancelled.");
  if (assistantMessage.stopReason === "error") throw new Error(assistantMessage.errorMessage || "Side question failed.");

  const answer = assistantText(assistantMessage);
  return {
    exchange: { question, answer, timestamp: Date.now() },
    conversationMessages,
    userMessage,
    assistantMessage,
  };
}

function addWrapped(lines: string[], text: string, width: number, style?: (value: string) => string): void {
  const content = style ? style(text) : text;
  const wrapped = wrapTextWithAnsi(content, Math.max(1, width));
  lines.push(...(wrapped.length > 0 ? wrapped : [""]));
}

function exchangePreview(exchange: BtwExchange): string {
  const answerLines = exchange.answer.trim().split(/\r?\n/).filter(Boolean).slice(0, MAX_HISTORY_ANSWER_PREVIEW_LINES);
  const answer = answerLines.join(" / ");
  return answer.length > 180 ? `${answer.slice(0, 180)}…` : answer;
}

class BtwOverlay implements Component {
  private scroll = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private history: BtwExchange[];

  constructor(
    history: BtwExchange[],
    private readonly exchange: BtwExchange,
    private readonly theme: Theme,
    private readonly onDone: (action: OverlayAction) => void,
    private readonly onClearHistory: () => void,
  ) {
    this.history = [...history];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || matchesKey(data, Key.return) || matchesKey(data, Key.space)) {
      this.onDone("dismiss");
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.scroll = Math.max(0, this.scroll - 1);
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.scroll += 1;
      this.invalidate();
      return;
    }

    if (data === "x" || data === "X") {
      this.history = [];
      this.scroll = 0;
      this.onClearHistory();
      this.invalidate();
      return;
    }

    if (data === "f" || data === "F") {
      this.onDone("fork");
    }
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

    const usableWidth = Math.max(20, width);
    const innerWidth = Math.max(10, usableWidth - 4);
    const body = this.buildBody(innerWidth);
    const maxScroll = Math.max(0, body.length - MAX_BODY_LINES);
    this.scroll = Math.min(this.scroll, maxScroll);
    const visibleBody = body.slice(this.scroll, this.scroll + MAX_BODY_LINES);

    const title = " /btw ";
    const top = this.theme.fg("accent", `╭─${title}${"─".repeat(Math.max(0, usableWidth - title.length - 3))}╮`);
    const bottom = this.theme.fg("accent", `╰${"─".repeat(Math.max(0, usableWidth - 2))}╯`);
    const help = this.theme.fg(
      "dim",
      maxScroll > 0
        ? "↑↓ scroll • Enter/Esc/Space close • f fork • x clear history"
        : "Enter/Esc/Space close • f fork • x clear history",
    );

    const lines = [top];
    for (const line of visibleBody) {
      lines.push(`${this.theme.fg("accent", "│")} ${truncateToWidth(line, innerWidth, "…", true)} ${this.theme.fg("accent", "│")}`);
    }
    lines.push(`${this.theme.fg("accent", "│")} ${truncateToWidth(help, innerWidth, "…", true)} ${this.theme.fg("accent", "│")}`);
    lines.push(bottom);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private buildBody(width: number): string[] {
    const lines: string[] = [];
    const history = this.history.slice(-MAX_HISTORY_ITEMS);

    if (history.length > 0) {
      addWrapped(lines, "Earlier /btw", width, (text) => this.theme.fg("dim", this.theme.bold(text)));
      for (const item of history) {
        addWrapped(lines, `Q: ${item.question}`, width, (text) => this.theme.fg("dim", text));
        addWrapped(lines, `A: ${exchangePreview(item) || "(no answer)"}`, width, (text) => this.theme.fg("dim", text));
      }
      lines.push(this.theme.fg("dim", ""));
    }

    addWrapped(lines, `Q: ${this.exchange.question}`, width, (text) => this.theme.fg("accent", this.theme.bold(text)));
    lines.push("");
    addWrapped(lines, "Answer", width, (text) => this.theme.fg("accent", this.theme.bold(text)));
    for (const paragraph of this.exchange.answer.trim().split(/\n{2,}/)) {
      for (const line of paragraph.split(/\r?\n/)) {
        addWrapped(lines, line, width);
      }
      lines.push("");
    }
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }
}

async function showAnswerOverlay(
  ctx: ExtensionCommandContext,
  generation: BtwGeneration,
  history: BtwExchange[],
  clearHistory: () => void,
): Promise<OverlayAction> {
  return (
    (await ctx.ui.custom<OverlayAction>(
      (tui, theme, _keybindings, done) => {
        const overlay = new BtwOverlay(history, generation.exchange, theme, done, clearHistory);
        return {
          render: (width: number) => overlay.render(width),
          invalidate: () => overlay.invalidate(),
          handleInput: (data: string) => {
            overlay.handleInput(data);
            tui.requestRender();
          },
        };
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "80%",
          minWidth: 50,
          maxHeight: "80%",
          margin: 1,
        },
      },
    )) ?? "dismiss"
  );
}

async function forkBtwConversation(ctx: ExtensionCommandContext, generation: BtwGeneration): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify("Waiting for the current turn to finish before forking /btw...", "info");
    await ctx.waitForIdle();
  }

  const parentSession = ctx.sessionManager.getSessionFile();
  const titleQuestion = generation.exchange.question.replace(/\s+/g, " ").trim();
  const sessionName = `btw: ${titleQuestion.slice(0, 60)}`;

  const result = await ctx.newSession({
    parentSession,
    setup: async (sessionManager) => {
      for (const message of generation.conversationMessages) {
        sessionManager.appendMessage(message);
      }
      sessionManager.appendMessage(generation.userMessage);
      sessionManager.appendMessage(generation.assistantMessage);
      sessionManager.appendSessionInfo(sessionName);
    },
    withSession: async (newCtx) => {
      newCtx.ui.notify("Forked /btw into a new session. Continue from here with full tool access.", "info");
    },
  });

  if (result.cancelled) {
    ctx.ui.notify("/btw fork cancelled.", "warning");
  }
}

async function askQuestionText(ctx: ExtensionCommandContext, args: string): Promise<string | undefined> {
  const question = args.trim();
  if (question) return question;
  if (!ctx.hasUI) return undefined;
  return ctx.ui.input("/btw side question", "Ask a quick question about this session...");
}

export default function btw(pi: ExtensionAPI): void {
  let history: BtwExchange[] = [];

  pi.registerCommand("btw", {
    description: "Ask an ephemeral side question without adding it to conversation history",
    handler: async (args, ctx) => {
      const question = await askQuestionText(ctx, args);
      if (!question?.trim()) {
        ctx.ui.notify("Usage: /btw <question>", "warning");
        return;
      }

      if (!ctx.hasUI) {
        const generation = await generateBtwAnswer(ctx, question.trim());
        console.log(generation.exchange.answer);
        return;
      }

      let failure: Error | undefined;
      const generation = await ctx.ui.custom<BtwGeneration | null>(
        (tui, theme, _keybindings, done) => {
          const loader = new BorderedLoader(tui, theme, "Answering /btw side question...");
          loader.onAbort = () => done(null);
          generateBtwAnswer(ctx, question.trim(), loader.signal)
            .then((result) => {
              if (!loader.signal.aborted) done(result);
            })
            .catch((error) => {
              failure = error instanceof Error ? error : new Error(String(error));
              if (!loader.signal.aborted) done(null);
            });
          return loader;
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "60%",
            minWidth: 44,
            margin: 1,
          },
        },
      );

      if (!generation) {
        ctx.ui.notify(failure ? `/btw failed: ${failure.message}` : "/btw cancelled.", failure ? "error" : "info");
        return;
      }

      const action = await showAnswerOverlay(ctx, generation, history, () => {
        history = [];
      });
      history.push(generation.exchange);

      if (action === "fork") {
        await forkBtwConversation(ctx, generation);
      }
    },
  });
}
