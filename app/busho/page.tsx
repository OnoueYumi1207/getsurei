import ReportPage from "../reports/[type]/page";

type SearchParams = Promise<{ eventId?: string }>;

export default async function RolesReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return ReportPage({
    params: Promise.resolve({ type: "roles" }),
    searchParams,
  });
}
