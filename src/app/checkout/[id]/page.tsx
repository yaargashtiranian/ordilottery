import { notFound } from "next/navigation";
import { isUuid } from "@/lib/operations-model";
import { CheckoutResult } from "@/components/growth/checkout-result";
import { ChatWidget } from "@/components/growth/chat-widget";
export const metadata = {
  title: "پیگیری درخواست",
  robots: { index: false, follow: false },
};
/** Static shell contains no customer data; the API scopes all reads to the guest capability. */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <>
      <CheckoutResult id={id} />
      <ChatWidget />
    </>
  );
}
