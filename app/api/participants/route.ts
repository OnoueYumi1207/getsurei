import { saveParticipant } from "../store";

export async function POST(request: Request) {
  return persist(request);
}

export async function PUT(request: Request) {
  return persist(request);
}

async function persist(request: Request) {
  try {
    await saveParticipant(await request.json());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存に失敗しました。" },
      { status: 400 },
    );
  }
}
