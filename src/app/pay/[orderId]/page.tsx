import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { merchants, orders, offers } from "@/core/db/schema";
import { formatInr } from "@/core/money";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const db = getDb();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order?.razorpayOrderId) return <main className="p-12">No such order.</main>;

  const [offer] = await db.select().from(offers).where(eq(offers.id, order.offerId)).limit(1);
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, offer.merchantId)).limit(1);
  const settled = order.state === "PAID";

  return (
    <main className="atmosphere flex min-h-dvh items-center justify-center p-8">
      <div className="glass w-full max-w-md rounded-lg p-8">
        <div className="label">{order.state === "ESCALATED" ? "Approval needed" : "Authorize payment"}</div>
        <h1 className="mt-2 font-mono text-3xl">{formatInr(order.amountPaise)}</h1>
        <p className="mt-2 text-sm text-fg-2">{offer.qty} × {offer.sku} from {merchant.name}</p>
        <div className="mt-6 border-t border-hairline pt-4">
          {settled ? <p className="text-sm text-admit">Already paid.</p> : (
            <Checkout
              keyId={merchant.razorpayKeyId}
              razorpayOrderId={order.razorpayOrderId}
              amountPaise={order.amountPaise.toString()}
              merchantName={merchant.name}
              description={`${offer.qty} × ${offer.sku}`}
            />
          )}
        </div>
      </div>
    </main>
  );
}
