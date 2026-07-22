import { createEventFromPrevious } from "../store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { eventDate?: string };
    const event = await createEventFromPrevious(payload.eventDate ?? "");
    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "作成に失敗しました。" },
      { status: 400 },
    );
  }
}
