import ReportPage from "../reports/[type]/page";

type SearchParams = Promise<{ eventId?: string }>;

export default async function ShuttlesReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return ReportPage({
    params: Promise.resolve({ type: "shuttles" }),
    searchParams,
  });
}
