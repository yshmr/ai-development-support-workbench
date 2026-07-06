import { loadEnvConfig } from "@next/env";
import { defaultRagTopK } from "./config";
import {
  ragChunkStrategySchema,
  type RagChunkStrategy
} from "./schema";

let loadedProjectDir: string | undefined;

export function loadRagCliEnv(
  projectDir = process.cwd(),
  options: { forceReload?: boolean } = {}
) {
  if (loadedProjectDir === projectDir && !options.forceReload) {
    return;
  }

  loadEnvConfig(
    projectDir,
    true,
    {
      info: () => undefined,
      error: () => undefined
    },
    options.forceReload ?? false
  );
  loadedProjectDir = projectDir;
}

export function parseRagCliArgs(
  args: string[],
  options: { defaultStrategy?: RagChunkStrategy; defaultTopK?: number } = {}
): {
  strategy: RagChunkStrategy;
  topK: number;
} {
  if (args.some((arg) => arg.startsWith("--"))) {
    throw new Error(
      "Use positional arguments: npm run rag:ingest -- fixed-size-v1"
    );
  }

  if (args.length > 2) {
    throw new Error("Too many RAG CLI arguments.");
  }

  const strategy = ragChunkStrategySchema.parse(
    args[0] ?? options.defaultStrategy ?? "heading-aware-v1"
  );
  const topKText = args[1];
  const topK =
    topKText === undefined
      ? options.defaultTopK ?? defaultRagTopK
      : Number.parseInt(topKText, 10);

  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("topK must be an integer between 1 and 20.");
  }

  return {
    strategy,
    topK
  };
}
