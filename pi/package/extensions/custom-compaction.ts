import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

const SYSTEM_PROMPT = `You are a precise coding-session summarizer for pi.
Create a compact but complete checkpoint summary that lets another agent continue work in this repository.
Preserve exact file paths, commands, errors, decisions, and unresolved tasks.`;

function getFileLists(fileOps: unknown): { readFiles: string[]; modifiedFiles: string[] } {
  const ops = fileOps as { read?: Set<string>; edited?: Set<string> } | undefined;
  return {
    readFiles: ops?.read ? Array.from(ops.read).sort() : [],
    modifiedFiles: ops?.edited ? Array.from(ops.edited).sort() : [],
  };
}

function fileOpsSection(fileOps: unknown): string {
  const { readFiles, modifiedFiles } = getFileLists(fileOps);
  return [
    "",
    "<read-files>",
    ...readFiles,
    "</read-files>",
    "",
    "<modified-files>",
    ...modifiedFiles,
    "</modified-files>",
  ].join("\n");
}

export default function customCompaction(pi: ExtensionAPI): void {
  pi.on("session_before_compact", async (event, ctx) => {
    if (!ctx.model) return;

    const { preparation, customInstructions, signal } = event;
    const {
      messagesToSummarize,
      turnPrefixMessages,
      previousSummary,
      firstKeptEntryId,
      tokensBefore,
      fileOps,
      settings,
    } = preparation;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) return;

    const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
    if (allMessages.length === 0 && previousSummary) return;

    const conversationText = serializeConversation(convertToLlm(allMessages));
    const previous = previousSummary ? `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n` : "";
    const focus = customInstructions ? `\n\nAdditional user instructions for this compaction:\n${customInstructions}` : "";

    const prompt = `${previous}<conversation>\n${conversationText}\n</conversation>\n\nCreate an updated structured summary using this exact shape:\n\n## Goal\n- ...\n\n## Constraints & Preferences\n- ...\n\n## Progress\n### Done\n- [x] ...\n\n### In Progress\n- [ ] ...\n\n### Blocked\n- ...\n\n## Key Decisions\n- **Decision**: rationale\n\n## Files & Commands\n- Important files, commands run, validation results, and errors\n\n## Next Steps\n1. ...\n\n## Critical Context\n- ...${focus}`;

    try {
      const response = await complete(
        ctx.model,
        {
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          maxTokens: Math.min(8192, Math.max(2048, Math.floor(settings.reserveTokens * 0.7))),
          signal,
        },
      );

      if (response.stopReason === "aborted" || response.stopReason === "error") return;

      const summary = response.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();

      if (!summary) return;

      const { readFiles, modifiedFiles } = getFileLists(fileOps);
      const summaryWithFiles = `${summary}\n${fileOpsSection(fileOps)}`;
      return {
        compaction: {
          summary: summaryWithFiles,
          firstKeptEntryId,
          tokensBefore,
          details: {
            from: "karunon-pi-custom-compaction",
            tokensBefore,
            readFiles,
            modifiedFiles,
          },
        },
      };
    } catch (error) {
      if (!signal.aborted && ctx.hasUI) {
        ctx.ui.notify(`Custom compaction failed; falling back to default: ${error instanceof Error ? error.message : error}`, "warning");
      }
      return;
    }
  });
}
