"use client";

import { useEffect, useState } from "react";

interface Props {
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

  useEffect(() => {
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
        // The page never decides anything. Settlement is confirmed server-side against Razorpay.
        handler: () => setStatus("submitted — confirming server-side"),
        modal: { escape: false, ondismiss: () => setStatus("dismissed") },
      }).open();
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [props]);

  return <p className="text-sm text-fg-3" data-status={status}>{status}</p>;
}
