"use client";

import { useActionState, useState } from "react";

/**
 * The receipt upload form: the customer paid by QR to the company account and
 * now tells us so. Amount, months covered, bank reference (required) and a
 * photo of the receipt.
 *
 * Posts to a server action in the product, which uploads the image to the
 * portal (`uploadReceipt`) and queues `payment.submitted`. The fields it sends:
 *
 *   type                activation | monthly
 *   months_covered      1–12 (monthly)
 *   billing_month_start YYYY-MM (monthly)
 *   amount              pesos, as typed
 *   bank_reference      required
 *   receipt             the image file
 */
export type ReceiptFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const IDLE: ReceiptFormState = { status: "idle" };

function pesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export function ReceiptUploadForm({
  action,
  allowActivation,
  allowMonthly,
  activationFee,
  monthlyFee,
  nextBillingMonth,
  maxMonths = 12,
  className = "space-y-4",
  inputClassName = "mt-1 w-full rounded-lg border px-3 py-2",
  buttonClassName = "w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-40",
}: {
  action: (prev: ReceiptFormState, fd: FormData) => Promise<ReceiptFormState>;
  allowActivation: boolean;
  allowMonthly: boolean;
  /** Centavos, or null if unknown — the amount is then left for the customer to type. */
  activationFee: number | null;
  monthlyFee: number | null;
  /** YYYY-MM: the first month not yet paid for. */
  nextBillingMonth: string;
  maxMonths?: number;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [type, setType] = useState<"activation" | "monthly">(allowActivation ? "activation" : "monthly");
  const [months, setMonths] = useState(1);
  const [amountTouched, setAmountTouched] = useState(false);
  const [amount, setAmount] = useState(() =>
    allowActivation && activationFee != null ? pesos(activationFee) : monthlyFee != null ? pesos(monthlyFee) : "",
  );

  function suggest(nextType: "activation" | "monthly", nextMonths: number) {
    if (amountTouched) return;
    const fee = nextType === "activation" ? activationFee : monthlyFee != null ? monthlyFee * nextMonths : null;
    setAmount(fee != null ? pesos(fee) : "");
  }

  if (!allowActivation && !allowMonthly) return null;
  if (state.status === "done") {
    return <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.message}</p>;
  }

  return (
    <form action={formAction} className={className}>
      <div>
        <label className="block text-sm font-medium" htmlFor="receipt-type">This payment is for</label>
        <select
          id="receipt-type"
          name="type"
          value={type}
          onChange={(e) => {
            const t = e.target.value as "activation" | "monthly";
            setType(t);
            suggest(t, months);
          }}
          className={inputClassName}
        >
          {allowActivation && <option value="activation">Activation (one time)</option>}
          {allowMonthly && <option value="monthly">Monthly subscription</option>}
        </select>
      </div>

      {type === "monthly" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="receipt-start">Starting month</label>
            <input id="receipt-start" name="billing_month_start" type="month" required defaultValue={nextBillingMonth} className={inputClassName} />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="receipt-months">Months</label>
            <select
              id="receipt-months"
              name="months_covered"
              value={months}
              onChange={(e) => {
                const m = Number(e.target.value);
                setMonths(m);
                suggest(type, m);
              }}
              className={inputClassName}
            >
              {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium" htmlFor="receipt-amount">Amount paid (₱)</label>
        <input
          id="receipt-amount"
          name="amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => {
            setAmountTouched(true);
            setAmount(e.target.value);
          }}
          className={inputClassName}
        />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="receipt-ref">Bank reference number</label>
        <input id="receipt-ref" name="bank_reference" required minLength={3} maxLength={100} autoComplete="off" className={inputClassName} />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="receipt-file">Photo or screenshot of the receipt</label>
        <input id="receipt-file" name="receipt" type="file" required accept="image/jpeg,image/png,image/webp" className={inputClassName} />
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? "Sending…" : "Submit receipt"}
      </button>
    </form>
  );
}
