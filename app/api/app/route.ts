import { appData } from "../store";

export async function GET() {
  try {
    return Response.json(await appData());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
