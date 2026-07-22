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
  const data = (await appData()) as unknown as Awaited<ReturnType<typeof appData>> &
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
      <section className="report">
        <h1>{event.monthLabel} 明王招福護摩供</h1>
        <p>挙行日：{formatDate(event.eventDate)}</p>
        {type === "participants" && <ParticipantsReport data={data} active={active} />}
        {type === "roles" && <RolesReport data={data} active={active} />}
        {type === "shuttles" && <ShuttlesReport data={data} active={active} />}
      </section>
    </main>
  );
}

function ParticipantsReport({
  data,
  active,
}: {
  data: ReportData;
  active: ReportParticipant[];
}) {
  return (
    <>
      <h2>参加者名簿</h2>
      <table>
        <thead>
          <tr>
            <th>伝道会</th>
            <th>氏名</th>
            <th>担当</th>
            <th>仙丹茶</th>
            <th>移動手段</th>
            <th>往路</th>
            <th>復路</th>
          </tr>
        </thead>
        <tbody>
          {active.map((participant) => (
            <tr key={participant.id}>
              <td>{groupName(data, participant.groupId)}</td>
              <td>{participant.name}</td>
              <td>{roleText(data, participant)}</td>
              <td>{participant.sendanTeaCount}</td>
              <td>{transportText(data, participant)}</td>
              <td>{routeText(data, participant, "outbound")}</td>
              <td>{routeText(data, participant, "return")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RolesReport({
  data,
  active,
}: {
  data: ReportData;
  active: ReportParticipant[];
}) {
  return (
    <>
      <h2>担当名簿</h2>
      <table>
        <tbody>
          {data.roles.map((role) => {
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
          {data.shuttles
            .filter((shuttle) => shuttle.direction === direction)
            .map((shuttle) => {
              const users = active.filter((participant) =>
                direction === "outbound"
                  ? participant.outboundShuttleId === shuttle.id
                  : participant.returnShuttleId === shuttle.id,
              );
              return (
                <p key={shuttle.id} className="shuttle-report-row">
                  <strong>
                    【
                    {shuttle.name}
                    {shuttle.capacity ? `（定員${shuttle.capacity}名）` : ""}
                    {shuttle.note ? `（${shuttle.note}）` : ""}
                    】
                  </strong>
                  {users.map((user) => user.name).join("、") || "0"}
                </p>
              );
            })}
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
          return `その他（${participant.otherRoleText}）`;
        }
        return name;
      })
      .filter(Boolean)
      .join("、")
  );
}

function transportText(data: ReportData, participant: ReportParticipant) {
  if (participant.transportType === "none") return "";
  if (participant.transportType === "driver") return "ドライバー";
  if (participant.transportType === "passenger") {
    const driver = data.participants.find(
      (item) => item.id === participant.rideDriverParticipantId,
    );
    return `同乗${driver ? `（${driver.name}）` : ""}`;
  }
  return "送迎希望";
}

function groupName(data: ReportData, groupId: number) {
  return data.groups.find((group) => group.id === groupId)?.name ?? "";
}

function routeText(
  data: ReportData,
  participant: ReportParticipant,
  direction: "outbound" | "return",
) {
  if (participant.transportType === "shuttle") {
    const id = direction === "outbound" ? participant.outboundShuttleId : participant.returnShuttleId;
    return data.shuttles.find((shuttle) => shuttle.id === id)?.name ?? "";
  }
  if (!participant.carrierSchedule) return "";
  return direction === "outbound"
    ? scheduleText(participant.carrierSchedule.outboundDate, participant.carrierSchedule.outboundTime)
    : scheduleText(participant.carrierSchedule.returnDate, participant.carrierSchedule.returnTime);
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
