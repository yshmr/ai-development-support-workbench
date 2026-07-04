import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetchGeminiGenerateContent } from "../lib/gemini-http.mjs";

const envPath = path.join(process.cwd(), ".env.local");

const responseSchema = {
  type: "object",
  required: ["summary"],
  properties: {
    summary: {
      type: "string"
    }
  }
};

const systemPrompt = [
  "Return JSON only.",
  "The JSON must match the provided response schema.",
  "Summarize the user input in Japanese."
].join("\n");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) {
          return [line, ""];
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

        return [key, value];
      })
  );
}

const env = {
  ...process.env,
  ...parseEnvFile(envPath)
};

const apiKey = env.GEMINI_API_KEY;
const modelName = env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env.local.");
  process.exit(1);
}

try {
  const response = await fetchGeminiGenerateContent({
    apiKey,
    modelName,
    inputText: "Ping",
    systemPrompt,
    responseSchema,
    debug: env.DEBUG_LLM_RESPONSE === "1"
  });
  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      `Gemini provider path unreachable. status=${response.status} modelName=${modelName}`
    );
    process.exit(1);
  }

  JSON.parse(responseText);
  console.log(`Gemini provider path reachable. modelName=${modelName}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
