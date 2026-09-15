import { describe, it, expect } from "vitest";
import { composeDigest, type DigestFacts } from "@servd/db";

const empty: DigestFacts = {
  partnerName: "Tagum City Partner",
  followUpsDue: [],
  attention: [],
  newTrials: [],
  newPayments: [],
  milestone: null,
};

/**
 * The digest's editorial decisions.
 *
 * `worthSending` is the one that matters: a daily email that arrives every day
 * saying "nothing happened" is an email people filter, and then the one that
 * matters is filtered too.
 */
describe("composeDigest", () => {
  it("sends NOTHING on a quiet day", () => {
    const d = composeDigest(empty);
    expect(d.worthSending).toBe(false);
    expect(d.body).toBe("");
  });

  it("leads with how many things need a person", () => {
    const d = composeDigest({
      ...empty,
      followUpsDue: [{ businessName: "Botica", overdueDays: 0 }],
      attention: [{ title: "Mango Grill", detail: "Payment failed." }],
    });
    expect(d.worthSending).toBe(true);
    expect(d.subject).toBe("2 things need you today");
  });

  it("uses the singular for one", () => {
    const d = composeDigest({ ...empty, attention: [{ title: "X", detail: "y" }] });
    // The verb agrees too: "1 thing need you today" is the kind of line that
    // makes an automated email read as automated.
    expect(d.subject).toBe("1 thing needs you today");
  });

  it("says how late a follow-up is", () => {
    const d = composeDigest({
      ...empty,
      followUpsDue: [{ businessName: "Botica", overdueDays: 3 }],
    });
    expect(d.body).toContain("Botica (3 days overdue)");
  });

  it("totals yesterday's payments in pesos, not centavos", () => {
    const d = composeDigest({
      ...empty,
      newPayments: [
        { merchant: "A", amountCentavos: 99900 },
        { merchant: "B", amountCentavos: 149900 },
      ],
    });
    expect(d.body).toContain("PHP 2,498");
    expect(d.subject).toBe("Yesterday in your city");
  });

  it("mentions a milestone ONLY when it is at risk", () => {
    const onTrack = composeDigest({
      ...empty,
      milestone: { target: 10, actual: 9, month: 1, atRisk: false },
    });
    // On its own, an on-track milestone is not news — and a line that appears
    // every morning is the line people stop reading, which is the line you need
    // them to read the morning it changes.
    expect(onTrack.worthSending).toBe(false);

    const atRisk = composeDigest({
      ...empty,
      milestone: { target: 10, actual: 2, month: 1, atRisk: true },
    });
    expect(atRisk.worthSending).toBe(true);
    expect(atRisk.body).toContain("behind pace");
  });

  it("names the partner in the body so a forwarded mail still makes sense", () => {
    const d = composeDigest({ ...empty, newTrials: ["Botica San Roque"] });
    expect(d.body.startsWith("Tagum City Partner")).toBe(true);
  });
});
