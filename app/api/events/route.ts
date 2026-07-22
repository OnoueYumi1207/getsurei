import { copyPreviousEvent } from "../store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { eventId?: number };
    const result = await copyPreviousEvent(Number(payload.eventId));
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "作成に失敗しました。" },
      { status: 400 },
    );
  }
}
