import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateFromRequirementMemo } from "@/lib/generator";
import { saveGeneration } from "@/lib/storage";
import { generateRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON形式のリクエストを送信してください。" },
      { status: 400 }
    );
  }

  const parsedRequest = generateRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: parsedRequest.error.issues[0]?.message ?? "入力を確認してください。" },
      { status: 400 }
    );
  }

  try {
    const { output, provider, promptVersion, modelName } = await generateFromRequirementMemo(
      parsedRequest.data.inputText
    );

    const record = await saveGeneration({
      id: randomUUID(),
      inputText: parsedRequest.data.inputText,
      output,
      provider,
      promptVersion,
      modelName,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      ...output,
      id: record.id,
      provider: record.provider,
      promptVersion: record.promptVersion,
      modelName: record.modelName,
      createdAt: record.createdAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
