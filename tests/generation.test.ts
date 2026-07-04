import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { generateFromRequirementMemo } from "@/lib/generator";
import { createMockGeneration } from "@/lib/mock-generator";
import { generationOutputSchema, generateRequestSchema } from "@/lib/schema";

const sampleInput = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generation schema", () => {
  it("rejects empty input", () => {
    const result = generateRequestSchema.safeParse({ inputText: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts the mock output shape", () => {
    const output = createMockGeneration(sampleInput);
    expect(() => generationOutputSchema.parse(output)).not.toThrow();
    expect(output.jiraTasks.map((task) => task.type)).toContain("frontend");
    expect(output.jiraTasks.map((task) => task.type)).toContain("test");
  });
});

describe("generation service", () => {
  it("uses mock output when LLM_PROVIDER is mock", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await generateFromRequirementMemo(sampleInput);

    expect(result.provider).toBe("mock");
    expect(result.modelName).toBe("mock-local");
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();
  });

  it("returns a clear error when Gemini is selected without GEMINI_API_KEY", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      "LLM_PROVIDER=gemini の場合は GEMINI_API_KEY を .env.local に設定してください。"
    );
  });
});

describe("POST /api/generate", () => {
  it("returns 400 for empty input", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({ inputText: "" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "要件メモを入力してください。"
    });
  });
});
