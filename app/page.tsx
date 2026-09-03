"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sortParticipantsByRoster } from "./participant-order";

type Group = { id: number; name: string; editorName: string; editorNames: string[] };
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
  transportType: "none" | "driver" | "passenger" | "shuttle";
  rideDriverParticipantId: number | null;
  outboundShuttleId: number | null;
  returnShuttleId: number | null;
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
  updatedAt: string;
};
type AppData = {
  user: { displayName: string; email: string } | null;
  isAdmin: boolean;
  canPublicEdit?: boolean;
  groups: Group[];
  roles: Role[];
  shuttles: Shuttle[];
  events: EventRecord[];
  participants: Participant[];
};
type SelectedGroupId = number | "summary" | null;
type SaveParticipantResponse = {
  ok?: boolean;
  participantId?: number;
  updatedAt?: string;
  error?: string;
};
type ApiErrorResponse = { error?: string };

const selectedEventStorageKey = "myoo-goma-selected-event-id";
const selectedGroupStorageKey = "myoo-goma-selected-group-id";
const nariGomaAltars = [
  ["any", "どれでも可"],
  ["wood", "木"],
  ["fire", "火"],
  ["earth", "土"],
  ["metal", "金"],
  ["water", "水"],
] as const;
const nariGomaDuties = [
  ["any", "どれでも可"],
  ["saishu", "斎主"],
  ["assistant", "補佐"],
  ["reisa", "霊査"],
] as const;
const groupPathByName = new Map([
  ["大江戸", "ooedo"],
  ["お台場", "odaiba"],
  ["羽田", "haneda"],
  ["かながわ", "kanagawa"],
  ["富士山", "fujisan"],
  ["駿天", "sunten"],
  ["埼玉", "saitama"],
  ["千葉", "chiba"],
  ["山梨", "yamanashi"],
]);

const blankForm = {
  name: "",
  attendanceOnly: false,
  isAbsent: false,
  sendanTeaCount: 0,
  transportType: "none" as Participant["transportType"],
  rideDriverParticipantId: null as number | null,
  outboundShuttleId: null as number | null,
  returnShuttleId: null as number | null,
  otherRoleText: "",
  stallRoleText: "",
  nariGomaAltar: "any" as string | null,
  nariGomaDuties: ["any"] as string[],
  roles: [] as number[],
  carrierSchedule: {
    outboundDate: "",
    outboundTime: "",
    returnDate: "",
    returnTime: "",
  },
};

function readStoredEventId() {
  const value =
    new URLSearchParams(window.location.search).get("eventId") ??
    window.localStorage.getItem(selectedEventStorageKey);
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function readStoredGroupId(groups: Group[] = []): SelectedGroupId {
  const pathTab = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (pathTab === "shuukei") return "summary";
  const pathGroup = groups.find((group) => groupPath(group) === pathTab);
  if (pathGroup) return pathGroup.id;
  const value =
    new URLSearchParams(window.location.search).get("groupId") ??
    window.localStorage.getItem(selectedGroupStorageKey);
  if (value === "summary") return "summary";
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function groupPath(group: Group) {
  return groupPathByName.get(group.name) ?? `group-${group.id}`;
}

function isTenchiEvent(event?: EventRecord) {
  return event?.name === "天地免劫修法";
}

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<SelectedGroupId>(null);
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const otherRoleInputRef = useRef<HTMLInputElement>(null);

  function tabPath(nextGroupId: SelectedGroupId) {
    if (!nextGroupId) return;
    if (nextGroupId === "summary") {
      return "/shuukei";
    }
    const group = data?.groups.find((item) => item.id === nextGroupId);
    return group ? `/${groupPath(group)}` : undefined;
  }

  function replaceTabUrl(nextGroupId: SelectedGroupId, eventId: number) {
    const path = tabPath(nextGroupId);
    if (path) window.history.pushState(null, "", `${path}?eventId=${eventId}`);
  }

  function replaceCurrentEventUrl(eventId: number) {
    const path = tabPath(selectedGroupId);
    if (path) window.history.replaceState(null, "", `${path}?eventId=${eventId}`);
  }

  const loadData = useCallback(async (nextEventId?: number | null) => {
    setIsRefreshing(true);
    try {
      setLoadError("");
      const requestedEventId = nextEventId ?? readStoredEventId();
      const query = new URLSearchParams({ t: String(Date.now()) });
      if (requestedEventId) query.set("eventId", String(requestedEventId));
      const response = await fetch(`/api/app?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as AppData & ApiErrorResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "読み込みに失敗しました。");
      }
      setData(payload);
      setSelectedEventId((current) => {
        const requested = nextEventId ?? current;
        if (requested && payload.events.some((event) => event.id === requested)) {
          return requested;
        }
        const stored = readStoredEventId();
        if (stored && payload.events.some((event) => event.id === stored)) {
          return stored;
        }
        return payload.events[0]?.id ?? null;
      });
      setSelectedGroupId((current) => {
        if (
          current === "summary" ||
          (current && payload.groups.some((group) => group.id === current))
        ) {
          return current;
        }
        const stored = readStoredGroupId(payload.groups);
        if (
          stored === "summary" ||
          (stored && payload.groups.some((group) => group.id === stored))
        ) {
          return stored;
        }
        return payload.groups[0]?.id ?? null;
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "読み込みに失敗しました。",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial API hydration is the source of truth for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (editing) {
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [editing]);

  useEffect(() => {
    if (selectedEventId) {
      window.localStorage.setItem(selectedEventStorageKey, String(selectedEventId));
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedGroupId) {
      window.localStorage.setItem(selectedGroupStorageKey, String(selectedGroupId));
    }
  }, [selectedGroupId]);

  useEffect(() => {
    function handlePopState() {
      if (!data) return;
      const nextGroupId = readStoredGroupId(data.groups);
      if (
        nextGroupId === "summary" ||
        (nextGroupId && data.groups.some((group) => group.id === nextGroupId))
      ) {
        setSelectedGroupId(nextGroupId);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [data]);

  function switchTab(nextGroupId: SelectedGroupId) {
    if (!selectedEvent || !nextGroupId) return;
    setSelectedGroupId(nextGroupId);
    setEditing(null);
    replaceTabUrl(nextGroupId, selectedEvent.id);
  }

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
  const visibleRoles =
    data?.roles.filter(
      (role) => role.name !== "鳴り護摩" || isTenchiEvent(selectedEvent),
    ) ?? [];
  const canEdit =
    Boolean(selectedGroup) &&
    (Boolean(data?.canPublicEdit) ||
      Boolean(
        data?.user &&
          selectedGroup?.editorNames.includes(data.user.displayName),
      ));

  function startEdit(participant: Participant | "new") {
    setEditing(participant);
    if (participant === "new") {
      setForm(blankForm);
    } else {
      const hasShuttleDriverRole = participant.roles.some(
        (roleId) => roleName(roleId) === "送迎ドライバー",
      );
      setForm({
        name: participant.name,
        attendanceOnly: !participant.isAbsent && participant.roles.length === 0,
        isAbsent: participant.isAbsent,
        sendanTeaCount: participant.sendanTeaCount,
        transportType:
          hasShuttleDriverRole && participant.transportType === "shuttle"
            ? "none"
            : participant.transportType,
        rideDriverParticipantId: participant.rideDriverParticipantId,
        outboundShuttleId: participant.outboundShuttleId,
        returnShuttleId: participant.returnShuttleId,
        otherRoleText: participant.otherRoleText ?? "",
        stallRoleText: participant.stallRoleText ?? "",
        nariGomaAltar: participant.nariGomaAltar ?? "any",
        nariGomaDuties: participant.nariGomaDuties?.length
          ? participant.nariGomaDuties
          : ["any"],
        roles: participant.roles,
        carrierSchedule:
          participant.carrierSchedule ?? blankForm.carrierSchedule,
      });
    }
  }

  async function saveParticipant() {
    if (!selectedEvent || !selectedGroup || !form.name.trim()) return;
    const id = typeof editing === "object" && editing ? editing.id : undefined;
    const selectedRoles = form.attendanceOnly ? [] : form.roles;
    const hasShuttleDriverRole = selectedRoles.some(
      (roleId) => roleName(roleId) === "送迎ドライバー",
    );
    const hasNariGomaRole = selectedRoles.some(
      (roleId) => roleName(roleId) === "鳴り護摩",
    );
    const savedTransportType = hasShuttleDriverRole ? "driver" : form.transportType;
    const usesShuttleSelection =
      savedTransportType === "shuttle" || hasShuttleDriverRole;
    const response = await fetch("/api/participants", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        eventId: selectedEvent.id,
        groupId: selectedGroup.id,
        ...form,
        transportType: savedTransportType,
        isAbsent: form.attendanceOnly ? false : form.isAbsent,
        roles: selectedRoles,
        nariGomaAltar: hasNariGomaRole ? form.nariGomaAltar : null,
        nariGomaDuties: hasNariGomaRole ? form.nariGomaDuties : [],
        rideDriverParticipantId: null,
        usesShuttleSelection,
        outboundShuttleId: usesShuttleSelection ? form.outboundShuttleId : null,
        returnShuttleId: usesShuttleSelection ? form.returnShuttleId : null,
        carrierSchedule: selectedRoles.some((roleId) => roleName(roleId) === "運搬")
          ? form.carrierSchedule
          : null,
      }),
    });
    const payload = (await response.json()) as SaveParticipantResponse;
    if (!response.ok) {
      setMessage(payload.error ?? "保存できませんでした。");
      return;
    }
    const participantId = payload.participantId ?? id;
    if (!participantId) {
      setMessage("保存結果を確認できませんでした。更新ボタンで確認してください。");
      return;
    }
    const savedParticipant: Participant = {
      id: participantId,
      eventId: selectedEvent.id,
      groupId: selectedGroup.id,
      name: form.name.trim(),
      isAbsent: form.attendanceOnly ? false : form.isAbsent,
      sendanTeaCount: Math.max(0, Number(form.sendanTeaCount) || 0),
      transportType: savedTransportType,
      rideDriverParticipantId: null,
      outboundShuttleId:
        usesShuttleSelection ? form.outboundShuttleId : null,
      returnShuttleId:
        usesShuttleSelection ? form.returnShuttleId : null,
      otherRoleText: form.otherRoleText.trim(),
      stallRoleText: form.stallRoleText.trim(),
      nariGomaAltar: hasNariGomaRole ? form.nariGomaAltar : null,
      nariGomaDuties: hasNariGomaRole ? form.nariGomaDuties : [],
      roles: selectedRoles,
      carrierSchedule: selectedRoles.some((roleId) => roleName(roleId) === "運搬")
        ? form.carrierSchedule
        : null,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
    };
    setData((current) => {
      if (!current) return current;
      const withoutSaved = current.participants.filter(
        (participant) => participant.id !== savedParticipant.id,
      );
      return {
        ...current,
        participants: sortParticipantsByRoster(
          current.groups,
          [...withoutSaved, savedParticipant],
        ),
      };
    });
    setEditing(null);
    setMessage("保存しました。");
  }

  async function copyFromPreviousMonth() {
    if (!selectedEvent) return;
    const hasParticipants = data?.participants.some(
      (participant) => participant.eventId === selectedEvent.id,
    );
    if (hasParticipants) {
      const confirmed = window.confirm(
        `${selectedEvent.monthLabel}の参加者を前月データで上書きします。よろしいですか？`,
      );
      if (!confirmed) return;
    }
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: selectedEvent.id }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "前月からコピーできませんでした。");
      return;
    }
    setMessage(`${payload.copiedCount ?? 0}名を前月からコピーしました。`);
    await loadData(selectedEvent.id);
  }

  async function deleteParticipant(participant: Participant) {
    if (!selectedEvent || !selectedGroup) return;
    const confirmed = window.confirm(`${participant.name}さんを削除します。よろしいですか？`);
    if (!confirmed) return;
    const response = await fetch("/api/participants", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: participant.id,
        eventId: selectedEvent.id,
        groupId: selectedGroup.id,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "削除できませんでした。");
      return;
    }
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        participants: current.participants
          .filter((item) => item.id !== participant.id)
          .map((item) =>
            item.rideDriverParticipantId === participant.id
              ? { ...item, rideDriverParticipantId: null }
              : item,
          ),
      };
    });
    setMessage("削除しました。");
  }

  async function updateAbsence(participant: Participant, isAbsent: boolean) {
    if (!selectedEvent || !selectedGroup) return;
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        participants: current.participants.map((item) =>
          item.id === participant.id ? { ...item, isAbsent } : item,
        ),
      };
    });
    const response = await fetch("/api/participants", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: participant.id,
        eventId: selectedEvent.id,
        groupId: selectedGroup.id,
        isAbsent,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "欠席状態を更新できませんでした。");
      await loadData(selectedEvent.id);
      return;
    }
    setMessage(isAbsent ? "欠席にしました。" : "参加に戻しました。");
  }

  function roleName(id: number) {
    return data?.roles.find((role) => role.id === id)?.name ?? "";
  }

  function formHasRole(name: string) {
    return form.roles.some((roleId) => roleName(roleId) === name);
  }

  function shuttleCount(shuttleId: number) {
    return (
      data?.participants.filter(
        (participant) =>
          participant.eventId === selectedEventId &&
          !participant.isAbsent &&
          participant.transportType === "shuttle" &&
          !participant.roles.some((roleId) => roleName(roleId) === "送迎ドライバー") &&
          (participant.outboundShuttleId === shuttleId ||
            participant.returnShuttleId === shuttleId),
      ).length ?? 0
    );
  }

  if ((!data || !selectedEvent || !selectedGroupId) && loadError) {
    return (
      <main className="loading">
        <section className="load-error">
          <h1>読み込みに失敗しました。</h1>
          <p>{loadError}</p>
          <button disabled={isRefreshing} onClick={() => loadData(selectedEventId)}>
            {isRefreshing ? "再読み込み中" : "再読み込み"}
          </button>
        </section>
      </main>
    );
  }

  if (!data || !selectedEvent || !selectedGroupId) {
    return <main className="loading">読み込み中です。</main>;
  }

  const formHasShuttleDriverRole = formHasRole("送迎ドライバー");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">参加報告アプリ</p>
          <h1>{selectedEvent.monthLabel} {selectedEvent.name}</h1>
        </div>
        <div className="auth-box">
          {data.user ? (
            <>
              <strong>{data.user.displayName}</strong>
              <Link href="/signout-with-chatgpt?return_to=/">ログアウト</Link>
            </>
          ) : data.canPublicEdit ? (
            <span>お試し公開中：ログインなしで入力できます</span>
          ) : (
            <Link className="primary-link" href="/signin-with-chatgpt?return_to=/">
              ログインして編集
            </Link>
          )}
        </div>
      </header>

      <section className="controls">
        <label>
          行事
          <select
            value={selectedEventId ?? ""}
            onChange={(event) => {
              const nextEventId = Number(event.target.value);
              setSelectedEventId(nextEventId);
              replaceCurrentEventUrl(nextEventId);
              loadData(nextEventId);
            }}
          >
            {data.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.monthLabel} {event.name}（{formatDate(event.eventDate)}）
              </option>
            ))}
          </select>
        </label>
        <button disabled={!data.isAdmin} onClick={copyFromPreviousMonth}>
          前月からコピー
        </button>
        <button disabled={isRefreshing} onClick={() => loadData(selectedEventId)}>
          {isRefreshing ? "更新中" : "更新"}
        </button>
      </section>
      {!data.isAdmin && data.user && (
        <p className="admin-note">前月からコピーは管理者のみ実行できます。</p>
      )}
      {loadError && <p className="admin-note">最新情報を取得できませんでした：{loadError}</p>}

      <nav className="tabs" aria-label="伝道会">
        {data.groups.map((group) => (
          <a
            key={group.id}
            className={selectedGroupId === group.id ? "active" : ""}
            href={`/${groupPath(group)}?eventId=${selectedEvent.id}`}
            onClick={(event) => {
              event.preventDefault();
              switchTab(group.id);
            }}
          >
            {group.name}
          </a>
        ))}
        <a
          className={selectedGroupId === "summary" ? "active" : ""}
          href={`/shuukei?eventId=${selectedEvent.id}`}
          onClick={(event) => {
            event.preventDefault();
            switchTab("summary");
          }}
        >
          全体集計
        </a>
        <a
          href={`/sanka?eventId=${selectedEvent.id}`}
        >
          参加者名簿
        </a>
        <a
          href={`/busho?eventId=${selectedEvent.id}`}
        >
          部署名簿
        </a>
        <a
          href={`/sougei?eventId=${selectedEvent.id}`}
        >
          送迎名簿
        </a>
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
            onDelete={deleteParticipant}
            onAbsenceChange={updateAbsence}
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
            <div className="form-grid participant-basic">
              <label>
                参加者名
                <input
                  ref={nameInputRef}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <div className="attendance-choice" aria-label="参加状態">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={form.attendanceOnly}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        attendanceOnly: event.target.checked,
                        isAbsent: false,
                        roles: event.target.checked ? [] : form.roles,
                      })
                    }
                  />
                  参加のみ
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={form.isAbsent}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        attendanceOnly: false,
                        isAbsent: event.target.checked,
                      })
                    }
                  />
                  欠席
                </label>
              </div>
              <label>
                仙丹茶
                <input
                  type="number"
                  min="0"
                  value={form.sendanTeaCount}
                  onFocus={(event) => {
                    if (event.target.value === "0") {
                      event.target.select();
                    }
                  }}
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
              <legend>部署</legend>
              <div className="checkbox-grid">
                {visibleRoles.map((role) => {
                  const checked = form.roles.includes(role.id);
                  const toggleRole = (isChecked: boolean) => {
                    setForm({
                      ...form,
                      attendanceOnly: isChecked ? false : form.attendanceOnly,
                      isAbsent: isChecked ? false : form.isAbsent,
                      roles: isChecked
                        ? [...form.roles, role.id]
                        : form.roles.filter((id) => id !== role.id),
                    });
                  };
                  if (role.name === "出店") {
                    return (
                      <div key={role.id} className="other-role-control">
                        <label className="checkline">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const isChecked = event.target.checked;
                              setForm({
                                ...form,
                                attendanceOnly: isChecked ? false : form.attendanceOnly,
                                isAbsent: isChecked ? false : form.isAbsent,
                                stallRoleText: isChecked ? form.stallRoleText : "",
                                roles: isChecked
                                  ? [...form.roles, role.id]
                                  : form.roles.filter((id) => id !== role.id),
                              });
                            }}
                          />
                          出店（
                        </label>
                        <input
                          aria-label="出店の内容"
                          placeholder="焼きそば、たこ焼き など"
                          value={form.stallRoleText}
                          onChange={(event) =>
                            setForm({ ...form, stallRoleText: event.target.value })
                          }
                        />
                        <span>）</span>
                      </div>
                    );
                  }
                  if (role.name === "その他") {
                    return (
                      <div key={role.id} className="other-role-control">
                        <label className="checkline">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const isChecked = event.target.checked;
                              setForm({
                                ...form,
                                attendanceOnly: isChecked ? false : form.attendanceOnly,
                                isAbsent: isChecked ? false : form.isAbsent,
                                otherRoleText: isChecked ? form.otherRoleText : "",
                                roles: isChecked
                                  ? [...form.roles, role.id]
                                  : form.roles.filter((id) => id !== role.id),
                              });
                              if (isChecked) {
                                window.setTimeout(() => otherRoleInputRef.current?.focus(), 0);
                              }
                            }}
                          />
                          その他（
                        </label>
                        <input
                          ref={otherRoleInputRef}
                          aria-label="その他の部署内容"
                          placeholder="記入欄"
                          value={form.otherRoleText}
                          onChange={(event) =>
                            setForm({ ...form, otherRoleText: event.target.value })
                          }
                        />
                        <span>）</span>
                      </div>
                    );
                  }
                  if (role.name === "鳴り護摩") {
                    const toggleNariGomaDuty = (duty: string, isChecked: boolean) => {
                      let nextDuties = form.nariGomaDuties;
                      if (duty === "any") {
                        nextDuties = isChecked ? ["any"] : [];
                      } else {
                        nextDuties = isChecked
                          ? [...nextDuties.filter((item) => item !== "any"), duty]
                          : nextDuties.filter((item) => item !== duty);
                      }
                      setForm({
                        ...form,
                        nariGomaDuties: nextDuties.length ? nextDuties : ["any"],
                      });
                    };
                    return (
                      <div key={role.id} className="nari-goma-control">
                        <label className="checkline nari-goma-main">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const isChecked = event.target.checked;
                              setForm({
                                ...form,
                                attendanceOnly: isChecked ? false : form.attendanceOnly,
                                isAbsent: isChecked ? false : form.isAbsent,
                                nariGomaAltar: isChecked ? form.nariGomaAltar ?? "any" : "any",
                                nariGomaDuties: isChecked
                                  ? form.nariGomaDuties.length
                                    ? form.nariGomaDuties
                                    : ["any"]
                                  : ["any"],
                                roles: isChecked
                                  ? [...form.roles, role.id]
                                  : form.roles.filter((id) => id !== role.id),
                              });
                            }}
                          />
                          鳴り護摩
                        </label>
                        {checked && (
                          <div className="nari-goma-options">
                            <span className="nari-goma-label">壇</span>
                            <div className="nari-goma-choice-row">
                              {nariGomaAltars.map(([value, label]) => (
                                <label key={value} className="checkline">
                                  <input
                                    type="radio"
                                    name="nari-goma-altar"
                                    checked={form.nariGomaAltar === value}
                                    onChange={() =>
                                      setForm({ ...form, nariGomaAltar: value })
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            <span className="nari-goma-label">役目</span>
                            <div className="nari-goma-choice-row">
                              {nariGomaDuties.map(([value, label]) => (
                                <label key={value} className="checkline">
                                  <input
                                    type="checkbox"
                                    checked={form.nariGomaDuties.includes(value)}
                                    onChange={(event) =>
                                      toggleNariGomaDuty(value, event.target.checked)
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (role.name === "送迎ドライバー") {
                    return (
                      <div key={role.id} className="department-shuttle-control">
                        <label className="checkline">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const isChecked = event.target.checked;
                              setForm({
                                ...form,
                                attendanceOnly: isChecked ? false : form.attendanceOnly,
                                isAbsent: isChecked ? false : form.isAbsent,
                                transportType: isChecked ? "driver" : form.transportType,
                                roles: isChecked
                                  ? [...form.roles, role.id]
                                  : form.roles.filter((id) => id !== role.id),
                              });
                            }}
                          />
                          {role.name}
                        </label>
                        {checked && (
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
                      </div>
                    );
                  }
                  return (
                    <label key={role.id} className="checkline">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleRole(event.target.checked)}
                      />
                      {role.name}
                    </label>
                  );
                })}
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
                  ["none", "選択なし"],
                  ["driver", "ドライバー"],
                  ["passenger", "同乗"],
                  ["shuttle", "送迎希望"],
                ].map(([value, label]) => (
                  <label key={value} className="checkline">
                    <input
                      type="radio"
                      name="transport"
                      disabled={formHasShuttleDriverRole && value !== "driver"}
                      checked={
                        formHasShuttleDriverRole
                          ? value === "driver"
                          : form.transportType === value
                      }
                      onChange={() => {
                        const keepShuttleSelection = formHasRole("送迎ドライバー");
                        setForm({
                          ...form,
                          transportType: value as Participant["transportType"],
                          rideDriverParticipantId: null,
                          outboundShuttleId: keepShuttleSelection
                            ? form.outboundShuttleId
                            : null,
                          returnShuttleId: keepShuttleSelection
                            ? form.returnShuttleId
                            : null,
                        });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {form.transportType === "shuttle" && !formHasShuttleDriverRole && (
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
  onDelete,
  onAbsenceChange,
}: {
  participants: Participant[];
  data: AppData;
  canEdit: boolean;
  onEdit: (participant: Participant) => void;
  onDelete: (participant: Participant) => void;
  onAbsenceChange: (participant: Participant, isAbsent: boolean) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="participant-table">
        <thead>
          <tr>
            <th>欠席</th>
            <th>参加者名</th>
            <th>部署</th>
            <th>仙丹茶</th>
            <th>移動手段</th>
            <th>往路</th>
            <th>復路</th>
            {canEdit && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id} className={participant.isAbsent ? "absent" : ""}>
              <td>
                <label className="absence-toggle">
                  <input
                    type="checkbox"
                    checked={participant.isAbsent}
                    disabled={!canEdit}
                    onChange={(event) =>
                      onAbsenceChange(participant, event.target.checked)
                    }
                    aria-label={`${participant.name}さんを欠席にする`}
                  />
                </label>
              </td>
              <td>{participant.name}</td>
              <td>
                {roleLabels(data, participant).join("、")}
              </td>
              <td className="count-cell">{participant.sendanTeaCount}</td>
              <td className="transport-cell">{transportLabel(participant, data)}</td>
              <td className="route-cell">{routeLabel(participant, data, "outbound")}</td>
              <td className="route-cell">{routeLabel(participant, data, "return")}</td>
              {canEdit && (
                <td className="row-actions">
                  <button onClick={() => onEdit(participant)}>編集</button>
                  <button
                    className="danger"
                    onClick={() => onDelete(participant)}
                  >
                    削除
                  </button>
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
  const sendanTeaTotal = active.reduce(
    (total, participant) => total + participant.sendanTeaCount,
    0,
  );
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">全伝道会</p>
          <h2>全体集計</h2>
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
        <div>
          <span>仙丹茶</span>
          <strong>{sendanTeaTotal}本</strong>
        </div>
      </div>
      <h3>送迎人数</h3>
      <div className="summary-grid">
        {data.shuttles.map((shuttle) => {
          const users = active.filter(
            (participant) =>
              participant.transportType === "shuttle" &&
              !participantHasRole(data, participant, "送迎ドライバー") &&
              (participant.outboundShuttleId === shuttle.id ||
                participant.returnShuttleId === shuttle.id),
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
              <p>{users.map((user) => user.name).join("、") || "0"}</p>
            </details>
          );
        })}
      </div>
      <h3>部署一覧</h3>
      <div className="role-list">
        {data.roles
          .filter((role) => role.name !== "鳴り護摩" || isTenchiEvent(event))
          .map((role) => {
          const members = active.filter((participant) =>
            participant.roles.includes(role.id),
          );
          return (
            <div key={role.id} className="role-row">
              <strong>{role.name}</strong>
              <span className={members.length ? "" : "pending"}>
                {members
                  .map((member) =>
                    role.name === "その他" && member.otherRoleText
                      ? `${member.name}（${member.otherRoleText}）`
                      : role.name === "出店" && member.stallRoleText
                        ? `${member.name}（${member.stallRoleText}）`
                      : role.name === "鳴り護摩"
                        ? `${member.name}（${nariGomaText(member)}）`
                      : member.name,
                  )
                  .join("、") || "未定"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function roleLabels(data: AppData, participant: Participant) {
  return participant.roles
    .map((id) => {
      const name = data.roles.find((role) => role.id === id)?.name;
      if (name === "その他" && participant.otherRoleText) {
        return participant.otherRoleText;
      }
      if (name === "出店" && participant.stallRoleText) {
        return `出店（${participant.stallRoleText}）`;
      }
      if (name === "鳴り護摩") {
        return `鳴り護摩（${nariGomaText(participant)}）`;
      }
      return name;
    })
    .filter((name): name is string => Boolean(name));
}

function nariGomaText(participant: Pick<Participant, "nariGomaAltar" | "nariGomaDuties">) {
  const altar =
    nariGomaAltars.find(([value]) => value === participant.nariGomaAltar)?.[1] ??
    "どれでも可";
  const duties = participant.nariGomaDuties?.length
    ? participant.nariGomaDuties
    : ["any"];
  const dutyText = duties
    .map((duty) => nariGomaDuties.find(([value]) => value === duty)?.[1])
    .filter(Boolean)
    .join("・");
  return `${altar} / ${dutyText || "どれでも可"}`;
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
  if (
    participant.transportType === "shuttle" &&
    participantHasRole(data, participant, "送迎ドライバー")
  ) {
    return "";
  }
  if (participant.transportType === "driver") return "車";
  return "";
}

function routeLabel(
  participant: Participant,
  data: AppData,
  direction: "outbound" | "return",
) {
  if (
    participant.transportType !== "shuttle" ||
    participantHasRole(data, participant, "送迎ドライバー")
  ) {
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

function participantHasRole(data: AppData, participant: Participant, name: string) {
  return participant.roles.some(
    (roleId) => data.roles.find((role) => role.id === roleId)?.name === name,
  );
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
