import {
  generationOutputJsonSchema,
  generationOutputSchema,
  type GenerationOutput
} from "./schema";
import { createMockGeneration } from "./mock-generator";

const PROMPT_VERSION = "llm-app-poc-v1";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type GenerationResult = {
  output: GenerationOutput;
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

export function getPromptVersion() {
  return PROMPT_VERSION;
}

export async function generateFromRequirementMemo(
  inputText: string
): Promise<GenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5.5";

  if (!apiKey) {
    const output = generationOutputSchema.parse(createMockGeneration(inputText));
    return {
      output,
      promptVersion: PROMPT_VERSION,
      modelName: "mock-local"
    };
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
    promptVersion: PROMPT_VERSION,
    modelName
  };
}
