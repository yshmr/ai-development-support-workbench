import { NextResponse } from "next/server";
import { retrieveRagChunks } from "@/lib/rag/retriever";
import { retrievalSearchRequestSchema } from "@/lib/rag/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsedRequest = retrievalSearchRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "query, strategy, topKを確認してください。" },
      { status: 400 }
    );
  }

  try {
    const result = await retrieveRagChunks(parsedRequest.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "RAG retrievalに失敗しました。"
      },
      { status: 500 }
    );
  }
}
