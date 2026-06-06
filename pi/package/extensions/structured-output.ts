import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface SchemaState {
  schema?: unknown;
  instructions?: string;
}

function parseJsonMaybe(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function validateAgainstSimpleJsonSchema(schema: any, value: any, path = "$", errors: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return errors;

  if (schema.type) {
    const type = schema.type;
    const ok =
      type === "array"
        ? Array.isArray(value)
        : type === "object"
          ? value !== null && typeof value === "object" && !Array.isArray(value)
          : type === "integer"
            ? Number.isInteger(value)
            : typeof value === type;
    if (!ok) errors.push(`${path}: expected ${type}, got ${Array.isArray(value) ? "array" : typeof value}`);
  }

  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.map(String).join(", ")}`);
  }

  if (schema.type === "object" && schema.properties && value && typeof value === "object") {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}.${required}: required property missing`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value) validateAgainstSimpleJsonSchema(childSchema, value[key], `${path}.${key}`, errors);
    }
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => validateAgainstSimpleJsonSchema(schema.items, item, `${path}[${index}]`, errors));
  }

  return errors;
}

function setStatus(ctx: ExtensionContext, schema: unknown | undefined): void {
  ctx.ui.setStatus("schema", schema ? ctx.ui.theme.fg("accent", "schema:on") : undefined);
}

export default function structuredOutput(pi: ExtensionAPI): void {
  let activeSchema: unknown | undefined;
  let activeInstructions: string | undefined;

  function persist(): void {
    pi.appendEntry<SchemaState>("structured-schema", { schema: activeSchema, instructions: activeInstructions });
  }

  pi.registerTool({
    name: "structured_output",
    label: "Structured Output",
    description: "Return final structured JSON data, optionally validated against a JSON Schema-like object.",
    promptSnippet: "Emit final structured JSON output through structured_output.",
    promptGuidelines: [
      "Use structured_output when the user asks for machine-readable JSON or when an active /schema is configured.",
      "Call structured_output as the final step when final=true so the agent does not add extra prose after the JSON.",
    ],
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short label for the structured result" })),
      schema: Type.Optional(Type.Any({ description: "JSON Schema-like object used for validation" })),
      data: Type.Any({ description: "Structured JSON data to return" }),
      final: Type.Optional(Type.Boolean({ description: "If true, terminate after this tool result. Default true." })),
    }),
    async execute(_toolCallId, params) {
      const schema = params.schema ?? activeSchema;
      const errors = validateAgainstSimpleJsonSchema(schema, params.data);
      const text = JSON.stringify(params.data, null, 2);
      return {
        content: [
          {
            type: "text",
            text: errors.length > 0 ? `Structured output validation warnings:\n${errors.join("\n")}\n\n${text}` : text,
          },
        ],
        details: { title: params.title, schema, data: params.data, validationErrors: errors },
        terminate: params.final !== false,
      };
    },
  });

  pi.registerCommand("schema", {
    description: "Set an active structured output schema (usage: /schema {json schema}; no args opens editor)",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const raw = args.trim() || (await ctx.ui.editor("JSON schema for structured output", JSON.stringify(activeSchema ?? {}, null, 2)));
      if (raw === undefined) return;
      const parsed = parseJsonMaybe(raw);
      if (!parsed) {
        ctx.ui.notify("Schema must be valid JSON.", "error");
        return;
      }
      activeSchema = parsed;
      activeInstructions = undefined;
      setStatus(ctx, activeSchema);
      persist();
      ctx.ui.notify("Structured output schema activated.", "info");
    },
  });

  pi.registerCommand("schema-clear", {
    description: "Clear active structured output schema",
    handler: async (_args, ctx) => {
      activeSchema = undefined;
      activeInstructions = undefined;
      setStatus(ctx, undefined);
      persist();
      ctx.ui.notify("Structured output schema cleared.", "info");
    },
  });

  pi.registerCommand("schema-instructions", {
    description: "Set free-form structured output instructions",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const text = args.trim() || (await ctx.ui.editor("Structured output instructions", activeInstructions ?? ""));
      if (text === undefined) return;
      activeInstructions = text.trim() || undefined;
      persist();
      ctx.ui.notify(activeInstructions ? "Structured output instructions activated." : "Structured output instructions cleared.", "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!activeSchema && !activeInstructions) return;
    const schemaText = activeSchema ? `Active JSON schema:\n${JSON.stringify(activeSchema, null, 2)}` : undefined;
    const text = [
      "[ACTIVE STRUCTURED OUTPUT MODE]",
      "When producing the final answer, call the structured_output tool with JSON data that matches the active schema/instructions. Do not add prose after the final structured_output call.",
      schemaText,
      activeInstructions ? `Additional instructions:\n${activeInstructions}` : undefined,
    ]
      .filter(Boolean)
      .join("\n\n");
    return { systemPrompt: `${event.systemPrompt}\n\n${text}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    const saved = ctx.sessionManager
      .getEntries()
      .filter((entry: { type: string; customType?: string }) => entry.type === "custom" && entry.customType === "structured-schema")
      .pop() as { data?: SchemaState } | undefined;
    activeSchema = saved?.data?.schema;
    activeInstructions = saved?.data?.instructions;
    setStatus(ctx, activeSchema);
  });
}
