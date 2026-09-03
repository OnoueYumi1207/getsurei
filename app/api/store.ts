import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { defaultAbsentMembers, sortParticipantsByRoster } from "../participant-order";

const ROLE_NAMES = [
  "運搬",
  "主弁",
  "MC",
  "儀式",
  "恵比寿大黒天依り代",
  "ありが鯛・仔ありが鯛",
  "設営",
  "銀行",
  "祈願会",
  "研参講師",
  "道具販売",
  "五路財神",
  "太明星",
  "受付",
  "仙丹茶",
  "金剛甘露祈祷（主弁）",
  "金剛甘露祈祷（秡い）",
  "甘露壇",
  "農協",
  "膳食",
  "感謝の誠",
  "泉珠卜占",
  "得道儀式",
  "出店",
  "龍華水増量祈祷",
  "鳴り護摩",
  "フリー",
  "その他",
  "送迎ドライバー",
];

const ROLE_RENAMES = new Map([
  ["大黒天恵比寿依り代", "恵比寿大黒天依り代"],
  ["泉珠銀行", "銀行"],
  ["案内所", "受付"],
  ["送迎調整", "得道儀式"],
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
export const PRE_RELEASE_PUBLIC_EDITING = true;

const PRESET_EVENTS = [
  ["2026-07-12", "7月", "明王招福護摩供"],
  ["2026-08-09", "8月", "明王招福護摩供"],
  ["2026-09-13", "9月", "天地免劫修法"],
  ["2026-10-11", "10月", "明王招福護摩供"],
  ["2026-11-08", "11月", "明王招福護摩供"],
  ["2026-12-13", "12月", "明王招福護摩供"],
] as const;

const SHUTTLES = [
  ["outbound", "北本駅8:20", 2, null],
  ["outbound", "鴻巣駅8:40", null, "スタッフ"],
  ["outbound", "鴻巣駅10:00", null, "一般優先"],
  ["return", "早便(13:40頃)", null, null],
  ["return", "通常(14:40頃)", null, null],
  ["return", "最終", null, null],
] as const;

const INITIALIZATION_VERSION = "2026-09-03-roster-order-1";

let initializationPromise: Promise<void> | null = null;
let masterDataPromise: Promise<{
  groups: Record<string, unknown>[];
  roles: Record<string, unknown>[];
  shuttles: Record<string, unknown>[];
  events: Record<string, unknown>[];
}> | null = null;

export type ParticipantPayload = {
  id?: number;
  eventId: number;
  groupId: number;
  name: string;
  isAbsent: boolean;
  sendanTeaCount: number;
  transportType: "none" | "driver" | "passenger" | "shuttle";
  rideDriverParticipantId: number | null;
  outboundShuttleId: number | null;
  returnShuttleId: number | null;
  usesShuttleSelection?: boolean;
  otherRoleText: string;
  stallRoleText: string;
  nariGomaAltar: string | null;
  nariGomaDuties: string[];
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
  if (initializationPromise) return initializationPromise;
  initializationPromise = runInitialize().catch((error) => {
    initializationPromise = null;
    throw error;
  });
  return initializationPromise;
}

async function runInitialize() {
  const d1 = db();
  await d1
    .prepare("CREATE TABLE IF NOT EXISTS system_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    .run();
  const initialized = await d1
    .prepare("SELECT value FROM system_meta WHERE key = 'initialization_version'")
    .first<{ value: string }>();
  if (initialized?.value === INITIALIZATION_VERSION) {
    return;
  }

  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, event_date TEXT NOT NULL, month_label TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, editor_name TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS shuttle_options (id INTEGER PRIMARY KEY AUTOINCREMENT, direction TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER, note TEXT, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, group_id INTEGER NOT NULL, name TEXT NOT NULL, is_absent INTEGER NOT NULL, sendan_tea_count INTEGER NOT NULL, transport_type TEXT NOT NULL, ride_driver_participant_id INTEGER, outbound_shuttle_id INTEGER, return_shuttle_id INTEGER, other_role_text TEXT, stall_role_text TEXT, nari_goma_altar TEXT, nari_goma_duties TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
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
  await d1
    .prepare("ALTER TABLE participants ADD COLUMN stall_role_text TEXT")
    .run()
    .catch((error) => {
      if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
        throw error;
      }
    });
  await addParticipantColumn(d1, "nari_goma_altar TEXT");
  await addParticipantColumn(d1, "nari_goma_duties TEXT");

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
  } else {
    await syncShuttles(d1);
  }
  for (const [eventDate, monthLabel, eventName] of PRESET_EVENTS) {
    const existing = await d1
      .prepare("SELECT id FROM events WHERE event_date = ?")
      .bind(eventDate)
      .first<{ id: number }>();
    const now = new Date().toISOString();
    if (!existing) {
      await d1
        .prepare("INSERT INTO events (name, event_date, month_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(eventName, eventDate, monthLabel, now, now)
        .run();
    } else {
      await d1
        .prepare("UPDATE events SET name = ?, month_label = ?, updated_at = ? WHERE id = ?")
        .bind(eventName, monthLabel, now, existing.id)
        .run();
      }
  }
  await ensureDefaultAbsentMembers(d1);
  await d1
    .prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('initialization_version', ?)")
    .bind(INITIALIZATION_VERSION)
    .run();
  masterDataPromise = null;
}

async function ensureDefaultAbsentMembers(d1: D1Database) {
  const [groups, events] = await d1.batch([
    d1.prepare("SELECT id, name FROM groups"),
    d1.prepare("SELECT id FROM events"),
  ]);
  const groupIds = new Map(
    (groups.results ?? []).map((group) => [group.name as string, group.id as number]),
  );
  const now = new Date().toISOString();
  const inserts = [];
  for (const member of defaultAbsentMembers()) {
    const groupId = groupIds.get(member.groupName);
    if (!groupId) continue;
    for (const event of events.results ?? []) {
      const eventId = event.id as number;
      const existing = await d1
        .prepare("SELECT id FROM participants WHERE event_id = ? AND group_id = ? AND replace(replace(name, ' ', ''), '　', '') = ?")
        .bind(eventId, groupId, member.name.replace(/[\s\u3000]/g, ""))
        .first();
      if (!existing) {
        inserts.push(
          d1.prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, stall_role_text, nari_goma_altar, nari_goma_duties, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 'none', NULL, NULL, NULL, '', '', NULL, NULL, ?, ?)")
            .bind(eventId, groupId, member.name, now, now),
        );
      }
    }
  }
  if (inserts.length) await d1.batch(inserts);
}

async function addParticipantColumn(d1: D1Database, columnSql: string) {
  await d1
    .prepare(`ALTER TABLE participants ADD COLUMN ${columnSql}`)
    .run()
    .catch((error) => {
      if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
        throw error;
      }
    });
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

async function syncShuttles(d1: D1Database) {
  for (const [index, [direction, name, capacity, note]] of SHUTTLES.entries()) {
    const existing = await d1
      .prepare("SELECT id FROM shuttle_options WHERE direction = ? AND sort_order = ?")
      .bind(direction, index + 1)
      .first<{ id: number }>();
    if (existing) {
      await d1
        .prepare("UPDATE shuttle_options SET name = ?, capacity = ?, note = ?, is_active = 1 WHERE id = ?")
        .bind(name, capacity, note, existing.id)
        .run();
    } else {
      await d1
        .prepare("INSERT INTO shuttle_options (direction, name, capacity, note, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)")
        .bind(direction, name, capacity, note, index + 1)
        .run();
    }
  }
}

async function masterData() {
  if (!masterDataPromise) {
    masterDataPromise = loadMasterData();
  }
  return masterDataPromise;
}

async function loadMasterData() {
  const d1 = db();
  let groups;
  let roles;
  let shuttles;
  let events;
  try {
    [groups, roles, shuttles, events] = await d1.batch([
      d1.prepare("SELECT id, name, editor_name AS editorName FROM groups ORDER BY id"),
      d1.prepare("SELECT id, name, sort_order AS sortOrder FROM roles WHERE is_active = 1 ORDER BY sort_order"),
      d1.prepare("SELECT id, direction, name, capacity, note, sort_order AS sortOrder FROM shuttle_options WHERE is_active = 1 ORDER BY direction, sort_order"),
      d1.prepare("SELECT id, name, event_date AS eventDate, month_label AS monthLabel FROM events ORDER BY event_date ASC"),
    ]);
  } catch {
    await initialize();
    [groups, roles, shuttles, events] = await d1.batch([
      d1.prepare("SELECT id, name, editor_name AS editorName FROM groups ORDER BY id"),
      d1.prepare("SELECT id, name, sort_order AS sortOrder FROM roles WHERE is_active = 1 ORDER BY sort_order"),
      d1.prepare("SELECT id, direction, name, capacity, note, sort_order AS sortOrder FROM shuttle_options WHERE is_active = 1 ORDER BY direction, sort_order"),
      d1.prepare("SELECT id, name, event_date AS eventDate, month_label AS monthLabel FROM events ORDER BY event_date ASC"),
    ]);
  }
  return {
    groups: groups.results ?? [],
    roles: roles.results ?? [],
    shuttles: shuttles.results ?? [],
    events: events.results ?? [],
  };
}

export async function appData(
  requestedEventId?: number | null,
  requestedGroupId?: number | null,
) {
  await initialize();
  const d1 = db();
  const userPromise = getChatGPTUser();
  const { groups, roles, shuttles, events } = await masterData();
  const eventRows = events;
  const activeEventId =
    eventRows.find((event) => event.id === requestedEventId)?.id ??
    eventRows[0]?.id ??
    null;
  const activeGroupId =
    groups.find((group) => group.id === requestedGroupId)?.id ?? null;
  const [participants, participantRoles, schedules] = activeEventId
    ? await d1.batch([
        activeGroupId
          ? d1.prepare("SELECT id, event_id AS eventId, group_id AS groupId, name, is_absent AS isAbsent, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, ride_driver_participant_id AS rideDriverParticipantId, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText, stall_role_text AS stallRoleText, nari_goma_altar AS nariGomaAltar, nari_goma_duties AS nariGomaDuties, created_at AS createdAt, updated_at AS updatedAt FROM participants WHERE event_id = ? AND group_id = ? ORDER BY group_id, id").bind(activeEventId, activeGroupId)
          : d1.prepare("SELECT id, event_id AS eventId, group_id AS groupId, name, is_absent AS isAbsent, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, ride_driver_participant_id AS rideDriverParticipantId, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText, stall_role_text AS stallRoleText, nari_goma_altar AS nariGomaAltar, nari_goma_duties AS nariGomaDuties, created_at AS createdAt, updated_at AS updatedAt FROM participants WHERE event_id = ? ORDER BY group_id, id").bind(activeEventId),
        activeGroupId
          ? d1.prepare("SELECT participant_id AS participantId, role_id AS roleId FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ? AND group_id = ?)").bind(activeEventId, activeGroupId)
          : d1.prepare("SELECT participant_id AS participantId, role_id AS roleId FROM participant_roles WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ?)").bind(activeEventId),
        activeGroupId
          ? d1.prepare("SELECT participant_id AS participantId, outbound_date AS outboundDate, outbound_time AS outboundTime, return_date AS returnDate, return_time AS returnTime FROM carrier_schedules WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ? AND group_id = ?)").bind(activeEventId, activeGroupId)
          : d1.prepare("SELECT participant_id AS participantId, outbound_date AS outboundDate, outbound_time AS outboundTime, return_date AS returnDate, return_time AS returnTime FROM carrier_schedules WHERE participant_id IN (SELECT id FROM participants WHERE event_id = ?)").bind(activeEventId),
      ])
    : [{ results: [] }, { results: [] }, { results: [] }];
  const user = await userPromise;
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
    canPublicEdit: PRE_RELEASE_PUBLIC_EDITING,
    groups: groups.map((group) => ({
      ...group,
      editorNames: [
        group.editorName as string,
        ...ADMIN_EDITORS,
      ],
    })),
    roles,
    shuttles,
    events: eventRows,
    participants: sortParticipantsByRoster(
      groups as { id: number; name: string }[],
      (participants.results ?? []) as { id: number; groupId: number; name: string }[],
    ).map((participant) => ({
      ...participant,
      isAbsent: Boolean(participant.isAbsent),
      otherRoleText: participant.otherRoleText ?? "",
      stallRoleText: participant.stallRoleText ?? "",
      nariGomaAltar: normalizeNariGomaAltar(participant.nariGomaAltar),
      nariGomaDuties: normalizeNariGomaDuties(participant.nariGomaDuties),
      roles: roleMap.get(participant.id as number) ?? [],
      carrierSchedule: normalizeSchedule(scheduleMap.get(participant.id as number)),
    })),
  };
}

export async function assertCanEdit(groupId: number) {
  if (PRE_RELEASE_PUBLIC_EDITING) return;
  const user = await getChatGPTUser();
  if (!user) throw new Error("編集するにはログインしてください。");
  const { groups } = await masterData();
  const group = groups.find((item) => item.id === groupId);
  const editors = [
    group?.editorName as string | undefined,
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
  await initialize();
  await assertCanEdit(payload.groupId);
  const now = new Date().toISOString();
  const d1 = db();
  const clean = normalizePayload(payload);
  const { roles } = await masterData();
  const hasNariGomaRole = clean.roles.some(
    (roleId) => roles.some((role) => role.id === roleId && role.name === "鳴り護摩"),
  );
  const nariGomaAltar = hasNariGomaRole ? clean.nariGomaAltar : null;
  const nariGomaDuties = hasNariGomaRole ? JSON.stringify(clean.nariGomaDuties) : null;

  let participantId = clean.id;
  if (participantId) {
    await d1
      .prepare("UPDATE participants SET name = ?, is_absent = ?, sendan_tea_count = ?, transport_type = ?, ride_driver_participant_id = ?, outbound_shuttle_id = ?, return_shuttle_id = ?, other_role_text = ?, stall_role_text = ?, nari_goma_altar = ?, nari_goma_duties = ?, updated_at = ? WHERE id = ? AND event_id = ? AND group_id = ?")
      .bind(clean.name, clean.isAbsent ? 1 : 0, clean.sendanTeaCount, clean.transportType, clean.rideDriverParticipantId, clean.outboundShuttleId, clean.returnShuttleId, clean.otherRoleText, clean.stallRoleText, nariGomaAltar, nariGomaDuties, now, participantId, clean.eventId, clean.groupId)
      .run();
  } else {
    const result = await d1
      .prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, stall_role_text, nari_goma_altar, nari_goma_duties, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clean.eventId, clean.groupId, clean.name, clean.isAbsent ? 1 : 0, clean.sendanTeaCount, clean.transportType, clean.rideDriverParticipantId, clean.outboundShuttleId, clean.returnShuttleId, clean.otherRoleText, clean.stallRoleText, nariGomaAltar, nariGomaDuties, now, now)
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
  return { participantId, updatedAt: now };
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

  const source = await d1
    .prepare("SELECT id, group_id AS groupId, name, sendan_tea_count AS sendanTeaCount, transport_type AS transportType, outbound_shuttle_id AS outboundShuttleId, return_shuttle_id AS returnShuttleId, other_role_text AS otherRoleText, stall_role_text AS stallRoleText, nari_goma_altar AS nariGomaAltar, nari_goma_duties AS nariGomaDuties FROM participants WHERE event_id = ? ORDER BY id")
    .bind(previous.id)
    .all<Record<string, unknown>>();
  if (!source.results?.length) {
    throw new Error("前月の参加者データが空のため、コピーを中止しました。");
  }

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

  const oldToNew = new Map<number, number>();
  for (const participant of source.results ?? []) {
    const result = await d1
      .prepare("INSERT INTO participants (event_id, group_id, name, is_absent, sendan_tea_count, transport_type, ride_driver_participant_id, outbound_shuttle_id, return_shuttle_id, other_role_text, stall_role_text, nari_goma_altar, nari_goma_duties, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(target.id, participant.groupId, participant.name, participant.sendanTeaCount, participant.transportType, participant.outboundShuttleId, participant.returnShuttleId, participant.otherRoleText ?? "", participant.stallRoleText ?? "", participant.nariGomaAltar ?? null, participant.nariGomaDuties ?? null, now, now)
      .run();
    oldToNew.set(participant.id as number, result.meta.last_row_id);
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
  const roles = Array.from(new Set(payload.roles.map(Number).filter(Boolean)));
  const transportType = ["none", "driver", "passenger", "shuttle"].includes(
    payload.transportType,
  )
    ? payload.transportType
    : "none";
  const usesShuttleSelection =
    transportType === "shuttle" || Boolean(payload.usesShuttleSelection);
  return {
    ...payload,
    name: payload.name.trim(),
    isAbsent: Boolean(payload.isAbsent),
    sendanTeaCount: Math.max(0, Number(payload.sendanTeaCount) || 0),
    transportType,
    rideDriverParticipantId: null,
    outboundShuttleId:
      usesShuttleSelection ? payload.outboundShuttleId : null,
    returnShuttleId:
      usesShuttleSelection ? payload.returnShuttleId : null,
    otherRoleText: payload.otherRoleText?.trim() ?? "",
    stallRoleText: payload.stallRoleText?.trim() ?? "",
    nariGomaAltar: normalizeNariGomaAltar(payload.nariGomaAltar),
    nariGomaDuties: normalizeNariGomaDuties(payload.nariGomaDuties),
    roles,
  };
}

const NARI_GOMA_ALTARS = ["any", "wood", "fire", "earth", "metal", "water"];
const NARI_GOMA_DUTIES = ["any", "saishu", "assistant", "reisa"];

function normalizeNariGomaAltar(value: unknown) {
  return typeof value === "string" && NARI_GOMA_ALTARS.includes(value)
    ? value
    : null;
}

function normalizeNariGomaDuties(value: unknown) {
  let duties: unknown[] = [];
  if (Array.isArray(value)) {
    duties = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      duties = Array.isArray(parsed) ? parsed : value.split(",");
    } catch {
      duties = value.split(",");
    }
  }
  const normalized = Array.from(
    new Set(duties.filter((duty): duty is string => typeof duty === "string" && NARI_GOMA_DUTIES.includes(duty))),
  );
  return normalized.includes("any") ? ["any"] : normalized;
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
