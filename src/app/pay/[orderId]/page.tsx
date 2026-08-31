import { payView } from "@/core/db/overview/pay";
import { Closed, Missing, PayShell, Settled, Stalled } from "./cards";
import { Checkout } from "./checkout";
import { Decline } from "./decline";

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
      ) : view.state === "EXPIRED" || view.state === "FAILED" ? (
        // Before the gateway check, deliberately: a dead order still has a razorpay_order_id, so
        // this used to fall straight through and open live Razorpay checkout on it.
        <Closed state={view.state} />
      ) : view.razorpayOrderId ? (
        <>
          <Checkout
            orderId={view.orderId}
            keyId={view.razorpayKeyId}
            razorpayOrderId={view.razorpayOrderId}
            amountPaise={view.amountPaise.toString()}
            merchantName={view.merchantName}
            description={`${view.qty} × ${view.sku}`}
          />
          {/* Only an escalation is waiting on a person's answer, so only it can be refused. */}
          {view.outcome === "ESCALATE" && <Decline orderId={view.orderId} />}
        </>
      ) : (
        <Stalled state={view.state} />
      )}
    </PayShell>
  );
}
