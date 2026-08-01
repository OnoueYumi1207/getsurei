import ReportPage from "../reports/[type]/page";

type SearchParams = Promise<{ eventId?: string }>;

export default async function ParticipantsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return ReportPage({
    params: Promise.resolve({ type: "participants" }),
    searchParams,
  });
}
