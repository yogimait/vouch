import { payView } from "@/core/db/overview/pay";
import { Missing, PayShell, Settled, Stalled } from "./cards";
import { Checkout } from "./checkout";

// Reads live data on every request. Without this Next prerenders it and bakes one order in.
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const view = await payView(orderId);

  if (!view) return <Missing orderId={orderId} />;

  return (
    <PayShell view={view}>
      {view.state === "PAID" ? (
        <Settled orderId={view.orderId} />
      ) : view.razorpayOrderId ? (
        <Checkout
          orderId={view.orderId}
          keyId={view.razorpayKeyId}
          razorpayOrderId={view.razorpayOrderId}
          amountPaise={view.amountPaise.toString()}
          merchantName={view.merchantName}
          description={`${view.qty} × ${view.sku}`}
        />
      ) : (
        <Stalled state={view.state} />
      )}
    </PayShell>
  );
}
