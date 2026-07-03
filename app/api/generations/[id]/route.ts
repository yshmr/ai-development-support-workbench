import { NextResponse } from "next/server";
import { getGenerationById } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const record = await getGenerationById(id);

    if (!record) {
      return NextResponse.json(
        { error: "指定された履歴が見つかりません。" },
        { status: 404 }
      );
    }

    return NextResponse.json(record);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "履歴詳細の取得に失敗しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
