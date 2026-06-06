import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Message } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";

const SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and the user's goal for a new thread, generate a focused prompt that:

1. Summarizes relevant context, decisions, constraints, and key findings
2. Lists relevant files discussed or modified
3. Clearly states the next task based on the user's goal
4. Is self-contained so the new thread can proceed without the old conversation

Return only the prompt to start the new thread. Do not include preamble.`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") return entry.message;
  if (entry.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  if (entry.type === "branch_summary") {
    return {
      role: "branchSummary",
      summary: entry.summary,
      fromId: entry.fromId,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

const isAgentMessage = (
  message: AgentMessage | undefined,
): message is AgentMessage => message !== undefined;

const messagesFromEntries = (entries: SessionEntry[]): AgentMessage[] =>
  entries.map(entryToMessage).filter(isAgentMessage);

const findLastCompactionIndex = (branch: SessionEntry[]): number =>
  branch.reduce(
    (lastIndex, entry, index) =>
      entry.type === "compaction" ? index : lastIndex,
    -1,
  );

function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
  const compactionIndex = findLastCompactionIndex(branch);
  if (compactionIndex < 0) return messagesFromEntries(branch);

  const compaction = branch[compactionIndex];
  const firstKeptIndex =
    compaction.type === "compaction"
      ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId)
      : -1;
  return messagesFromEntries([
    compaction,
    ...(firstKeptIndex >= 0
      ? branch.slice(firstKeptIndex, compactionIndex)
      : []),
    ...branch.slice(compactionIndex + 1),
  ]);
}

export default function handoff(pi: ExtensionAPI): void {
  pi.registerCommand("handoff", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/handoff requires interactive mode", "error");
        return;
      }
      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify("Usage: /handoff <goal for new session>", "error");
        return;
      }

      const messages = getHandoffMessages(ctx.sessionManager.getBranch());
      if (messages.length === 0) {
        ctx.ui.notify("No conversation context to hand off", "warning");
        return;
      }

      const conversationText = serializeConversation(convertToLlm(messages));
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      const generated = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => {
          const loader = new BorderedLoader(
            tui,
            theme,
            "Generating handoff prompt...",
          );
          loader.onAbort = () => done(null);

          const run = async () => {
            const auth = await ctx.modelRegistry.getApiKeyAndHeaders(
              ctx.model!,
            );
            if (!auth.ok || !auth.apiKey)
              throw new Error(
                auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error,
              );

            const userMessage: Message = {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `## Conversation History\n\n${conversationText}\n\n## User's Goal for New Session\n\n${goal}`,
                },
              ],
              timestamp: Date.now(),
            };

            const response = await complete(
              ctx.model!,
              { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
              {
                apiKey: auth.apiKey,
                headers: auth.headers,
                maxTokens: 8192,
                signal: loader.signal,
              },
            );

            if (response.stopReason === "aborted") return null;
            return response.content
              .filter(
                (part): part is { type: "text"; text: string } =>
                  part.type === "text",
              )
              .map((part) => part.text)
              .join("\n");
          };

          run()
            .then(done)
            .catch((error) => {
              console.error("Handoff generation failed:", error);
              done(null);
            });

          return loader;
        },
      );

      if (generated === null) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      const edited = await ctx.ui.editor("Edit handoff prompt", generated);
      if (edited === undefined) {
        ctx.ui.notify("Handoff cancelled", "info");
        return;
      }

      const result = await ctx.newSession({
        parentSession: currentSessionFile,
        withSession: async (replacementCtx) => {
          replacementCtx.ui.setEditorText(edited);
          replacementCtx.ui.notify("Handoff ready. Submit when ready.", "info");
        },
      });

      if (result.cancelled) ctx.ui.notify("New session cancelled", "info");
    },
  });
}
