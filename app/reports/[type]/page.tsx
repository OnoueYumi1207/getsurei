import { appData } from "../../api/store";
import { PrintButton } from "./PrintButton";

type Params = Promise<{ type: "participants" | "roles" | "shuttles" }>;
type SearchParams = Promise<{ eventId?: string }>;
type ReportRole = { id: number; name: string };
type ReportShuttle = {
  id: number;
  direction: "outbound" | "return";
  name: string;
  capacity: number | null;
  note: string | null;
};
type ReportGroup = { id: number; name: string };
type ReportParticipant = {
  id: number;
  name: string;
  eventId: number;
  groupId: number;
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
};
type ReportData = {
  groups: ReportGroup[];
  roles: ReportRole[];
  shuttles: ReportShuttle[];
  participants: ReportParticipant[];
};
type ReportType = "participants" | "roles" | "shuttles";
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

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { type } = await params;
  const { eventId } = await searchParams;
  const data = (await appData(Number(eventId))) as unknown as Awaited<ReturnType<typeof appData>> &
    ReportData;
  const event =
    data.events.find((item) => String(item.id) === eventId) ?? data.events[0];
  const active = data.participants.filter(
    (participant) => participant.eventId === event.id && !participant.isAbsent,
  );

  return (
    <main className="report-page">
      <div className="print-actions">
        <PrintButton />
      </div>
      <ReportTabs data={data} eventId={event.id} activeType={type} />
      <section className="report">
        <h1>{event.monthLabel} {event.name}</h1>
        <p>挙行日：{formatDate(event.eventDate)}</p>
        {type === "participants" && <ParticipantsReport data={data} active={active} />}
        {type === "roles" && <RolesReport data={data} active={active} event={event} />}
        {type === "shuttles" && <ShuttlesReport data={data} active={active} />}
      </section>
    </main>
  );
}

function ReportTabs({
  data,
  eventId,
  activeType,
}: {
  data: ReportData;
  eventId: number;
  activeType: ReportType;
}) {
  const eventQuery = `eventId=${eventId}`;
  return (
    <nav className="tabs report-tabs" aria-label="ページ">
      {data.groups.map((group) => (
        <a key={group.id} href={`/${groupPath(group)}?${eventQuery}`}>
          {group.name}
        </a>
      ))}
      <a href={`/shuukei?${eventQuery}`}>全体集計</a>
      <a
        className={activeType === "participants" ? "active" : ""}
        href={`/sanka?${eventQuery}`}
      >
        参加者名簿
      </a>
      <a
        className={activeType === "roles" ? "active" : ""}
        href={`/busho?${eventQuery}`}
      >
        部署名簿
      </a>
      <a
        className={activeType === "shuttles" ? "active" : ""}
        href={`/sougei?${eventQuery}`}
      >
        送迎名簿
      </a>
    </nav>
  );
}

function groupPath(group: ReportGroup) {
  return groupPathByName.get(group.name) ?? `group-${group.id}`;
}

function isTenchiEvent(event?: { name: string }) {
  return event?.name === "天地免劫修法";
}

function ParticipantsReport({
  data,
  active,
}: {
  data: ReportData;
  active: ReportParticipant[];
}) {
  const grouped = groupedParticipants(data, active);
  const totalStats = participantStats(active);
  return (
    <>
      <h2>参加者名簿</h2>
      <div className="report-stats">
        <div>
          <span>総参加人数</span>
          <strong>{totalStats.participants}名</strong>
        </div>
        <div>
          <span>自家用車</span>
          <strong>{totalStats.cars}台</strong>
        </div>
        <div>
          <span>仙丹茶</span>
          <strong>{totalStats.sendanTea}本</strong>
        </div>
      </div>
      <table className="group-stats-table">
        <thead>
          <tr>
            <th>伝道会</th>
            <th>参加人数</th>
            <th>車</th>
            <th>仙丹茶</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ group, participants }) => {
            const stats = participantStats(participants);
            return (
              <tr key={group.id}>
                <th>{group.name}</th>
                <td>{stats.participants}名</td>
                <td>{stats.cars}台</td>
                <td>{stats.sendanTea}本</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="participants-report-table">
        <thead>
          <tr>
            <th>伝道会</th>
            <th>参加者名</th>
            <th>部署</th>
            <th>仙丹茶</th>
            <th>移動手段</th>
            <th>往路</th>
            <th>復路</th>
          </tr>
        </thead>
        <tbody>
          {grouped.flatMap(({ group, participants }) =>
            participants.map((participant, index) => (
              <tr key={participant.id}>
                {index === 0 && (
                  <td rowSpan={participants.length} className="group-cell">
                    {group.name}
                  </td>
                )}
                <td className="participant-name-cell">{participant.name}</td>
                <td>{roleText(data, participant)}</td>
                <td className="count-cell">{participant.sendanTeaCount}</td>
                <td className="transport-cell">{transportText(data, participant)}</td>
                <td className="route-cell">{routeText(data, participant, "outbound")}</td>
                <td className="route-cell">{routeText(data, participant, "return")}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  );
}

function RolesReport({
  data,
  active,
  event,
}: {
  data: ReportData;
  active: ReportParticipant[];
  event: { name: string };
}) {
  return (
    <>
      <h2>部署名簿</h2>
      <table className="department-report-table">
        <tbody>
          {data.roles
            .filter((role) => role.name !== "鳴り護摩" || isTenchiEvent(event))
            .map((role) => {
            const members = active.filter((participant) => participant.roles.includes(role.id));
            return (
              <tr key={role.id}>
                <th>{role.name}</th>
                <td className={members.length ? "" : "pending"}>
                  {members.length
                    ? members
                        .map((member) =>
                          role.name === "運搬" && member.carrierSchedule
                            ? `${member.name}（往路 ${scheduleText(member.carrierSchedule.outboundDate, member.carrierSchedule.outboundTime)} / 復路 ${scheduleText(member.carrierSchedule.returnDate, member.carrierSchedule.returnTime)}）`
                            : role.name === "その他" && member.otherRoleText
                              ? `${member.name}（${member.otherRoleText}）`
                              : role.name === "出店" && member.stallRoleText
                                ? `${member.name}（${member.stallRoleText}）`
                              : role.name === "鳴り護摩"
                                ? `${member.name}（${nariGomaText(member)}）`
                              : member.name,
                        )
                        .join("、")
                    : "未定"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function ShuttlesReport({
  data,
  active,
}: {
  data: ReportData;
  active: ReportParticipant[];
}) {
  return (
    <>
      <h2>送迎名簿</h2>
      {(["outbound", "return"] as const).map((direction) => (
        <section key={direction}>
          <h2>{direction === "outbound" ? "往路" : "復路"}</h2>
          <table className="shuttle-report-table">
            <thead>
              <tr>
                <th>便</th>
                <th>ドライバー</th>
                <th>希望者</th>
              </tr>
            </thead>
            <tbody>
              {data.shuttles
                .filter((shuttle) => shuttle.direction === direction)
                .map((shuttle) => {
                  const users = active.filter((participant) =>
                    participant.transportType === "shuttle" &&
                    !participantHasRole(data, participant, "送迎ドライバー") &&
                    (direction === "outbound"
                      ? participant.outboundShuttleId === shuttle.id
                      : participant.returnShuttleId === shuttle.id),
                  );
                  const drivers = active.filter((participant) =>
                    participantHasRole(data, participant, "送迎ドライバー") &&
                    (direction === "outbound"
                      ? participant.outboundShuttleId === shuttle.id
                      : participant.returnShuttleId === shuttle.id),
                  );
                  return (
                    <tr key={shuttle.id}>
                      <th>
                        {shuttle.name}
                        {shuttle.capacity ? `（定員${shuttle.capacity}名）` : ""}
                        {shuttle.note ? `（${shuttle.note}）` : ""}
                      </th>
                      <td>{drivers.map((driver) => driver.name).join("、") || "0"}</td>
                      <td>{users.map((user) => user.name).join("、") || "0"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

function roleText(data: ReportData, participant: ReportParticipant) {
  return (
    participant.roles
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
      .filter(Boolean)
      .join("、")
  );
}

function nariGomaText(participant: Pick<ReportParticipant, "nariGomaAltar" | "nariGomaDuties">) {
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

function transportText(data: ReportData, participant: ReportParticipant) {
  if (
    participant.transportType === "shuttle" &&
    participantHasRole(data, participant, "送迎ドライバー")
  ) {
    return "";
  }
  if (participant.transportType === "driver") return "車";
  return "";
}

function groupedParticipants(data: ReportData, active: ReportParticipant[]) {
  return data.groups
    .map((group) => ({
      group,
      participants: active.filter((participant) => participant.groupId === group.id),
    }))
    .filter(({ participants }) => participants.length > 0);
}

function participantStats(participants: ReportParticipant[]) {
  return {
    participants: participants.length,
    cars: participants.filter((participant) => participant.transportType === "driver").length,
    sendanTea: participants.reduce(
      (total, participant) => total + participant.sendanTeaCount,
      0,
    ),
  };
}

function routeText(
  data: ReportData,
  participant: ReportParticipant,
  direction: "outbound" | "return",
) {
  if (
    participant.transportType === "shuttle" &&
    !participantHasRole(data, participant, "送迎ドライバー")
  ) {
    const id = direction === "outbound" ? participant.outboundShuttleId : participant.returnShuttleId;
    return data.shuttles.find((shuttle) => shuttle.id === id)?.name ?? "";
  }
  if (!participant.carrierSchedule) return "";
  return direction === "outbound"
    ? scheduleText(participant.carrierSchedule.outboundDate, participant.carrierSchedule.outboundTime)
    : scheduleText(participant.carrierSchedule.returnDate, participant.carrierSchedule.returnTime);
}

function participantHasRole(
  data: ReportData,
  participant: ReportParticipant,
  name: string,
) {
  return participant.roles.some(
    (roleId) => data.roles.find((role) => role.id === roleId)?.name === name,
  );
}

function scheduleText(date: string, time: string) {
  return [date, time].filter(Boolean).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
