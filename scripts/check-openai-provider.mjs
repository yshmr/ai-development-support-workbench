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

const apiKey = env.OPENAI_API_KEY;
const modelName = env.OPENAI_MODEL || "gpt-5.5";

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .env.local.");
  process.exit(1);
}

try {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      input: "Reply with Pong only."
    })
  });

  if (!response.ok) {
    console.error(
      `OpenAI provider path unreachable. status=${response.status} modelName=${modelName}`
    );
    process.exit(1);
  }

  console.log(`OpenAI provider path reachable. modelName=${modelName}`);
} catch (error) {
  const cause = error?.cause;
  console.error(
    [
      "OpenAI provider path unreachable.",
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
