"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  orderId: string;
  keyId: string;
  razorpayOrderId: string;
  amountPaise: string;
  merchantName: string;
  description: string;
}

type Status = "checking" | "open" | "paying" | "paid" | "failed" | "dismissed" | "unavailable" | "pending" | "unreachable";

const MESSAGE: Record<Status, string> = {
  checking: "Checking with Razorpay whether this order has already been paid.",
  open: "Razorpay checkout is open. Complete the payment in that window.",
  paying: "Submitted. Asking Razorpay whether it captured.",
  paid: "Paid. The receipt is signed and on the record.",
  failed: "A payment was attempted and not captured. The hold has been released.",
  dismissed: "Checkout was closed. Nothing has been charged.",
  unavailable: "Razorpay's checkout script could not be loaded.",
  pending: "Razorpay has not reported a capture yet.",
  unreachable: "This page could not reach the merchant to ask. Nothing has been charged twice.",
};

/** Razorpay is asked, not this page: a handler running where the payer can reach it proves nothing. */
async function ask(orderId: string, attempts: number): Promise<string> {
  const res = await fetch(`/api/orders/${orderId}/confirm?attempts=${attempts}`, { method: "POST" });
  return (await res.json())?.data?.status ?? "PENDING";
}

// Razorpay's own Standard Checkout, mounted on the merchant's page. This is the ordinary
// integration; payment links exist to be sent to a person, and test mode caps them at 30.
export function Checkout({ orderId, keyId, razorpayOrderId, amountPaise, merchantName, description }: Props) {
  const [status, setStatus] = useState<Status>("checking");
  const router = useRouter();
  const reopen = useRef<(() => void) | null>(null);

  // `attempts` is the server-side retry count. The pre-flight passes 1: confirmOrder sleeps 3s
  // between passes, and nobody has paid yet, so three passes only bought a six-second stare.
  // Guarded: an unguarded reject left status on "checking" forever, and "checking" is not stuck,
  // so the recovery button never mounted — a dead end on the money path.
  const confirm = useCallback(async (tries: number, attempts = 3): Promise<string> => {
    let state = "PENDING";
    try {
      for (let i = 0; i < tries && state === "PENDING"; i++) state = await ask(orderId, attempts);
    } catch {
      setStatus("unreachable");
      return "UNREACHABLE";
    }
    setStatus(state === "PAID" ? "paid" : state === "FAILED" ? "failed" : "pending");
    // The page's own facts are now stale: it renders the settled state and the receipt link itself.
    if (state !== "PENDING") router.refresh();
    return state;
  }, [orderId, router]);

  useEffect(() => {
    let cancelled = false;

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    const loaded = new Promise<boolean>((resolve) => {
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
    });
    document.body.appendChild(script);

    void (async () => {
      // The bug: only Razorpay's success handler confirmed, so a payer who was redirected, closed
      // the tab, or dismissed the modal after paying never confirmed and never got a receipt.
      // Confirming BEFORE checkout opens also keeps this poll off a live payment — confirmOrder
      // fails an order it finds attempted but uncaptured, and overlapping one would do just that.
      const [state, ready] = await Promise.all([confirm(1, 1), loaded]);
      if (cancelled || state !== "PENDING") return;
      if (!ready) return setStatus("unavailable");

      reopen.current = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Razorpay = (window as any).Razorpay;
        new Razorpay({
          key: keyId,
          order_id: razorpayOrderId,
          amount: amountPaise,
          currency: "INR",
          name: merchantName,
          description,
          handler: () => {
            setStatus("paying");
            void confirm(5);
          },
          // Only from open: a success closes the modal too, and that must not read as dismissed.
          modal: { escape: false, ondismiss: () => setStatus((s) => (s === "open" ? "dismissed" : s)) },
        }).open();
        setStatus("open");
      };
      reopen.current();
    })();

    return () => {
      cancelled = true;
      script.remove();
    };
  }, [orderId, keyId, razorpayOrderId, amountPaise, merchantName, description, confirm]);

  const stuck = status === "dismissed" || status === "pending" || status === "unreachable";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Every transition here comes from an async source the payer never clicked — the checkout
          handler, ondismiss, or the poll — so the two most consequential strings in the app used to
          change in silence for anyone not watching this line. */}
      <p role="status" className={status === "paid" ? "text-sm text-admit" : "text-sm text-fg-2"} data-status={status}>
        {MESSAGE[status]}
      </p>

      {status === "paid" && (
        <Link href={`/receipts/${orderId}`} className="feedback text-sm text-primary hover:underline">
          open the receipt
        </Link>
      )}

      {/* Both dead ends have a way out: reopen what was closed, or ask Razorpay again. */}
      {stuck && (
        <button
          type="button"
          onClick={() => (status === "dismissed" ? reopen.current?.() : void confirm(5))}
          className="feedback rounded-[3px] border border-hairline px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
        >
          {status === "dismissed" ? "Open checkout again" : "Ask Razorpay again"}
        </button>
      )}
    </div>
  );
}
