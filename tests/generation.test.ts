import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/generate/route";
import { generateFromRequirementMemo } from "@/lib/generator";
import { createMockGeneration } from "@/lib/mock-generator";
import * as ragRetriever from "@/lib/rag/retriever";
import type { RetrievedChunk } from "@/lib/rag/schema";
import {
  generationHistorySchema,
  generationOutputSchema,
  generateRequestSchema,
  ragContextPolicySchema,
  ragMetadataSchema
} from "@/lib/schema";

const sampleInput = `ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function getDataPath() {
  return path.join(process.cwd(), "data", "generations.json");
}

function getAgentRunsPath() {
  return path.join(process.cwd(), "data", "agent-runs.json");
}

async function withPreservedGenerationData<T>(callback: () => Promise<T>) {
  const dataPath = getDataPath();
  const hadDataFile = existsSync(dataPath);
  const originalData = hadDataFile ? readFileSync(dataPath, "utf8") : "[]\n";

  try {
    return await callback();
  } finally {
    writeFileSync(dataPath, originalData, "utf8");
  }
}

async function withPreservedAgentRunData<T>(callback: () => Promise<T>) {
  const dataPath = getAgentRunsPath();
  const hadDataFile = existsSync(dataPath);
  const originalData = hadDataFile ? readFileSync(dataPath, "utf8") : "[]\n";

  try {
    return await callback();
  } finally {
    writeFileSync(dataPath, originalData, "utf8");
  }
}

function sampleRetrievedChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    rank: 1,
    score: 0.91,
    chunkId: "profile-image-spec:heading-aware-v1:0001",
    documentId: "profile-image-spec",
    sourcePath: "data/rag/knowledge/profile-image-spec.md",
    documentTitle: "プロフィール画像仕様",
    headingPath: ["プロフィール画像", "アップロード制約"],
    content: "プロフィール画像は5MBまで、JPG/PNGのみ許可する。",
    ...overrides
  };
}

function sampleRetrievedChunksForDocumentCap() {
  return [
    sampleRetrievedChunk({
      rank: 1,
      score: 0.91,
      chunkId: "profile-1",
      documentId: "profile-image-spec",
      content: "SELECTED profile acceptance conditions"
    }),
    sampleRetrievedChunk({
      rank: 2,
      score: 0.9,
      chunkId: "profile-2",
      documentId: "profile-image-spec",
      content: "SELECTED profile size and format"
    }),
    sampleRetrievedChunk({
      rank: 3,
      score: 0.89,
      chunkId: "profile-3",
      documentId: "profile-image-spec",
      content: "SKIPPED THIRD PROFILE CHUNK"
    }),
    sampleRetrievedChunk({
      rank: 4,
      score: 0.88,
      chunkId: "error-1",
      documentId: "error-message-guideline",
      documentTitle: "エラーメッセージガイドライン",
      content: "SELECTED actionable error message"
    }),
    sampleRetrievedChunk({
      rank: 5,
      score: 0.87,
      chunkId: "api-1",
      documentId: "profile-api",
      documentTitle: "プロフィールAPI仕様",
      content: "SELECTED POST /api/profile/image"
    }),
    sampleRetrievedChunk({
      rank: 6,
      score: 0.86,
      chunkId: "cache-1",
      documentId: "frontend-cache-guideline",
      documentTitle: "フロントエンドキャッシュ方針",
      content: "SELECTED cache busting"
    })
  ];
}

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

  it("defaults RAG mode to off and rejects invalid RAG mode", () => {
    expect(generateRequestSchema.parse({ inputText: sampleInput }).ragMode).toBe(
      "off"
    );
    expect(
      generateRequestSchema.parse({ inputText: sampleInput }).agentMode
    ).toBe("off");
    expect(
      generateRequestSchema.parse({ inputText: sampleInput, agentMode: "auto" })
        .agentMode
    ).toBe("auto");
    expect(
      generateRequestSchema.parse({ inputText: sampleInput }).ragContextPolicy
    ).toBe("raw-top-k-v1");
    expect(ragContextPolicySchema.parse("document-cap-v1")).toBe(
      "document-cap-v1"
    );
    expect(ragContextPolicySchema.parse("document-diversity-v1")).toBe(
      "document-diversity-v1"
    );

    const invalid = generateRequestSchema.safeParse({
      inputText: sampleInput,
      ragMode: "maybe"
    });
    const invalidPolicy = generateRequestSchema.safeParse({
      inputText: sampleInput,
      ragContextPolicy: "unknown-policy"
    });

    expect(invalid.success).toBe(false);
    expect(invalidPolicy.success).toBe(false);
  });

  it("accepts RAG metadata for old and grounded generation records", () => {
    expect(ragMetadataSchema.parse({ mode: "off" }).mode).toBe("off");
    expect(() =>
      ragMetadataSchema.parse({
        mode: "on",
        strategy: "heading-aware-v1",
        topK: 5,
        embeddingModel: "text-embedding-3-small",
        retrievalLatencyMs: 12,
        contextPolicy: "document-diversity-v1",
        candidateTopK: 10,
        candidateChunkCount: 4,
        candidateUniqueDocumentCount: 2,
        candidateDocumentChunkCounts: {
          "profile-image-spec": 3,
          "profile-api": 1
        },
        requestedFinalTopK: 5,
        maxChunksPerDocument: 2,
        selectedChunkCount: 1,
        uniqueDocumentCount: 1,
        maximumChunksFromSameDocument: 1,
        documentChunkCounts: {
          "profile-image-spec": 1
        },
        sources: [
          {
            sourceId: "S1",
            contextRank: 1,
            retrievalRank: 1,
            ...sampleRetrievedChunk()
          }
        ],
        embeddingUsage: {
          promptTokens: 10,
          totalTokens: 10
        }
      })
    ).not.toThrow();
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

  it("adds contract checklist reference text only when explicitly provided", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify(createMockGeneration(sampleInput))
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await generateFromRequirementMemo(sampleInput, {
      contractChecklistText:
        "policyVersion: contract-detail-checklist-v1\n- CONTRACT-CHECK-001"
    });

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    const body = String(requestInit.body);

    expect(body).toContain("Contract-detail checklist is reference guidance");
    expect(body).toContain("contract-detail-checklist-v1");
    expect(body).toContain("CONTRACT-CHECK-001");
    expect(body).not.toContain("test-openai-key");
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
    vi.stubEnv("LLM_PROVIDER", "mock");

    await withPreservedGenerationData(async () => {
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
      expect(body.rag).toEqual({ mode: "off" });
    });
  });

  it("does not run retrieval when RAG mode is off", async () => {
    const retrieveSpy = vi.spyOn(ragRetriever, "retrieveRagChunks");
    vi.stubEnv("LLM_PROVIDER", "mock");

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "off",
            ragContextPolicy: "document-cap-v1"
          })
        })
      );

      expect(response.status).toBe(200);
      expect(retrieveSpy).not.toHaveBeenCalled();
    });
  });

  it("keeps existing generation behavior when agentMode is omitted or off", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    await withPreservedGenerationData(async () => {
      const omitted = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput })
        })
      );
      const off = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput, agentMode: "off" })
        })
      );
      const omittedBody = await omitted.json();
      const offBody = await off.json();

      expect(omitted.status).toBe(200);
      expect(off.status).toBe(200);
      expect(omittedBody.agent).toBeUndefined();
      expect(offBody.agent).toBeUndefined();
      expect(omittedBody.provider).toBe("mock");
      expect(offBody.provider).toBe("mock");
    });
  });

  it("runs Agent workflow when agentMode is on and does not save generation history", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        embeddingUsage: {
          promptTokens: 20,
          totalTokens: 20
        },
        results: [sampleRetrievedChunk()]
      });

    await withPreservedGenerationData(async () => {
      await withPreservedAgentRunData(async () => {
        const beforeGenerationData = existsSync(getDataPath())
          ? readFileSync(getDataPath(), "utf8")
          : "[]\n";
        const response = await POST(
          new Request("http://localhost/api/generate", {
            method: "POST",
            body: JSON.stringify({ inputText: sampleInput, agentMode: "on" })
          })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.agent).toMatchObject({
          status: "completed",
          terminationReason: "review_passed",
          revisionCount: 0,
          reviewCount: 1,
          llmStepCount: 3,
          toolInvocationCount: 1
        });
        expect(body.agent.plan).toBeDefined();
        expect(body.agent.reviewHistory).toHaveLength(1);
        expect(body.agent.retrieval.sources[0]).toMatchObject({
          sourceId: "S1",
          documentId: "profile-image-spec"
        });
        expect(body.agent.retrieval.sources[0].content).toBeUndefined();
        expect(retrieveSpy).toHaveBeenCalledWith({
          query: sampleInput,
          strategy: "heading-aware-v1",
          topK: 10
        });
        expect(
          existsSync(getDataPath()) ? readFileSync(getDataPath(), "utf8") : "[]\n"
        ).toBe(beforeGenerationData);
        expect(readFileSync(getAgentRunsPath(), "utf8")).toContain(
          body.agent.runId
        );
      });
    });
  });

  it("routes agentMode auto to single-pass RAG for low-risk requirements", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const lowRiskInput = "検索結果をステータスで絞り込めるようにしたい。";
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: lowRiskInput,
        strategy: "heading-aware-v1",
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        results: [sampleRetrievedChunk()]
      });

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: lowRiskInput, agentMode: "auto" })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agent).toBeUndefined();
      expect(body.agentRouting).toMatchObject({
        mode: "single_pass",
        policyVersion: "agent-routing-v1"
      });
      expect(body.rag).toMatchObject({
        mode: "on",
        contextPolicy: "document-diversity-v1",
        candidateTopK: 10
      });
      expect(retrieveSpy).toHaveBeenCalledWith({
        query: lowRiskInput,
        strategy: "heading-aware-v1",
        topK: 10
      });
    });
  });

  it("routes agentMode auto to Agent workflow for ambiguous safety requirements", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const ambiguousInput =
      "プロフィール周りの画像更新をもっと安全で使いやすくしたい。どこまで対応するべきか整理したい。";
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: ambiguousInput,
        strategy: "heading-aware-v1",
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        results: [sampleRetrievedChunk()]
      });

    await withPreservedGenerationData(async () => {
      await withPreservedAgentRunData(async () => {
        const beforeGenerationData = existsSync(getDataPath())
          ? readFileSync(getDataPath(), "utf8")
          : "[]\n";
        const response = await POST(
          new Request("http://localhost/api/generate", {
            method: "POST",
            body: JSON.stringify({ inputText: ambiguousInput, agentMode: "auto" })
          })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.agentRouting).toMatchObject({
          mode: "agent_workflow",
          policyVersion: "agent-routing-v1"
        });
        expect(body.agent).toMatchObject({
          status: "completed",
          routing: expect.objectContaining({
            mode: "agent_workflow"
          })
        });
        expect(retrieveSpy).toHaveBeenCalledWith({
          query: ambiguousInput,
          strategy: "heading-aware-v1",
          topK: 10
        });
        expect(
          existsSync(getDataPath()) ? readFileSync(getDataPath(), "utf8") : "[]\n"
        ).toBe(beforeGenerationData);
      });
    });
  });

  it("rejects explicit RAG controls when agentMode is on or auto", async () => {
    const retrieveSpy = vi.spyOn(ragRetriever, "retrieveRagChunks");

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          inputText: sampleInput,
          agentMode: "on",
          ragMode: "on"
        })
      })
    );
    const autoResponse = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          inputText: sampleInput,
          agentMode: "auto",
          ragMode: "on"
        })
      })
    );
    const body = await response.json();
    const autoBody = await autoResponse.json();

    expect(response.status).toBe(400);
    expect(autoResponse.status).toBe(400);
    expect(body.error).toContain("agentMode=on/auto");
    expect(autoBody.error).toContain("agentMode=on/auto");
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  it("returns completed_with_findings as a successful Agent response", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockResolvedValueOnce({
      query: sampleInput,
      strategy: "heading-aware-v1",
      topK: 10,
      embeddingModel: "text-embedding-3-small",
      results: [sampleRetrievedChunk()]
    });
    const majorReview = {
      summary: "重要な修正が必要です。",
      findings: [
        {
          findingId: "major-1",
          category: "requirement_coverage",
          severity: "major",
          targetFields: ["acceptanceCriteria"],
          message: "失敗時メッセージが不足しています。",
          requiredChange: "失敗時メッセージの受け入れ条件を追加する。",
          sourceIds: ["S1"]
        }
      ]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            normalizedGoal: "プロフィール画像変更",
            explicitRequirements: ["画像変更"],
            constraints: [],
            ambiguities: [],
            knowledgeNeeds: ["profile"]
          })
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(createMockGeneration(sampleInput))
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(majorReview)
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(createMockGeneration(sampleInput))
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(majorReview)
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    await withPreservedAgentRunData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput, agentMode: "on" })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.summary).toEqual(expect.any(String));
      expect(body.agent).toMatchObject({
        status: "completed_with_findings",
        terminationReason: "revision_limit_reached",
        revisionCount: 1,
        reviewCount: 2,
        llmStepCount: 5
      });
      expect(body.agent.reviewHistory[1].review.findings[0].severity).toBe(
        "major"
      );
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });
  });

  it("returns technical Agent failure without single-pass fallback", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockResolvedValueOnce({
      query: sampleInput,
      strategy: "heading-aware-v1",
      topK: 10,
      embeddingModel: "text-embedding-3-small",
      results: []
    });

    await withPreservedAgentRunData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput, agentMode: "on" })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toContain("no usable chunks");
      expect(body.agent.status).toBe("failed");
      expect(body.summary).toBeUndefined();
    });
  });

  it("returns RAG source metadata when RAG mode is on", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 5,
        embeddingModel: "text-embedding-3-small",
        embeddingUsage: {
          promptTokens: 20,
          totalTokens: 20
        },
        results: [sampleRetrievedChunk()]
      });

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ inputText: sampleInput, ragMode: "on" })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(retrieveSpy).toHaveBeenCalledWith({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 5
      });
      expect(body.rag).toMatchObject({
        mode: "on",
        strategy: "heading-aware-v1",
        topK: 5,
        contextPolicy: "raw-top-k-v1",
        candidateTopK: 5,
        candidateChunkCount: 1,
        candidateUniqueDocumentCount: 1,
        candidateDocumentChunkCounts: {
          "profile-image-spec": 1
        },
        requestedFinalTopK: 5,
        selectedChunkCount: 1,
        uniqueDocumentCount: 1,
        maximumChunksFromSameDocument: 1,
        documentChunkCounts: {
          "profile-image-spec": 1
        },
        embeddingModel: "text-embedding-3-small",
        embeddingUsage: {
          promptTokens: 20,
          totalTokens: 20
        }
      });
      expect(body.rag.retrievalLatencyMs).toEqual(expect.any(Number));
      expect(body.rag.sources[0]).toMatchObject({
        sourceId: "S1",
        documentId: "profile-image-spec",
        rank: 1,
        contextRank: 1,
        retrievalRank: 1
      });
      expect(body.rag.sources[0].vector).toBeUndefined();
    });
  });

  it("uses candidate Top 10 and document-cap selection when requested", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        results: sampleRetrievedChunksForDocumentCap()
      });

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "on",
            ragContextPolicy: "document-cap-v1"
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(retrieveSpy).toHaveBeenCalledWith({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 10
      });
      expect(body.rag).toMatchObject({
        mode: "on",
        contextPolicy: "document-cap-v1",
        candidateTopK: 10,
        candidateChunkCount: 6,
        candidateUniqueDocumentCount: 4,
        candidateDocumentChunkCounts: {
          "profile-image-spec": 3,
          "error-message-guideline": 1,
          "profile-api": 1,
          "frontend-cache-guideline": 1
        },
        requestedFinalTopK: 5,
        maxChunksPerDocument: 2,
        selectedChunkCount: 5,
        uniqueDocumentCount: 4,
        maximumChunksFromSameDocument: 2
      });
      expect(body.rag.sources.map((source: { documentId: string }) => source.documentId)).toEqual([
        "profile-image-spec",
        "profile-image-spec",
        "error-message-guideline",
        "profile-api",
        "frontend-cache-guideline"
      ]);
      expect(body.rag.sources.map((source: { contextRank: number }) => source.contextRank)).toEqual([
        1, 2, 3, 4, 5
      ]);
      expect(body.rag.sources.map((source: { retrievalRank: number }) => source.retrievalRank)).toEqual([
        1, 2, 4, 5, 6
      ]);
    });
  });

  it("uses diversity-first selection when requested", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const retrieveSpy = vi
      .spyOn(ragRetriever, "retrieveRagChunks")
      .mockResolvedValueOnce({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 10,
        embeddingModel: "text-embedding-3-small",
        results: sampleRetrievedChunksForDocumentCap()
      });

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "on",
            ragContextPolicy: "document-diversity-v1"
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(retrieveSpy).toHaveBeenCalledWith({
        query: sampleInput,
        strategy: "heading-aware-v1",
        topK: 10
      });
      expect(body.rag).toMatchObject({
        contextPolicy: "document-diversity-v1",
        candidateTopK: 10,
        candidateChunkCount: 6,
        candidateUniqueDocumentCount: 4,
        requestedFinalTopK: 5,
        maxChunksPerDocument: 2,
        selectedChunkCount: 5,
        uniqueDocumentCount: 4,
        maximumChunksFromSameDocument: 2
      });
      expect(body.rag.sources.map((source: { retrievalRank: number }) => source.retrievalRank)).toEqual([
        1, 2, 4, 5, 6
      ]);
      expect(body.rag.sources.map((source: { contextRank: number }) => source.contextRank)).toEqual([
        1, 2, 3, 4, 5
      ]);
    });
  });

  it("can generate with fewer than five selected document-diversity chunks", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockResolvedValueOnce({
      query: sampleInput,
      strategy: "heading-aware-v1",
      topK: 10,
      embeddingModel: "text-embedding-3-small",
      results: [
        sampleRetrievedChunk({ rank: 1, chunkId: "profile-1" }),
        sampleRetrievedChunk({ rank: 2, chunkId: "profile-2" }),
        sampleRetrievedChunk({ rank: 3, chunkId: "profile-3" })
      ]
    });

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "on",
            ragContextPolicy: "document-diversity-v1"
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.rag.selectedChunkCount).toBe(2);
      expect(body.rag.uniqueDocumentCount).toBe(1);
      expect(body.rag.sources).toHaveLength(2);
    });
  });

  it("passes only selected context chunks to the provider", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockResolvedValueOnce({
      query: sampleInput,
      strategy: "heading-aware-v1",
      topK: 10,
      embeddingModel: "text-embedding-3-small",
      results: sampleRetrievedChunksForDocumentCap()
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify(createMockGeneration(sampleInput)),
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          total_tokens: 3
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await withPreservedGenerationData(async () => {
      const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "on",
            ragContextPolicy: "document-diversity-v1"
          })
        })
      );
      const requestBody = JSON.parse(
        String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
      );
      const userContent = requestBody.input[1].content as string;

      expect(response.status).toBe(200);
      expect(userContent).toContain("SELECTED profile acceptance conditions");
      expect(userContent).toContain("SELECTED cache busting");
      expect(userContent).not.toContain("SKIPPED THIRD PROFILE CHUNK");
      expect(userContent).not.toContain("test-openai-key");
    });
  });

  it("fails closed without provider generation when RAG retrieval fails", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockRejectedValueOnce(
      new Error("Qdrant unavailable")
    );

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({ inputText: sampleInput, ragMode: "on" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("Qdrant unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed without provider generation when RAG returns no chunks", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(ragRetriever, "retrieveRagChunks").mockResolvedValueOnce({
      query: sampleInput,
      strategy: "heading-aware-v1",
      topK: 5,
      embeddingModel: "text-embedding-3-small",
      results: []
    });

    const response = await POST(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({
            inputText: sampleInput,
            ragMode: "on",
            ragContextPolicy: "document-diversity-v1"
          })
        })
      );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("RAG retrieval returned no usable chunks");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid RAG mode before retrieval", async () => {
    const retrieveSpy = vi.spyOn(ragRetriever, "retrieveRagChunks");

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({ inputText: sampleInput, ragMode: "bad" })
      })
    );

    expect(response.status).toBe(400);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid context policy before retrieval", async () => {
    const retrieveSpy = vi.spyOn(ragRetriever, "retrieveRagChunks");

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          inputText: sampleInput,
          ragMode: "on",
          ragContextPolicy: "bad-policy"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });
});

describe("generation UI", () => {
  it("contains client elapsed latency display wiring", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");
    const cssSource = readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8"
    );

    expect(pageSource).toContain("clientElapsedMs");
    expect(pageSource).toContain("performance.now()");
    expect(pageSource).toContain("Client elapsed");
    expect(pageSource).toContain("ragMode");
    expect(pageSource).toContain("ragContextPolicy");
    expect(pageSource).toContain("Context policy");
    expect(pageSource).toContain("raw-top-k-v1");
    expect(pageSource).toContain("document-cap-v1");
    expect(pageSource).toContain("document-diversity-v1");
    expect(pageSource).toContain("Candidate Top K");
    expect(pageSource).toContain("Candidate chunks");
    expect(pageSource).toContain("Candidate unique docs");
    expect(pageSource).toContain("Selected chunks");
    expect(pageSource).toContain("Selected unique docs");
    expect(pageSource).toContain("Max selected / doc");
    expect(pageSource).toContain("Context rank");
    expect(pageSource).toContain("Retrieval rank");
    expect(pageSource).toContain("Retrieved Sources");
    expect(pageSource).toContain('setRagMode("on")');
    expect(pageSource).toContain('className="summary-content"');
    expect(pageSource).toContain('meta?.rag ?? { mode: "off" as const }');
    expect(pageSource).toContain('rag.mode === "on" ? <SourceList sources={rag.sources} /> : null');
    expect(pageSource).toContain("Embedding");
    expect(pageSource).toContain("Embedding tokens");
    expect(pageSource).toContain("rag.embeddingModel");
    expect(pageSource).toContain("rag.embeddingUsage?.promptTokens");
    expect(pageSource).toContain("sources.map");
    expect(pageSource).toContain("agentMode");
    expect(pageSource).toContain("Agent workflow");
    expect(pageSource).toContain("Agent Workflow");
    expect(pageSource).toContain("Review history");
    expect(pageSource).toContain("completed_with_findings");
    expect(pageSource).toContain("agentMode === \"on\"");
    expect(pageSource).toContain("? { inputText, agentMode }");
    expect(pageSource).toContain("AgentSourceList");
    expect(pageSource).toContain("Single-pass fallback was not used");
    expect(pageSource).toContain("revisionCount");
    expect(pageSource).toContain("llmStepCount");
    expect(pageSource).toContain("toolInvocationCount");
    expect(cssSource).toContain(
      "grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.1fr);"
    );
    expect(cssSource).toContain("grid-template-columns: repeat(2, minmax(150px, 1fr));");
    expect(cssSource).toContain(".summary-content");
    expect(cssSource).toContain(".policy-control");
    expect(cssSource).toContain(".policy-options");
    expect(cssSource).toContain(".agent-panel");
    expect(cssSource).toContain(".agent-step-list");
    expect(cssSource).toContain(".finding-item.major");
    expect(cssSource).not.toContain("grid-template-columns: minmax(0, 1fr) auto;");
  });
});
