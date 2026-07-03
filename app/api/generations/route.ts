import { NextResponse } from "next/server";
import { listGenerations } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const records = await listGenerations();
    return NextResponse.json({ generations: records });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "履歴の取得に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
