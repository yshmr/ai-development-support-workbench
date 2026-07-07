import { promises as fs } from "node:fs";
import path from "node:path";
import {
  agentRunHistorySchema,
  agentRunRecordSchema,
  type AgentRunRecord
} from "./schema";
import type { AgentRunStore } from "./orchestrator";

const dataDir = path.join(process.cwd(), "data");
const agentRunsFile = path.join(dataDir, "agent-runs.json");

async function ensureAgentRunsFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(agentRunsFile);
  } catch {
    await fs.writeFile(agentRunsFile, "[]\n", "utf8");
  }
}

export async function listAgentRuns(): Promise<AgentRunRecord[]> {
  await ensureAgentRunsFile();
  const raw = await fs.readFile(agentRunsFile, "utf8");
  const records = agentRunHistorySchema.parse(JSON.parse(raw));

  return records.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveAgentRun(
  record: AgentRunRecord
): Promise<AgentRunRecord> {
  const parsedRecord = agentRunRecordSchema.parse(record);
  const records = await listAgentRuns();
  const withoutExisting = records.filter(
    (existing) => existing.runId !== parsedRecord.runId
  );
  const nextRecords = [parsedRecord, ...withoutExisting].slice(0, 100);

  await fs.writeFile(
    agentRunsFile,
    `${JSON.stringify(nextRecords, null, 2)}\n`,
    "utf8"
  );

  return parsedRecord;
}

export function createFileAgentRunStore(): AgentRunStore {
  return {
    saveRun: saveAgentRun
  };
}
