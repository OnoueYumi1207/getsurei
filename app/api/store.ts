import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

const ROLE_NAMES = [
  "運搬",
  "主弁",
  "MC",
  "儀式",
  "大黒天恵比寿依り代",
  "ありが鯛・仔ありが鯛",
  "道具販売",
  "祈願会",
  "五路財神",
  "案内所",
  "仙丹茶",
  "感謝の誠",
  "設営",
  "泉珠銀行",
  "金剛甘露祈祷（主弁）",
  "金剛甘露祈祷（秡い）",
  "甘露壇",
  "泉珠卜占",
  "その他",
  "フリー",
];

const GROUPS = [
  ["大江戸", "守屋正裕"],
  ["お台場", "河本ひとみ"],
  ["羽田", "永井歳子"],
  ["かながわ", "大中俊一"],
  ["富士山", "松田静香"],
  ["駿天", "新井文美"],
  ["埼玉", "小川克枝"],
  ["千葉", "加藤裕美子"],
  ["山梨", "細田倫宏"],
];

const ADMIN_EDITORS = ["尾ノ上裕美"];

const SHUTTLES = [
  ["outbound", "北本駅8:20", 2, null],
  ["outbound", "鴻巣駅8:40", null, "スタッフ"],
  ["outbound", "鴻巣駅10:00", null, "一般優先"],
  ["return", "早便", null, null],
  ["return", "通常", null, null],
  ["return", "最終", null, null],
] as const;

export type ParticipantPayload = {
  id?: number;
  eventId: number;
  groupId: number;
  name: string;
  isAbsent: boolean;
  sendanTeaCount: number;
  transportType: "driver" | "passenger" | "shuttle";
  rideDriverParticipantId: number | null;
  outboundShuttleId: number | null;
  returnShuttleId: number | null;
  otherRoleText: string;
  roles: number[];
  carrierSchedule: {
    outboundDate: string;
    outboundTime: string;
    returnDate: string;
    returnTime: string;
  } | null;
};

export function db() {
  if (!env.DB) throw new Error("D1データベースが利用できません。");
  return env.DB;
}

export async function initialize() {
  const d1 = db();
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, event_date TEXT NOT NULL, month_label TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, editor_name TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS shuttle_options (id INTEGER PRIMARY KEY AUTOINCREMENT, direction TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER, note TEXT, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, group_id INTEGER NOT NULL, name TEXT NOT NULL, is_absent INTEGER NOT NULL, sendan_tea_count INTEGER NOT NULL, transport_type TEXT NOT NULL, ride_driver_participant_id INTEGER, outbound_shuttle_id INTEGER, return_shuttle_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS participant_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, participant_id INTEGER NOT NULL, role_id INTEGER NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS carrier_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, participant_id INTEGER NOT NULL UNIQUE, outbound_date TEXT, outbound_time TEXT, return_date TEXT, return_time TEXT)"),
  ]);
  await d1
    .prepare("ALTER TABLE participants ADD COLUMN other_role_text TEXT")
    .run()
    .catch((error) => {
      if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
        throw error;
      }
    });

  const counts = await d1.batch([
    d1.prepare("SELECT COUNT(*) AS count FROM groups"),
    d1.prepare("SELECT COUNT(*) AS count FROM roles"),
    d1.prepare("SELECT COUNT(*) AS count FROM shuttle_options"),
    d1.prepare("SELECT COUNT(*) AS count FROM events"),
  ]);

  if ((counts[0].results?.[0]?.count as number) === 0) {
    await d1.batch(
      GROUPS.map(([name, editorName]) =>
        d1.prepare("INSERT INTO groups (name, editor_name) VALUES (?, ?)").bind(name, editorName),
      ),
    );
  }
  if ((counts[1].results?.[0]?.count as number) === 0) {
    await d1.batch(
      ROLE_NAMES.map((name, index) =>
        d1.prepare("INSERT INTO roles (name, sort_order, is_active) VALUES (?, ?, 1)").bind(name, index + 1),
      ),
    );
  } else {
    for (const name of ROLE_NAMES) {
      const existing = await d1
        .prepare("SELECT id FROM roles WHERE name = ?")
        .bind(name)
        .first();
      if (!existing) {
        const max = await d1
          .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM roles")
          .first<{ maxSort: number }>();
        await d1
          .prepare("INSERT INTO roles (name, sort_order, is_active) VALUES (?, ?, 1)")
          .bind(name, (max?.maxSort ?? 0) + 1)
          .run();
      }
    }
  }
  if ((counts[2].results?.[0]?.count as number) === 0) {
    await d1.batch(
      SHUTTLES.map(([direction, name, capacity, note], index) =>
        d1.prepare("INSERT INTO shuttle_options (direction, name, capacity, note, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)").bind(direction, name, capacity, note, index + 1),
      ),
    );
  }
  if ((counts[3].results?.[0]?.count as number) === 0) {
    const now = new Date().toISOString();
    await d1
      .prepare("INSERT INTO events (name, event_date, month_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind("明王招福護摩供", "2026-07-12", "7月", now, now)
      .run();
  }
}

export async function appData() {
  await initialize();
  const d1 = db();
  const [groups, roles, shuttles, events, participants, participantRoles, schedules] =
    await d1.batch([
      d1.prepare("SELECT id, name, editor_name AS editorName FROM groups ORDER BY id"),
      d1.prepare("SELECT id, name, sort_order AS sortOrder FROM roles WHERE is_active = 1 ORDER BY sort_order"),
      d1.prepare("SELECT id, direction, name, capacity, note, sort_order AS sortOrder FROM shuttle_options WHERE is_active = 1 ORDER BY direction, sort_order"),
      d1.prepare("SELECT id, name, event_date AS eventDate, month_label AS monthLabel FROM events ORDER BY event_date DESC"),
      d1.prepare("SELECT id, event_id AS eventId, group_id AS groupId, name, is_absent AS isAbsent, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, ride_driver_participant_id AS rideDriverParticipantId, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText, created_at AS createdAt, updated_at AS updatedAt FROM participants ORDER BY group_id, name"),
      d1.prepare("SELECT participant_id AS participantId, role_id AS roleId FROM participant_roles"),
      d1.prepare("SELECT participant_id AS participantId, outbound_date AS outboundDate, outbound_time AS outboundTime, return_date AS returnDate, return_time AS returnTime FROM carrier_schedules"),
    ]);
  const user = await getChatGPTUser();
  const roleMap = new Map<number, number[]>();
  for (const row of participantRoles.results ?? []) {
    const participantId = row.participantId as number;
    roleMap.set(participantId, [...(roleMap.get(participantId) ?? []), row.roleId as number]);
  }
  const scheduleMap = new Map<number, unknown>();
  for (const row of schedules.results ?? []) {
    scheduleMap.set(row.participantId as number, row);
  }

  return {
    user,
    groups: (groups.results ?? []).map((group) => ({
      ...group,
      editorNames: [
        group.editorName as string,
        ...ADMIN_EDITORS,
      ],
    })),
    roles: roles.results ?? [],
    shuttles: shuttles.results ?? [],
    events: events.results ?? [],
    participants: (participants.results ?? []).map((participant) => ({
      ...participant,
      isAbsent: Boolean(participant.isAbsent),
      otherRoleText: participant.otherRoleText ?? "",
      roles: roleMap.get(participant.id as number) ?? [],
      carrierSchedule: normalizeSchedule(scheduleMap.get(participant.id as number)),
    })),
  };
}

export async function assertCanEdit(groupId: number) {
  const user = await getChatGPTUser();
  if (!user) throw new Error("編集するにはログインしてください。");
  await initialize();
  const group = await db()
    .prepare("SELECT name, editor_name AS editorName FROM groups WHERE id = ?")
    .bind(groupId)
    .first<{ name: string; editorName: string }>();
  const editors = [
    group?.editorName,
    ...ADMIN_EDITORS,
  ];
  if (!group || !editors.includes(user.displayName)) {
    throw new Error("この伝道会を編集する権限がありません。");
  }
}

export async function saveParticipant(payload: ParticipantPayload) {
  await assertCanEdit(payload.groupId);
  const now = new Date().toISOString();
  const d1 = db();
  const clean = normalizePayload(payload);

  let participantId = clean.id;
  if (participantId) {
    await d1
      .prepare("UPDATE participants SET name = ?, is_absent = ?, sendan_tea_count = ?, transport_type = ?, ride_driver_participant_id = ?, outbound_shuttle_id = ?, return_shuttle_id = ?, other_role_text = ?, updated_at = ? WHERE id = ? AND event_id = ? AND group_id = ?")
      .bind(clean.name, clean.isAbsent ? 1 : 0, clean.sendanTeaCount, clean.transportType, clean.rideDriverParticipantId, clean.outboundShuttleId, clean.returnShuttleId, clean.otherRoleText, now, participantId, clean.eventId, clean.groupId)
      .run();
  } else {
    const result = await d1
      .prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clean.eventId, clean.groupId, clean.name, clean.isAbsent ? 1 : 0, clean.sendanTeaCount, clean.transportType, clean.rideDriverParticipantId, clean.outboundShuttleId, clean.returnShuttleId, clean.otherRoleText, now, now)
      .run();
    participantId = result.meta.last_row_id;
  }

  await d1.prepare("DELETE FROM participant_roles WHERE participant_id = ?").bind(participantId).run();
  if (clean.roles.length) {
    await d1.batch(
      clean.roles.map((roleId) =>
        d1.prepare("INSERT INTO participant_roles (participant_id, role_id) VALUES (?, ?)").bind(participantId, roleId),
      ),
    );
  }
  await d1.prepare("DELETE FROM carrier_schedules WHERE participant_id = ?").bind(participantId).run();
  if (clean.carrierSchedule) {
    await d1
      .prepare("INSERT INTO carrier_schedules (participant_id, outbound_date, outbound_time, return_date, return_time) VALUES (?, ?, ?, ?, ?)")
      .bind(participantId, clean.carrierSchedule.outboundDate, clean.carrierSchedule.outboundTime, clean.carrierSchedule.returnDate, clean.carrierSchedule.returnTime)
      .run();
  }
}

export async function createEventFromPrevious(eventDate: string) {
  await initialize();
  const now = new Date().toISOString();
  const parsed = new Date(`${eventDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("開催日を選択してください。");
  const monthLabel = `${parsed.getMonth() + 1}月`;
  const d1 = db();
  const existing = await d1
    .prepare("SELECT id FROM events WHERE event_date = ?")
    .bind(eventDate)
    .first();
  if (existing) throw new Error("同じ開催日の行事がすでにあります。");

  const previous = await d1
    .prepare("SELECT id FROM events ORDER BY event_date DESC LIMIT 1")
    .first<{ id: number }>();
  const eventResult = await d1
    .prepare("INSERT INTO events (name, event_date, month_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind("明王招福護摩供", eventDate, monthLabel, now, now)
    .run();
  const newEventId = eventResult.meta.last_row_id;

  if (previous) {
    const source = await d1
      .prepare("SELECT id, group_id AS groupId, name, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, ride_driver_participant_id AS rideDriverParticipantId, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText FROM participants WHERE event_id = ? ORDER BY id")
      .bind(previous.id)
      .all<Record<string, unknown>>();
    const oldToNew = new Map<number, number>();
    for (const participant of source.results ?? []) {
      const result = await d1
        .prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?, ?)")
        .bind(newEventId, participant.groupId, participant.name, participant.sendanTeaCount, participant.transportType, participant.outboundShuttleId, participant.returnShuttleId, participant.otherRoleText ?? "", now, now)
        .run();
      oldToNew.set(participant.id as number, result.meta.last_row_id);
    }
    for (const participant of source.results ?? []) {
      const oldDriver = participant.rideDriverParticipantId as number | null;
      if (oldDriver && oldToNew.has(oldDriver)) {
        await d1
          .prepare("UPDATE participants SET ride_driver_participant_id = ? WHERE id = ?")
          .bind(oldToNew.get(oldDriver), oldToNew.get(participant.id as number))
          .run();
      }
    }
    const roles = await d1
      .prepare("SELECT participant_id AS participantId, role_id AS roleId FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ?)")
      .bind(previous.id)
      .all<Record<string, unknown>>();
    const inserts = (roles.results ?? [])
      .filter((role) => oldToNew.has(role.participantId as number))
      .map((role) =>
        d1.prepare("INSERT INTO participant_roles (participant_id, role_id) VALUES (?, ?)").bind(oldToNew.get(role.participantId as number), role.roleId),
      );
    if (inserts.length) await d1.batch(inserts);
  }

  return { id: newEventId, name: "明王招福護摩供", eventDate, monthLabel };
}

function normalizePayload(payload: ParticipantPayload) {
  return {
    ...payload,
    name: payload.name.trim(),
    isAbsent: Boolean(payload.isAbsent),
    sendanTeaCount: Math.max(0, Number(payload.sendanTeaCount) || 0),
    rideDriverParticipantId:
      payload.transportType === "passenger" ? payload.rideDriverParticipantId : null,
    outboundShuttleId:
      payload.transportType === "shuttle" ? payload.outboundShuttleId : null,
    returnShuttleId:
      payload.transportType === "shuttle" ? payload.returnShuttleId : null,
    otherRoleText: payload.otherRoleText?.trim() ?? "",
    roles: Array.from(new Set(payload.roles.map(Number).filter(Boolean))),
  };
}

function normalizeSchedule(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, string>;
  return {
    outboundDate: value.outboundDate ?? "",
    outboundTime: value.outboundTime ?? "",
    returnDate: value.returnDate ?? "",
    returnTime: value.returnTime ?? "",
  };
}
