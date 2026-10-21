import { OperationsPage } from "@/components/backoffice/operations-page";
export const dynamic = "force-dynamic";

/** The landing workspace prioritizes cases, follow-ups and customer support. */
export default function Dashboard() {
  return <OperationsPage section="overview" />;
}
