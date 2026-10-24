import { GrowthPage } from "@/components/growth/backoffice-page";
import { isUuid } from "@/lib/operations-model";
/** This workspace shares the existing staff allowlist and private application shell. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { conversation } = await searchParams;
  return (
    <GrowthPage
      section="chat"
      initialConversation={isUuid(conversation) ? conversation : ""}
    />
  );
}
