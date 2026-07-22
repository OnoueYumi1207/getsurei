import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

const ROLE_NAMES = [
  "運搬",
  "主弁",
  "MC",
  "儀式",
  "恵比寿大黒天依り代",
  "ありが鯛・仔ありが鯛",
  "銀行",
  "祈願会",
  "道具販売",
  "五路財神",
  "太明星",
  "受付",
  "仙丹茶",
  "金剛甘露祈祷（主弁）",
  "金剛甘露祈祷（秡い）",
  "甘露壇",
  "膳食",
  "泉珠卜占",
  "送迎調整",
  "送迎ドライバー",
  "フリー",
  "その他",
];

const ROLE_RENAMES = new Map([
  ["大黒天恵比寿依り代", "恵比寿大黒天依り代"],
  ["泉珠銀行", "銀行"],
  ["案内所", "受付"],
]);

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

const PRESET_EVENTS = [
  ["2026-07-12", "7月"],
  ["2026-08-09", "8月"],
  ["2026-09-13", "9月"],
  ["2026-10-11", "10月"],
  ["2026-11-08", "11月"],
  ["2026-12-13", "12月"],
] as const;

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
    await syncRoles(d1);
  }
  if ((counts[2].results?.[0]?.count as number) === 0) {
    await d1.batch(
      SHUTTLES.map(([direction, name, capacity, note], index) =>
        d1.prepare("INSERT INTO shuttle_options (direction, name, capacity, note, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)").bind(direction, name, capacity, note, index + 1),
      ),
    );
  }
  for (const [eventDate, monthLabel] of PRESET_EVENTS) {
    const existing = await d1
      .prepare("SELECT id FROM events WHERE event_date = ?")
      .bind(eventDate)
      .first();
    if (!existing) {
      const now = new Date().toISOString();
      await d1
        .prepare("INSERT INTO events (name, event_date, month_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind("明王招福護摩供", eventDate, monthLabel, now, now)
        .run();
    }
  }
}

async function syncRoles(d1: D1Database) {
  for (const [from, to] of ROLE_RENAMES) {
    const oldRole = await d1
      .prepare("SELECT id FROM roles WHERE name = ?")
      .bind(from)
      .first<{ id: number }>();
    const newRole = await d1
      .prepare("SELECT id FROM roles WHERE name = ?")
      .bind(to)
      .first<{ id: number }>();
    if (oldRole && newRole) {
      await d1.batch([
        d1.prepare("UPDATE participant_roles SET role_id = ? WHERE role_id = ?").bind(newRole.id, oldRole.id),
        d1.prepare("DELETE FROM roles WHERE id = ?").bind(oldRole.id),
      ]);
    } else if (oldRole) {
      await d1.prepare("UPDATE roles SET name = ? WHERE id = ?").bind(to, oldRole.id).run();
    }
  }

  for (const [index, name] of ROLE_NAMES.entries()) {
    const existing = await d1
      .prepare("SELECT id FROM roles WHERE name = ?")
      .bind(name)
      .first<{ id: number }>();
    if (existing) {
      await d1
        .prepare("UPDATE roles SET sort_order = ?, is_active = 1 WHERE id = ?")
        .bind(index + 1, existing.id)
        .run();
    } else {
      await d1
        .prepare("INSERT INTO roles (name, sort_order, is_active) VALUES (?, ?, 1)")
        .bind(name, index + 1)
        .run();
    }
  }

  const placeholders = ROLE_NAMES.map(() => "?").join(", ");
  await d1
    .prepare(`UPDATE roles SET is_active = 0 WHERE name NOT IN (${placeholders})`)
    .bind(...ROLE_NAMES)
    .run();
}

export async function appData() {
  await initialize();
  const d1 = db();
  const [groups, roles, shuttles, events, participants, participantRoles, schedules] =
    await d1.batch([
      d1.prepare("SELECT id, name, editor_name AS editorName FROM groups ORDER BY id"),
      d1.prepare("SELECT id, name, sort_order AS sortOrder FROM roles WHERE is_active = 1 ORDER BY sort_order"),
      d1.prepare("SELECT id, direction, name, capacity, note, sort_order AS sortOrder FROM shuttle_options WHERE is_active = 1 ORDER BY direction, sort_order"),
      d1.prepare("SELECT id, name, event_date AS eventDate, month_label AS monthLabel FROM events ORDER BY event_date ASC"),
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
    isAdmin: Boolean(user && ADMIN_EDITORS.includes(user.displayName)),
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

async function assertAdmin() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("操作するにはログインしてください。");
  if (!ADMIN_EDITORS.includes(user.displayName)) {
    throw new Error("この操作は管理者のみ実行できます。");
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

export async function deleteParticipant(payload: {
  id?: number;
  eventId?: number;
  groupId?: number;
}) {
  const id = Number(payload.id);
  const eventId = Number(payload.eventId);
  const groupId = Number(payload.groupId);
  if (!id || !eventId || !groupId) {
    throw new Error("削除対象が正しくありません。");
  }
  await assertCanEdit(groupId);
  const d1 = db();
  const existing = await d1
    .prepare("SELECT id FROM participants WHERE id = ? AND event_id = ? AND group_id = ?")
    .bind(id, eventId, groupId)
    .first();
  if (!existing) {
    throw new Error("削除対象が見つかりません。");
  }
  await d1.batch([
    d1.prepare("DELETE FROM participant_roles WHERE participant_id = ?").bind(id),
    d1.prepare("DELETE FROM carrier_schedules WHERE participant_id = ?").bind(id),
    d1.prepare("UPDATE participants SET ride_driver_participant_id = NULL WHERE ride_driver_participant_id = ? AND event_id = ?").bind(id, eventId),
    d1.prepare("DELETE FROM participants WHERE id = ? AND event_id = ? AND group_id = ?").bind(id, eventId, groupId),
  ]);
}

export async function updateParticipantAbsence(payload: {
  id?: number;
  eventId?: number;
  groupId?: number;
  isAbsent?: boolean;
}) {
  const id = Number(payload.id);
  const eventId = Number(payload.eventId);
  const groupId = Number(payload.groupId);
  if (!id || !eventId || !groupId) {
    throw new Error("更新対象が正しくありません。");
  }
  await assertCanEdit(groupId);
  const result = await db()
    .prepare("UPDATE participants SET is_absent = ?, updated_at = ? WHERE id = ? AND event_id = ? AND group_id = ?")
    .bind(payload.isAbsent ? 1 : 0, new Date().toISOString(), id, eventId, groupId)
    .run();
  if (!result.meta.changes) {
    throw new Error("更新対象が見つかりません。");
  }
}

export async function copyPreviousEvent(targetEventId: number) {
  await assertAdmin();
  await initialize();
  const now = new Date().toISOString();
  const d1 = db();
  const target = await d1
    .prepare("SELECT id, event_date AS eventDate FROM events WHERE id = ?")
    .bind(targetEventId)
    .first<{ id: number; eventDate: string }>();
  if (!target) throw new Error("コピー先の行事が見つかりません。");
  const previous = await d1
    .prepare("SELECT id FROM events WHERE event_date < ? ORDER BY event_date DESC LIMIT 1")
    .bind(target.eventDate)
    .first<{ id: number }>();
  if (!previous) throw new Error("前月の行事がありません。");

  const existingTarget = await d1
    .prepare("SELECT id FROM participants WHERE event_id = ?")
    .bind(target.id)
    .all<{ id: number }>();
  if (existingTarget.results?.length) {
    await d1.batch([
      d1.prepare("DELETE FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ?)").bind(target.id),
      d1.prepare("DELETE FROM carrier_schedules WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ?)").bind(target.id),
      d1.prepare("DELETE FROM participants WHERE event_id = ?").bind(target.id),
    ]);
  }

  const source = await d1
    .prepare("SELECT id, group_id AS groupId, name, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, ride_driver_participant_id AS rideDriverParticipantId, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText FROM participants WHERE event_id = ? ORDER BY id")
    .bind(previous.id)
    .all<Record<string, unknown>>();
  const oldToNew = new Map<number, number>();
  for (const participant of source.results ?? []) {
    const result = await d1
      .prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?, ?)")
      .bind(target.id, participant.groupId, participant.name, participant.sendanTeaCount, participant.transportType, participant.outboundShuttleId, participant.returnShuttleId, participant.otherRoleText ?? "", now, now)
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

  return { copiedCount: source.results?.length ?? 0 };
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
