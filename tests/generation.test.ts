import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { generateFromRequirementMemo } from "@/lib/generator";
import { createMockGeneration } from "@/lib/mock-generator";
import { generationOutputSchema, generateRequestSchema } from "@/lib/schema";

const sampleInput = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

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
  it("uses mock output when OPENAI_API_KEY is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await generateFromRequirementMemo(sampleInput);

    expect(result.modelName).toBe("mock-local");
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();

    vi.unstubAllEnvs();
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
