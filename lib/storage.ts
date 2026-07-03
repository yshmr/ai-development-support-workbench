import { promises as fs } from "node:fs";
import path from "node:path";
import {
  generationHistorySchema,
  generationRecordSchema,
  type GenerationRecord
} from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "generations.json");

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]\n", "utf8");
  }
}

export async function listGenerations(): Promise<GenerationRecord[]> {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  const records = generationHistorySchema.parse(JSON.parse(raw));

  return records.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getGenerationById(
  id: string
): Promise<GenerationRecord | undefined> {
  const records = await listGenerations();
  return records.find((record) => record.id === id);
}

export async function saveGeneration(
  record: GenerationRecord
): Promise<GenerationRecord> {
  const parsedRecord = generationRecordSchema.parse(record);
  const records = await listGenerations();
  const nextRecords = [parsedRecord, ...records].slice(0, 100);

  await fs.writeFile(dataFile, `${JSON.stringify(nextRecords, null, 2)}\n`, "utf8");

  return parsedRecord;
}
