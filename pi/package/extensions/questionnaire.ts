import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

interface NormalizedQuestion {
  id: string;
  label: string;
  prompt: string;
  options: QuestionOption[];
  allowOther: boolean;
}

interface Answer {
  id: string;
  label: string;
  value: string;
  wasCustom: boolean;
}

const QuestionOptionSchema = Type.Object({
  value: Type.String({ description: "Value returned to the agent when selected" }),
  label: Type.String({ description: "Human-readable option label" }),
  description: Type.Optional(Type.String({ description: "Optional explanation shown to the user" })),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: "Stable answer identifier, e.g. scope or priority" }),
  label: Type.Optional(Type.String({ description: "Short label shown in summaries" })),
  prompt: Type.String({ description: "Question to ask the user" }),
  options: Type.Optional(Type.Array(QuestionOptionSchema, { description: "Selectable options" })),
  allowOther: Type.Optional(Type.Boolean({ description: "Allow free-form answer. Default: true" })),
});

export default function questionnaire(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "questionnaire",
    label: "Questionnaire",
    description:
      "Ask the user one or more clarifying questions. Use before implementation when requirements, scope, or trade-offs are ambiguous.",
    promptSnippet: "Ask the user structured clarifying questions before proceeding.",
    promptGuidelines: [
      "Use questionnaire when the requirements are ambiguous and a short user decision would prevent incorrect work.",
    ],
    parameters: Type.Object({
      questions: Type.Array(QuestionSchema, { description: "Questions to ask sequentially" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Cannot ask questionnaire: UI is not available." }],
          details: { cancelled: true, answers: [] },
        };
      }

      const questions: NormalizedQuestion[] = params.questions.map((question, index) => ({
        id: question.id,
        label: question.label ?? `Q${index + 1}`,
        prompt: question.prompt,
        options: question.options ?? [],
        allowOther: question.allowOther !== false,
      }));

      const answers: Answer[] = [];

      for (const question of questions) {
        const optionLabels = question.options.map((option, index) => {
          const description = option.description ? ` — ${option.description}` : "";
          return `${index + 1}. ${option.label}${description}`;
        });
        const otherLabel = "Type a custom answer";
        const choices = question.allowOther ? [...optionLabels, otherLabel] : optionLabels;

        let selected: string | undefined;
        if (choices.length > 0) {
          selected = await ctx.ui.select(question.prompt, choices);
          if (!selected) {
            return {
              content: [{ type: "text", text: "User cancelled the questionnaire." }],
              details: { cancelled: true, answers },
            };
          }
        }

        if (!selected || selected === otherLabel) {
          const typed = await ctx.ui.input(question.prompt, "Type your answer");
          if (typed === undefined) {
            return {
              content: [{ type: "text", text: "User cancelled the questionnaire." }],
              details: { cancelled: true, answers },
            };
          }
          const value = typed.trim() || "(no response)";
          answers.push({ id: question.id, label: value, value, wasCustom: true });
          continue;
        }

        const selectedIndex = optionLabels.indexOf(selected);
        const option = question.options[selectedIndex];
        answers.push({
          id: question.id,
          label: option?.label ?? selected,
          value: option?.value ?? selected,
          wasCustom: false,
        });
      }

      const text = answers
        .map((answer) => `${answer.id}: ${answer.wasCustom ? "user wrote" : "user selected"}: ${answer.label}`)
        .join("\n");

      return {
        content: [{ type: "text", text }],
        details: { cancelled: false, questions, answers },
      };
    },
  });
}
