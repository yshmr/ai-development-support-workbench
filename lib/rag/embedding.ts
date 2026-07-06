import { getRagConfig } from "./config";

type OpenAiEmbeddingData = {
  index: number;
  embedding: unknown;
};

type OpenAiEmbeddingResponse = {
  data?: OpenAiEmbeddingData[];
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

export type EmbeddingUsage = {
  promptTokens?: number;
  totalTokens?: number;
};

export type EmbeddingResult = {
  model: string;
  vectors: number[][];
  vectorDimension: number;
  usage?: EmbeddingUsage;
};

export type EmbeddingOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

function getFetch(fetchImpl?: typeof fetch): typeof fetch {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;
  if (!resolvedFetch) {
    throw new Error("fetch is not available in this runtime.");
  }
  return resolvedFetch;
}

function validateInputs(inputs: string[]) {
  if (inputs.length === 0) {
    throw new Error("Embedding input must not be empty.");
  }

  if (inputs.some((input) => input.trim().length === 0)) {
    throw new Error("Embedding input contains an empty string.");
  }
}

function normalizeVector(value: unknown, index: number): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Embedding response item ${index} does not include a vector.`);
  }

  const vector = value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error(`Embedding response item ${index} includes a non-number.`);
    }
    return item;
  });

  return vector;
}

function normalizeUsage(response: OpenAiEmbeddingResponse): EmbeddingUsage | undefined {
  const promptTokens = response.usage?.prompt_tokens;
  const totalTokens = response.usage?.total_tokens;

  if (typeof promptTokens !== "number" && typeof totalTokens !== "number") {
    return undefined;
  }

  return {
    promptTokens:
      typeof promptTokens === "number" && Number.isFinite(promptTokens)
        ? promptTokens
        : undefined,
    totalTokens:
      typeof totalTokens === "number" && Number.isFinite(totalTokens)
        ? totalTokens
        : undefined
  };
}

function parseEmbeddingResponse(
  response: OpenAiEmbeddingResponse,
  inputCount: number
): number[][] {
  if (!Array.isArray(response.data)) {
    throw new Error("OpenAI embedding response does not include data.");
  }

  if (response.data.length !== inputCount) {
    throw new Error("OpenAI embedding response count does not match input count.");
  }

  const vectors = response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item, outputIndex) => {
      if (item.index !== outputIndex) {
        throw new Error("OpenAI embedding response indexes are not contiguous.");
      }
      return normalizeVector(item.embedding, item.index);
    });

  const [firstVector] = vectors;
  const vectorDimension = firstVector?.length ?? 0;
  if (vectorDimension === 0) {
    throw new Error("OpenAI embedding response vector dimension is empty.");
  }

  for (const vector of vectors) {
    if (vector.length !== vectorDimension) {
      throw new Error("OpenAI embedding response has inconsistent dimensions.");
    }
  }

  return vectors;
}

function classifyOpenAiEmbeddingHttpError(status: number): string {
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 429) {
    return "rate_limit_or_quota";
  }
  if (status >= 500) {
    return "server_error";
  }
  return "request_error";
}

export async function createOpenAiEmbeddings(
  inputs: string[],
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  validateInputs(inputs);

  const config = getRagConfig();
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? config.embeddingModel;

  if (!apiKey) {
    throw new Error("RAG embedding requires OPENAI_API_KEY in .env.local.");
  }

  const fetchImpl = getFetch(options.fetchImpl);
  const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: inputs,
      encoding_format: "float"
    })
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI embedding request failed: status=${response.status}, category=${classifyOpenAiEmbeddingHttpError(
        response.status
      )}`
    );
  }

  const data = (await response.json()) as OpenAiEmbeddingResponse;
  const vectors = parseEmbeddingResponse(data, inputs.length);

  return {
    model,
    vectors,
    vectorDimension: vectors[0].length,
    usage: normalizeUsage(data)
  };
}

export async function createOpenAiQueryEmbedding(
  query: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  return createOpenAiEmbeddings([query], options);
}
