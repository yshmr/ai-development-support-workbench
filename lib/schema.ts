import { z } from "zod";

export const jiraTaskTypeSchema = z.enum([
  "frontend",
  "backend",
  "test",
  "documentation"
]);

export const jiraTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: jiraTaskTypeSchema
});

export const llmProviderSchema = z.enum(["mock", "openai", "gemini"]);

export const generationOutputSchema = z.object({
  summary: z.string().min(1),
  spec: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  jiraTasks: z.array(jiraTaskSchema).min(1),
  implementationPlan: z.array(z.string().min(1)).min(1),
  reviewPoints: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1)
});

export const generationRecordSchema = z.object({
  id: z.string().min(1),
  inputText: z.string().min(1),
  output: generationOutputSchema,
  provider: llmProviderSchema.default("mock"),
  promptVersion: z.string().min(1),
  modelName: z.string().min(1),
  createdAt: z.string().datetime()
});

export const generateRequestSchema = z.object({
  inputText: z.string().trim().min(1, "要件メモを入力してください。")
});

export const generationHistorySchema = z.array(generationRecordSchema);

export type JiraTaskType = z.infer<typeof jiraTaskTypeSchema>;
export type JiraTask = z.infer<typeof jiraTaskSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
export type GenerationRecord = z.infer<typeof generationRecordSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const generationOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "spec",
    "acceptanceCriteria",
    "jiraTasks",
    "implementationPlan",
    "reviewPoints",
    "risks"
  ],
  properties: {
    summary: {
      type: "string",
      description: "要件メモの要約"
    },
    spec: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    acceptanceCriteria: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    jiraTasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "type"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["frontend", "backend", "test", "documentation"]
          }
        }
      }
    },
    implementationPlan: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    reviewPoints: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    risks: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    }
  }
} as const;
