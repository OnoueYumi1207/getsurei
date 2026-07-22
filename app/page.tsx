"use client";

import { useEffect, useMemo, useState } from "react";

type Group = { id: number; name: string; editorName: string };
type Role = { id: number; name: string; sortOrder: number };
type Shuttle = {
  id: number;
  direction: "outbound" | "return";
  name: string;
  capacity: number | null;
  note: string | null;
  sortOrder: number;
};
type EventRecord = {
  id: number;
  name: string;
  eventDate: string;
  monthLabel: string;
};
type Participant = {
  id: number;
  eventId: number;
  groupId: number;
  name: string;
  isAbsent: boolean;
  sendanTeaCount: number;
  transportType: "driver" | "passenger" | "shuttle";
  rideDriverParticipantId: number | null;
  outboundShuttleId: number | null;
  returnShuttleId: number | null;
  roles: number[];
  carrierSchedule: {
    outboundDate: string;
    outboundTime: string;
    returnDate: string;
    returnTime: string;
  } | null;
  updatedAt: string;
};
type AppData = {
  user: { displayName: string; email: string } | null;
  groups: Group[];
  roles: Role[];
  shuttles: Shuttle[];
  events: EventRecord[];
  participants: Participant[];
};

const blankForm = {
  name: "",
  isAbsent: false,
  sendanTeaCount: 0,
  transportType: "driver" as Participant["transportType"],
  rideDriverParticipantId: null as number | null,
  outboundShuttleId: null as number | null,
  returnShuttleId: null as number | null,
  roles: [] as number[],
  carrierSchedule: {
    outboundDate: "",
    outboundTime: "",
    returnDate: "",
    returnTime: "",
  },
};

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | "summary">(1);
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [newMonthDate, setNewMonthDate] = useState("");

  async function loadData(nextEventId = selectedEventId) {
    const response = await fetch("/api/app", { cache: "no-store" });
    const payload = (await response.json()) as AppData;
    setData(payload);
    if (!nextEventId && payload.events[0]) {
      setSelectedEventId(payload.events[0].id);
    }
  }

  useEffect(() => {
    // Initial API hydration is the source of truth for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    const timer = window.setInterval(() => loadData(), 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEvent = data?.events.find((event) => event.id === selectedEventId);
  const selectedGroup =
    selectedGroupId === "summary"
      ? null
      : data?.groups.find((group) => group.id === selectedGroupId);
  const participants = useMemo(
    () =>
      data?.participants.filter(
        (participant) =>
          participant.eventId === selectedEventId &&
          (selectedGroupId === "summary" || participant.groupId === selectedGroupId),
      ) ?? [],
    [data, selectedEventId, selectedGroupId],
  );
  const canEdit =
    Boolean(data?.user && selectedGroup) &&
    data?.user?.displayName === selectedGroup?.editorName;

  function startEdit(participant: Participant | "new") {
    setEditing(participant);
    if (participant === "new") {
      setForm(blankForm);
    } else {
      setForm({
        name: participant.name,
        isAbsent: participant.isAbsent,
        sendanTeaCount: participant.sendanTeaCount,
        transportType: participant.transportType,
        rideDriverParticipantId: participant.rideDriverParticipantId,
        outboundShuttleId: participant.outboundShuttleId,
        returnShuttleId: participant.returnShuttleId,
        roles: participant.roles,
        carrierSchedule:
          participant.carrierSchedule ?? blankForm.carrierSchedule,
      });
    }
  }

  async function saveParticipant() {
    if (!selectedEvent || !selectedGroup || !form.name.trim()) return;
    const id = typeof editing === "object" && editing ? editing.id : undefined;
    const response = await fetch("/api/participants", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        eventId: selectedEvent.id,
        groupId: selectedGroup.id,
        ...form,
        carrierSchedule: form.roles.some((roleId) => roleName(roleId) === "運搬")
          ? form.carrierSchedule
          : null,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "保存できませんでした。");
      return;
    }
    setEditing(null);
    setMessage("保存しました。");
    await loadData(selectedEvent.id);
  }

  async function createMonth() {
    if (!newMonthDate) return;
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventDate: newMonthDate }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "新しい月を作成できませんでした。");
      return;
    }
    setSelectedEventId(payload.event.id);
    setNewMonthDate("");
    setMessage("新しい月を作成しました。");
    await loadData(payload.event.id);
  }

  function roleName(id: number) {
    return data?.roles.find((role) => role.id === id)?.name ?? "";
  }

  function driverOptions() {
    if (!data) return [];
    return data.participants.filter(
      (participant) =>
        participant.eventId === selectedEventId &&
        participant.transportType === "driver" &&
        !participant.isAbsent,
    );
  }

  function shuttleCount(shuttleId: number) {
    return (
      data?.participants.filter(
        (participant) =>
          participant.eventId === selectedEventId &&
          !participant.isAbsent &&
          (participant.outboundShuttleId === shuttleId ||
            participant.returnShuttleId === shuttleId),
      ).length ?? 0
    );
  }

  if (!data || !selectedEvent) {
    return <main className="loading">読み込み中です。</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">参加報告アプリ</p>
          <h1>{selectedEvent.monthLabel} 明王招福護摩供</h1>
        </div>
        <div className="auth-box">
          {data.user ? (
            <>
              <strong>{data.user.displayName}</strong>
              <a href="/signout-with-chatgpt?return_to=/">ログアウト</a>
            </>
          ) : (
            <a className="primary-link" href="/signin-with-chatgpt?return_to=/">
              ログインして編集
            </a>
          )}
        </div>
      </header>

      <section className="controls">
        <label>
          行事
          <select
            value={selectedEventId ?? ""}
            onChange={(event) => setSelectedEventId(Number(event.target.value))}
          >
            {data.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.monthLabel} {event.name}（{formatDate(event.eventDate)}）
              </option>
            ))}
          </select>
        </label>
        <label>
          新しい月
          <input
            type="date"
            value={newMonthDate}
            onChange={(event) => setNewMonthDate(event.target.value)}
          />
        </label>
        <button onClick={createMonth}>前月から作成</button>
      </section>

      <nav className="tabs" aria-label="伝道会">
        {data.groups.map((group) => (
          <button
            key={group.id}
            className={selectedGroupId === group.id ? "active" : ""}
            onClick={() => setSelectedGroupId(group.id)}
          >
            {group.name}
          </button>
        ))}
        <button
          className={selectedGroupId === "summary" ? "active" : ""}
          onClick={() => setSelectedGroupId("summary")}
        >
          全体集計
        </button>
      </nav>

      {selectedGroupId === "summary" ? (
        <Summary data={data} event={selectedEvent} />
      ) : (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">{selectedGroup?.name}</p>
              <h2>参加者一覧</h2>
            </div>
            <button disabled={!canEdit} onClick={() => startEdit("new")}>
              ＋参加者を追加
            </button>
          </div>
          {!canEdit && (
            <p className="notice">
              {data.user
                ? "この伝道会は閲覧のみです。"
                : "編集するにはログインしてください。"}
            </p>
          )}
          {message && <p className="notice">{message}</p>}
          <ParticipantTable
            participants={participants}
            data={data}
            canEdit={canEdit}
            onEdit={startEdit}
          />
          <p className="updated">
            最終更新：{latestUpdatedAt(participants)}
          </p>
        </section>
      )}

      {editing && selectedGroup && (
        <div className="modal-backdrop">
          <section className="modal" aria-label="参加者編集">
            <div className="section-head">
              <h2>{editing === "new" ? "参加者を追加" : "参加者を編集"}</h2>
              <button onClick={() => setEditing(null)}>閉じる</button>
            </div>
            <div className="form-grid">
              <label>
                氏名
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.isAbsent}
                  onChange={(event) =>
                    setForm({ ...form, isAbsent: event.target.checked })
                  }
                />
                欠席
              </label>
              <label>
                仙丹茶
                <input
                  type="number"
                  min="0"
                  value={form.sendanTeaCount}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sendanTeaCount: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>担当</legend>
              <div className="checkbox-grid">
                {data.roles.map((role) => (
                  <label key={role.id} className="checkline">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(role.id)}
                      onChange={(event) => {
                        setForm({
                          ...form,
                          roles: event.target.checked
                            ? [...form.roles, role.id]
                            : form.roles.filter((id) => id !== role.id),
                        });
                      }}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.roles.some((roleId) => roleName(roleId) === "運搬") && (
              <fieldset>
                <legend>運搬日時</legend>
                <div className="form-grid four">
                  <label>
                    往路 日付
                    <input
                      type="date"
                      value={form.carrierSchedule.outboundDate}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          carrierSchedule: {
                            ...form.carrierSchedule,
                            outboundDate: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    往路 時間
                    <input
                      type="time"
                      value={form.carrierSchedule.outboundTime}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          carrierSchedule: {
                            ...form.carrierSchedule,
                            outboundTime: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    復路 日付
                    <input
                      type="date"
                      value={form.carrierSchedule.returnDate}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          carrierSchedule: {
                            ...form.carrierSchedule,
                            returnDate: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    復路 時間
                    <input
                      type="time"
                      value={form.carrierSchedule.returnTime}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          carrierSchedule: {
                            ...form.carrierSchedule,
                            returnTime: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend>移動手段</legend>
              <div className="radio-row">
                {[
                  ["driver", "ドライバー"],
                  ["passenger", "同乗"],
                  ["shuttle", "送迎希望"],
                ].map(([value, label]) => (
                  <label key={value} className="checkline">
                    <input
                      type="radio"
                      name="transport"
                      checked={form.transportType === value}
                      onChange={() =>
                        setForm({
                          ...form,
                          transportType: value as Participant["transportType"],
                          rideDriverParticipantId: null,
                          outboundShuttleId: null,
                          returnShuttleId: null,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.transportType === "passenger" && (
              <label>
                同乗するドライバー
                <select
                  value={form.rideDriverParticipantId ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rideDriverParticipantId: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">選択してください</option>
                  {driverOptions().map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.transportType === "shuttle" && (
              <div className="form-grid">
                <ShuttleSelect
                  label="往路"
                  shuttles={data.shuttles.filter((s) => s.direction === "outbound")}
                  value={form.outboundShuttleId}
                  counts={shuttleCount}
                  onChange={(id) => setForm({ ...form, outboundShuttleId: id })}
                />
                <ShuttleSelect
                  label="復路"
                  shuttles={data.shuttles.filter((s) => s.direction === "return")}
                  value={form.returnShuttleId}
                  counts={shuttleCount}
                  onChange={(id) => setForm({ ...form, returnShuttleId: id })}
                />
              </div>
            )}
            <div className="actions">
              <button className="primary" onClick={saveParticipant}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function ParticipantTable({
  participants,
  data,
  canEdit,
  onEdit,
}: {
  participants: Participant[];
  data: AppData;
  canEdit: boolean;
  onEdit: (participant: Participant) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>欠席</th>
            <th>氏名</th>
            <th>担当</th>
            <th>仙丹茶</th>
            <th>移動手段</th>
            <th>往路</th>
            <th>復路</th>
            {canEdit && <th>編集</th>}
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id} className={participant.isAbsent ? "absent" : ""}>
              <td>{participant.isAbsent ? "欠席" : ""}</td>
              <td>{participant.name}</td>
              <td>
                {participant.roles
                  .map((id) => data.roles.find((role) => role.id === id)?.name)
                  .filter(Boolean)
                  .join("、") || <span className="pending">未定</span>}
              </td>
              <td>{participant.sendanTeaCount}</td>
              <td>{transportLabel(participant, data)}</td>
              <td>{routeLabel(participant, data, "outbound")}</td>
              <td>{routeLabel(participant, data, "return")}</td>
              {canEdit && (
                <td>
                  <button onClick={() => onEdit(participant)}>編集</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ data, event }: { data: AppData; event: EventRecord }) {
  const active = data.participants.filter(
    (participant) => participant.eventId === event.id && !participant.isAbsent,
  );
  const drivers = active.filter((participant) => participant.transportType === "driver");
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">全伝道会</p>
          <h2>全体集計</h2>
        </div>
        <div className="report-links">
          <a href={`/reports/participants?eventId=${event.id}`} target="_blank">
            参加者名簿
          </a>
          <a href={`/reports/roles?eventId=${event.id}`} target="_blank">
            担当名簿
          </a>
          <a href={`/reports/shuttles?eventId=${event.id}`} target="_blank">
            送迎名簿
          </a>
        </div>
      </div>
      <div className="stats">
        <div>
          <span>総参加人数</span>
          <strong>{active.length}名</strong>
        </div>
        <div>
          <span>自家用車</span>
          <strong>{drivers.length}台</strong>
        </div>
      </div>
      <h3>送迎人数</h3>
      <div className="summary-grid">
        {data.shuttles.map((shuttle) => {
          const users = active.filter(
            (participant) =>
              participant.outboundShuttleId === shuttle.id ||
              participant.returnShuttleId === shuttle.id,
          );
          return (
            <details key={shuttle.id} className="summary-item">
              <summary>
                <span>
                  {shuttle.direction === "outbound" ? "往路" : "復路"} {shuttle.name}
                  {shuttle.capacity ? `（定員${shuttle.capacity}名）` : ""}
                  {shuttle.note ? `（${shuttle.note}）` : ""}
                </span>
                <strong>{users.length}名</strong>
              </summary>
              {shuttle.capacity && users.length > shuttle.capacity && (
                <p className="warning">定員を超えています。運営側で調整してください。</p>
              )}
              <p>{users.map((user) => user.name).join("、") || "利用者なし"}</p>
            </details>
          );
        })}
      </div>
      <h3>担当一覧</h3>
      <div className="role-list">
        {data.roles.map((role) => {
          const members = active.filter((participant) =>
            participant.roles.includes(role.id),
          );
          return (
            <div key={role.id} className="role-row">
              <strong>{role.name}</strong>
              <span className={members.length ? "" : "pending"}>
                {members.map((member) => member.name).join("、") || "未定"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShuttleSelect({
  label,
  shuttles,
  value,
  counts,
  onChange,
}: {
  label: string;
  shuttles: Shuttle[];
  value: number | null;
  counts: (id: number) => number;
  onChange: (id: number | null) => void;
}) {
  const selected = shuttles.find((shuttle) => shuttle.id === value);
  const isOver = Boolean(
    selected?.capacity && counts(selected.id) >= selected.capacity,
  );
  return (
    <label>
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">選択してください</option>
        {shuttles.map((shuttle) => (
          <option key={shuttle.id} value={shuttle.id}>
            {shuttle.name}
            {shuttle.capacity ? `（定員${shuttle.capacity}名）` : ""}
            {shuttle.note ? `（${shuttle.note}）` : ""}
          </option>
        ))}
      </select>
      {isOver && (
        <span className="warning">定員を超えます。登録はできます。</span>
      )}
    </label>
  );
}

function transportLabel(participant: Participant, data: AppData) {
  if (participant.transportType === "driver") return "ドライバー";
  if (participant.transportType === "passenger") {
    const driver = data.participants.find(
      (item) => item.id === participant.rideDriverParticipantId,
    );
    return `同乗${driver ? `（${driver.name}）` : ""}`;
  }
  return "送迎希望";
}

function routeLabel(
  participant: Participant,
  data: AppData,
  direction: "outbound" | "return",
) {
  if (participant.transportType !== "shuttle") {
    const schedule = participant.carrierSchedule;
    if (!schedule) return "";
    return direction === "outbound"
      ? [schedule.outboundDate, schedule.outboundTime].filter(Boolean).join(" ")
      : [schedule.returnDate, schedule.returnTime].filter(Boolean).join(" ");
  }
  const id =
    direction === "outbound"
      ? participant.outboundShuttleId
      : participant.returnShuttleId;
  return data.shuttles.find((shuttle) => shuttle.id === id)?.name ?? "";
}

function latestUpdatedAt(participants: Participant[]) {
  if (!participants.length) return "未更新";
  const latest = participants
    .map((participant) => new Date(participant.updatedAt).getTime())
    .sort((a, b) => b - a)[0];
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(latest);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
