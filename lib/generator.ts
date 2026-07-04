import {
  generationOutputJsonSchema,
  generationOutputSchema,
  llmProviderSchema,
  type GenerationOutput,
  type LlmProvider
} from "./schema";
import { createMockGeneration } from "./mock-generator";

const PROMPT_VERSION = "llm-app-poc-v1";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

type GenerationResult = {
  output: GenerationOutput;
  provider: LlmProvider;
  promptVersion: string;
  modelName: string;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type GeminiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

const systemPrompt = [
  "あなたは開発支援アプリの仕様整理アシスタントです。",
  "ユーザーの要件メモから、実務で使える仕様整理、受け入れ条件、Jira風チケット、実装方針、レビュー観点、リスクを日本語で生成してください。",
  "曖昧な点は risks に確認事項として含め、断定しすぎないでください。",
  "Jiraチケットの type は frontend, backend, test, documentation のいずれかだけを使ってください。"
].join("\n");

function extractOpenAiText(data: OpenAiResponse): string {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)?.text;

  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  return text;
}

function extractGeminiText(data: GeminiResponse): string {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)?.text;

  if (!text) {
    throw new Error("Gemini response did not include output text.");
  }

  return text;
}

function resolveProvider(): LlmProvider {
  const rawProvider = process.env.LLM_PROVIDER ?? "mock";
  const parsedProvider = llmProviderSchema.safeParse(rawProvider);

  if (!parsedProvider.success) {
    throw new Error(
      "LLM_PROVIDER は mock、openai、gemini のいずれかを指定してください。"
    );
  }

  return parsedProvider.data;
}

export function getPromptVersion() {
  return PROMPT_VERSION;
}

async function generateWithMock(inputText: string): Promise<GenerationResult> {
  const output = generationOutputSchema.parse(createMockGeneration(inputText));

  return {
    output,
    provider: "mock",
    promptVersion: PROMPT_VERSION,
    modelName: "mock-local"
  };
}

async function generateWithOpenAi(inputText: string): Promise<GenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5.5";

  if (!apiKey) {
    throw new Error(
      "LLM_PROVIDER=openai の場合は OPENAI_API_KEY を .env.local に設定してください。"
    );
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: inputText
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "requirement_generation",
          strict: true,
          schema: generationOutputJsonSchema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API request failed: ${response.status} ${detail}`);
  }

  const data = (await response.json()) as OpenAiResponse;
  const rawText = extractOpenAiText(data);
  const parsed = JSON.parse(rawText);

  return {
    output: generationOutputSchema.parse(parsed),
    provider: "openai",
    promptVersion: PROMPT_VERSION,
    modelName
  };
}

async function generateWithGemini(inputText: string): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error(
      "LLM_PROVIDER=gemini の場合は GEMINI_API_KEY を .env.local に設定してください。"
    );
  }

  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model: modelName,
      input: `${systemPrompt}\n\n要件メモ:\n${inputText}`,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: generationOutputJsonSchema
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${detail}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const rawText = extractGeminiText(data);
  const parsed = JSON.parse(rawText);

  return {
    output: generationOutputSchema.parse(parsed),
    provider: "gemini",
    promptVersion: PROMPT_VERSION,
    modelName
  };
}

export async function generateFromRequirementMemo(
  inputText: string
): Promise<GenerationResult> {
  const provider = resolveProvider();

  if (provider === "openai") {
    return generateWithOpenAi(inputText);
  }

  if (provider === "gemini") {
    return generateWithGemini(inputText);
  }

  return generateWithMock(inputText);
}
