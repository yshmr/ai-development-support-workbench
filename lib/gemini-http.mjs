const GEMINI_GENERATE_CONTENT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

function getErrorProperty(error, key) {
  if (!error || typeof error !== "object" || !(key in error)) {
    return undefined;
  }

  return error[key];
}

function collectGeminiFetchErrorInfo(error, modelName) {
  const cause = getErrorProperty(error, "cause");

  return {
    provider: "gemini",
    modelName,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    causeCode: getErrorProperty(cause, "code"),
    causeErrno: getErrorProperty(cause, "errno"),
    causeSyscall: getErrorProperty(cause, "syscall"),
    causeHostname: getErrorProperty(cause, "hostname")
  };
}

function buildGeminiFetchError(info) {
  return new Error(
    [
      "Gemini API fetch failed.",
      `provider=${info.provider}`,
      `modelName=${info.modelName}`,
      `error.name=${info.errorName}`,
      `error.message=${info.errorMessage}`,
      `cause.code=${info.causeCode ?? "none"}`,
      `cause.errno=${info.causeErrno ?? "none"}`,
      `cause.syscall=${info.causeSyscall ?? "none"}`,
      `cause.hostname=${info.causeHostname ?? "none"}`
    ].join(" ")
  );
}

function buildGeminiGenerateContentUrl(modelName) {
  return `${GEMINI_GENERATE_CONTENT_BASE_URL}/${modelName}:generateContent`;
}

function buildGeminiRequestBody({ inputText, systemPrompt, responseSchema }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n要件メモ:\n${inputText}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema
    }
  };
}

function collectGeminiRequestInfo(requestUrl, modelName) {
  const url = new URL(requestUrl);

  return {
    provider: "gemini",
    modelName,
    urlOrigin: url.origin,
    urlPathname: url.pathname,
    method: "POST",
    processVersion: process.version,
    nextRuntime: process.env.NEXT_RUNTIME ?? "none",
    fetchName: globalThis.fetch.name || "anonymous",
    fetchToStringTag: Object.prototype.toString.call(globalThis.fetch) || "unknown",
    hasHttpProxy: Boolean(process.env.HTTP_PROXY),
    hasHttpsProxy: Boolean(process.env.HTTPS_PROXY),
    hasAllProxy: Boolean(process.env.ALL_PROXY),
    hasNoProxy: Boolean(process.env.NO_PROXY),
    hasNodeOptions: Boolean(process.env.NODE_OPTIONS),
    hasNodeUseEnvProxy: Boolean(process.env.NODE_USE_ENV_PROXY)
  };
}

function logGeminiRequestInfo(info, debug) {
  if (!debug) {
    return;
  }

  console.info("[llm-debug] Gemini request metadata", info);
}

function logGeminiFetchErrorInfo(info, debug) {
  if (!debug) {
    return;
  }

  console.info("[llm-debug] Gemini fetch error", info);
}

export async function fetchGeminiGenerateContent({
  apiKey,
  modelName,
  inputText,
  systemPrompt,
  responseSchema,
  debug = false
}) {
  const requestUrl = buildGeminiGenerateContentUrl(modelName);
  logGeminiRequestInfo(collectGeminiRequestInfo(requestUrl, modelName), debug);

  try {
    return await globalThis.fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(
        buildGeminiRequestBody({
          inputText,
          systemPrompt,
          responseSchema
        })
      )
    });
  } catch (error) {
    const errorInfo = collectGeminiFetchErrorInfo(error, modelName);
    logGeminiFetchErrorInfo(errorInfo, debug);
    throw buildGeminiFetchError(errorInfo);
  }
}
