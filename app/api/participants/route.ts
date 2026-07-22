import {
  deleteParticipant,
  saveParticipant,
  updateParticipantAbsence,
} from "../store";

export async function POST(request: Request) {
  return persist(request);
}

export async function PUT(request: Request) {
  return persist(request);
}

export async function PATCH(request: Request) {
  try {
    await updateParticipantAbsence(await request.json());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "更新に失敗しました。" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await deleteParticipant(await request.json());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 400 },
    );
  }
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
