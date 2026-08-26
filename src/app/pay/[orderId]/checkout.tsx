"use client";

import { useEffect, useState } from "react";

interface Props {
  orderId: string;
  keyId: string;
  razorpayOrderId: string;
  amountPaise: string;
  merchantName: string;
  description: string;
}

// Razorpay's own Standard Checkout, mounted on the merchant's page. This is the ordinary
// integration; payment links exist to be sent to a person, and test mode caps them at 30.
export function Checkout(props: Props) {
  const [status, setStatus] = useState("loading checkout");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Razorpay is asked, not this page: a handler running where the payer can reach it is not
    // evidence that money moved.
    async function confirm() {
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`/api/orders/${props.orderId}/confirm`, { method: "POST" });
        const state = (await res.json()).data?.status ?? "PENDING";
        if (state !== "PENDING") {
          setStatus(state === "PAID" ? "paid — receipt issued" : String(state).toLowerCase());
          setSettled(state === "PAID");
          return;
        }
      }
      setStatus("still pending — Razorpay has not reported a capture");
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onerror = () => setStatus("could not load checkout.js");
    script.onload = () => {
      setStatus("checkout open");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Razorpay = (window as any).Razorpay;
      new Razorpay({
        key: props.keyId,
        order_id: props.razorpayOrderId,
        amount: props.amountPaise,
        currency: "INR",
        name: props.merchantName,
        description: props.description,
        handler: () => {
          setStatus("submitted — confirming with Razorpay");
          void confirm();
        },
        modal: { escape: false, ondismiss: () => setStatus("dismissed") },
      }).open();
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [props]);

  return (
    <div>
      <p className="text-sm text-fg-3" data-status={status}>{status}</p>
      {settled && (
        <a href={`/receipts/${props.orderId}`} className="mt-3 inline-block text-sm text-primary hover:underline">
          open the receipt
        </a>
      )}
    </div>
  );
}
