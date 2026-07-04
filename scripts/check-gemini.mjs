import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");

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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
    {
      headers: {
        "x-goog-api-key": apiKey
      }
    }
  );

  if (!response.ok) {
    console.error(
      `Gemini API unreachable. status=${response.status} modelName=${modelName}`
    );
    process.exit(1);
  }

  console.log(`Gemini API reachable. modelName=${modelName}`);
} catch (error) {
  const cause = error?.cause;
  console.error(
    [
      "Gemini API unreachable.",
      `modelName=${modelName}`,
      `error.name=${error instanceof Error ? error.name : typeof error}`,
      `error.message=${error instanceof Error ? error.message : String(error)}`,
      `cause.code=${cause?.code ?? "none"}`,
      `cause.errno=${cause?.errno ?? "none"}`,
      `cause.syscall=${cause?.syscall ?? "none"}`,
      `cause.hostname=${cause?.hostname ?? "none"}`
    ].join(" ")
  );
  process.exit(1);
}
