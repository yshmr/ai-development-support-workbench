import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/generate/route";
import { generateFromRequirementMemo } from "@/lib/generator";
import { createMockGeneration } from "@/lib/mock-generator";
import {
  generationHistorySchema,
  generationOutputSchema,
  generateRequestSchema
} from "@/lib/schema";

const sampleInput = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  it("accepts generation history without latency metadata", () => {
    const output = createMockGeneration(sampleInput);
    const result = generationHistorySchema.safeParse([
      {
        id: "old-record",
        inputText: sampleInput,
        output,
        provider: "mock",
        promptVersion: "llm-app-poc-v1",
        modelName: "mock-local",
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.success).toBe(true);
  });
});

describe("generation service", () => {
  it("uses mock output when LLM_PROVIDER is mock", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await generateFromRequirementMemo(sampleInput);

    expect(result.provider).toBe("mock");
    expect(result.modelName).toBe("mock-local");
    expect(result.providerLatencyMs).toEqual(expect.any(Number));
    expect(result.providerLatencyMs).toBeGreaterThanOrEqual(0);
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();
  });

  it("returns a clear error when Gemini is selected without GEMINI_API_KEY", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      "LLM_PROVIDER=gemini の場合は GEMINI_API_KEY を .env.local に設定してください。"
    );
  });

  it("returns a clear error when Anthropic is selected without ANTHROPIC_API_KEY", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      "LLM_PROVIDER=anthropic の場合は ANTHROPIC_API_KEY を .env.local に設定してください。"
    );
  });

  it("uses OpenAI when selected even if Gemini settings are also present", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_MODEL", "test-openai-model");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GEMINI_MODEL", "test-gemini-model");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify(createMockGeneration(sampleInput)),
        usage: {
          input_tokens: 11,
          output_tokens: 22,
          total_tokens: 33
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromRequirementMemo(sampleInput);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];

    expect(result.provider).toBe("openai");
    expect(result.modelName).toBe("test-openai-model");
    expect(requestUrl).toBe("https://api.openai.com/v1/responses");
    expect(requestInit.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-openai-key"
    });
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      model: "test-openai-model"
    });
    expect(String(requestInit.body)).not.toContain("test-gemini-key");
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(22);
    expect(result.totalTokens).toBe(33);
  });

  it("parses Gemini response.text", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        text: JSON.stringify(createMockGeneration(sampleInput)),
        usageMetadata: {
          promptTokenCount: 13,
          candidatesTokenCount: 21,
          totalTokenCount: 34
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromRequirementMemo(sampleInput);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];

    expect(requestUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(String(requestUrl)).not.toContain("test-key");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": "test-key"
      }
    });
    expect(String(requestInit?.body)).not.toContain("test-key");
    expect(result.provider).toBe("gemini");
    expect(result.modelName).toBe("gemini-2.5-flash");
    expect(result.inputTokens).toBe(13);
    expect(result.outputTokens).toBe(21);
    expect(result.totalTokens).toBe(34);
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();
  });

  it("uses Anthropic when selected and parses Claude text content blocks", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("ANTHROPIC_MODEL", "test-anthropic-model");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(createMockGeneration(sampleInput))
          }
        ],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFromRequirementMemo(sampleInput);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    const body = JSON.parse(String(requestInit.body));

    expect(result.provider).toBe("anthropic");
    expect(result.modelName).toBe("test-anthropic-model");
    expect(requestUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(requestInit.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-api-key": "test-anthropic-key",
      "anthropic-version": "2023-06-01"
    });
    expect(body).toMatchObject({
      model: "test-anthropic-model",
      output_config: {
        format: {
          type: "json_schema"
        }
      }
    });
    expect(String(requestInit.body)).not.toContain("test-anthropic-key");
    expect(String(requestInit.body)).not.toContain("test-openai-key");
    expect(String(requestInit.body)).not.toContain("test-gemini-key");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.totalTokens).toBe(30);
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();
  });

  it("logs safe Anthropic response metadata when DEBUG_LLM_RESPONSE is enabled", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("DEBUG_LLM_RESPONSE", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify(createMockGeneration(sampleInput))
            }
          ],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 12,
            output_tokens: 34
          }
        })
      }))
    );

    await generateFromRequirementMemo(sampleInput);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[llm-debug] Anthropic response metadata",
      expect.objectContaining({
        provider: "anthropic",
        modelName: "claude-haiku-4-5-20251001",
        httpStatus: 200,
        stopReason: "end_turn",
        contentBlockTypes: ["text"],
        usage: {
          inputTokens: 12,
          outputTokens: 34
        }
      })
    );

    const loggedResponse = consoleSpy.mock.calls.find(
      ([label]) => label === "[llm-debug] Anthropic response metadata"
    )?.[1];

    expect(JSON.stringify(loggedResponse)).not.toContain("test-anthropic-key");
    expect(JSON.stringify(loggedResponse)).not.toContain(sampleInput);
    consoleSpy.mockRestore();
  });

  it("returns a clear Anthropic error when content is empty", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [],
          stop_reason: "end_turn"
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /Anthropic response content was empty/
    );
  });

  it("returns a clear Anthropic error when text blocks are missing", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "tool_use"
            }
          ],
          stop_reason: "tool_use"
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /Anthropic response did not include text content/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /contentBlockTypes=tool_use/
    );
  });

  it("returns a clear Anthropic error when JSON parsing fails", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "text",
              text: "{invalid json"
            }
          ]
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /Anthropic response JSON parse failed/
    );
  });

  it("returns a clear Anthropic error when Zod validation fails", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "missing required arrays"
              })
            }
          ]
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /Anthropic response schema validation failed/
    );
  });

  it("returns a clear Anthropic HTTP error with safe metadata", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({
          type: "error",
          error: {
            type: "rate_limit_error",
            message: "Too many requests"
          }
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /status=429/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /category=rate limit/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /errorType=rate_limit_error/
    );
  });

  it("logs safe Gemini request metadata when DEBUG_LLM_RESPONSE is enabled", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("DEBUG_LLM_RESPONSE", "1");
    vi.stubEnv("HTTPS_PROXY", "http://proxy.example");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          text: JSON.stringify(createMockGeneration(sampleInput))
        })
      }))
    );

    await generateFromRequirementMemo(sampleInput);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[llm-debug] Gemini request metadata",
      expect.objectContaining({
        provider: "gemini",
        modelName: "gemini-2.5-flash",
        urlOrigin: "https://generativelanguage.googleapis.com",
        urlPathname:
          "/v1beta/models/gemini-2.5-flash:generateContent",
        method: "POST",
        hasHttpsProxy: true
      })
    );

    const loggedRequest = consoleSpy.mock.calls.find(
      ([label]) => label === "[llm-debug] Gemini request metadata"
    )?.[1];

    expect(JSON.stringify(loggedRequest)).not.toContain("test-key");
    expect(JSON.stringify(loggedRequest)).not.toContain(sampleInput);
    consoleSpy.mockRestore();
  });

  it("parses Gemini candidates content parts text", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(createMockGeneration(sampleInput))
                  }
                ]
              },
              finishReason: "STOP"
            }
          ]
        })
      }))
    );

    const result = await generateFromRequirementMemo(sampleInput);

    expect(result.provider).toBe("gemini");
    expect(() => generationOutputSchema.parse(result.output)).not.toThrow();
  });

  it("returns a clear Gemini error when candidates are empty", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [],
          promptFeedback: {
            blockReason: "SAFETY"
          }
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /candidatesLength=0/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /promptFeedback=.*SAFETY/
    );
  });

  it("returns a clear Gemini error when parts contain no text", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "application/octet-stream"
                    }
                  }
                ]
              },
              finishReason: "SAFETY",
              safetyRatings: [
                {
                  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                  probability: "LOW"
                }
              ]
            }
          ]
        })
      }))
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /finishReason=SAFETY/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /partTypes=inlineData/
    );
  });

  it("returns safe Gemini fetch diagnostics when fetch fails", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: {
            code: "ENOTFOUND",
            errno: -3008,
            syscall: "getaddrinfo",
            hostname: "generativelanguage.googleapis.com"
          }
        });
      })
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /Gemini API fetch failed/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /provider=gemini/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /cause.code=ENOTFOUND/
    );
    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /cause.hostname=generativelanguage.googleapis.com/
    );
  });

  it("logs safe Gemini fetch diagnostics only when DEBUG_LLM_RESPONSE is enabled", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("DEBUG_LLM_RESPONSE", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: {
            code: "ECONNRESET",
            errno: -4077,
            syscall: "read",
            hostname: "generativelanguage.googleapis.com"
          }
        });
      })
    );

    await expect(generateFromRequirementMemo(sampleInput)).rejects.toThrow(
      /cause.code=ECONNRESET/
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "[llm-debug] Gemini fetch error",
      expect.objectContaining({
        provider: "gemini",
        modelName: "gemini-2.5-flash",
        causeCode: "ECONNRESET",
        causeHostname: "generativelanguage.googleapis.com"
      })
    );

    consoleSpy.mockRestore();
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

  it("returns latency metadata for successful generation", async () => {
    const dataPath = path.join(process.cwd(), "data", "generations.json");
    const hadDataFile = existsSync(dataPath);
    const originalData = hadDataFile ? readFileSync(dataPath, "utf8") : "[]\n";
    vi.stubEnv("LLM_PROVIDER", "mock");

    try {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.provider).toBe("mock");
      expect(body.modelName).toBe("mock-local");
      expect(body.providerLatencyMs).toEqual(expect.any(Number));
      expect(body.providerLatencyMs).toBeGreaterThanOrEqual(0);
      expect(body.serverProcessingMs).toEqual(expect.any(Number));
      expect(body.serverProcessingMs).toBeGreaterThanOrEqual(0);
    } finally {
      writeFileSync(dataPath, originalData, "utf8");
    }
  });
});

describe("generation UI", () => {
  it("contains client elapsed latency display wiring", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");

    expect(pageSource).toContain("clientElapsedMs");
    expect(pageSource).toContain("performance.now()");
    expect(pageSource).toContain("Client elapsed");
  });
});
