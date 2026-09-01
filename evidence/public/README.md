# Evidence you can check without running anything

Four files, committed so the claims in the root README can be checked from a clone. The rest of
`evidence/` stays out of the repo: ~400 MB of Playwright traces and screen recordings, and the
dumped URLs in them carry live session tokens.

| File | What it is |
|---|---|
| `harness.json` | Every one of the 210 gate decisions, with the expected outcome and code beside the actual one. `perClass: 15`, `total: 210`, `correct: 210` |
| `settlements.json` | The settlement run: 10 orders, each with its real Razorpay `pay_...` id, and the debited total |
| `receipt-escalated.json` | One complete receipt bundle. This is the escalated order — the agent asked for Rs 14,000 against an Rs 11,000 per-order ceiling, was refused, and a person authorised it. Its `decision` block says `ESCALATE` |
| `receipt-escalated.tampered.json` | The same bundle with one field edited: `blocks.payment.amount_paise`, Rs 14,000 to Rs 1 |

## Verify them yourself

The bundle carries the public key, so this needs no database, no keys and no network:

```bash
npm run receipt verify evidence/public/receipt-escalated.json
#   receipt          VALID
#   signature        ok
#   tampered blocks  none

npm run receipt verify evidence/public/receipt-escalated.tampered.json
#   receipt          INVALID
#   signature        FAILED
#   tampered blocks  payment
```

The second one is the point. The blocks are hashed individually, so the report **names the altered
block** rather than saying the file is bad — which is the difference between evidence that survives a
dispute and a checksum.

Regenerate all of it with `npm run harness`, `npm run settle`, and `npm run receipt export <orderId>`.
