import { appData } from "../store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const eventId = Number(url.searchParams.get("eventId"));
    const groupId = Number(url.searchParams.get("groupId"));
    const response = Response.json(
      await appData(
        Number.isFinite(eventId) ? eventId : null,
        Number.isFinite(groupId) ? groupId : null,
      ),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
