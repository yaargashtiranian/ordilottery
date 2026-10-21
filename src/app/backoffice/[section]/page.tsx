import { notFound } from "next/navigation";
import { OperationsPage } from "@/components/backoffice/operations-page";
import { sections, type OperationsSection } from "@/lib/operations-model";
export const dynamic = "force-dynamic";

/** A closed route list keeps unknown section names out of operational queries. */
export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { section } = await params;
  if (section === "overview" || !Object.hasOwn(sections, section)) notFound();
  return (
    <OperationsPage
      section={section as OperationsSection}
      initialId={(await searchParams).id}
    />
  );
}
