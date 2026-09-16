import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OUTCOME_LABELS, VISIT_OUTCOMES, isVisitOutcome } from "@/lib/partners/outcomes";
import { QUEUE_PHOTO_LIMIT } from "@/lib/partners/visit-queue";

/**
 * The photo is the proof a visit happened.
 *
 * THE REASON THIS RULE EXISTS: an operator has no addresses on file. A
 * salesperson walking into a carinderia nobody has heard of is how the business
 * gets discovered, so on a first visit there is nothing for the GPS check to
 * compare against — `checkVisit` honestly answers `no_address` and the "far
 * from the address" flag never fires. Without a photo, a visit is a claim typed
 * into a phone.
 */

const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("logging a visit", () => {
  const action = codeOf("server/partners/attendance-actions.ts");
  const visit = action.slice(action.indexOf("export async function logVisitAction"));

  it("refuses a visit with no photo", () => {
    expect(visit).toContain('if (!photo.startsWith("data:image/"))');
    expect(visit).toMatch(/return \{ error: "Take a photo of the visit/);
  });

  it("refuses a visit whose photo failed to upload, rather than keeping it", () => {
    // This used to swallow the failure and keep the visit, which was right when
    // the photo was decoration and wrong now that it is the evidence.
    const upload = visit.slice(visit.indexOf("uploadFieldPhoto"));
    expect(upload).toContain("That photo didn't upload");
    expect(upload.slice(0, 400)).not.toContain("the visit still stands");
  });

  it("records where the business is on the FIRST visit only", () => {
    // A later visit must not move the pin, or somebody logging from the wrong
    // place quietly redefines the business's location and makes their own
    // mistake look correct.
    expect(visit).toContain("latitude: null");
    expect(visit).toContain("locatedByVisit: visit.id");
  });

  it("only writes a location it actually has", () => {
    expect(visit).toMatch(/subjectType === "prospect" && point/);
  });
});

describe("the field app", () => {
  const app = readFileSync(join(SRC, "components/partner/FieldApp.tsx"), "utf8");

  it("will not submit a visit without a photo", () => {
    // The server refuses it anyway; the button is what stops somebody filling
    // the form in and losing it.
    expect(app).toContain("!subjectKey || busy || !photo");
  });

  it("opens the camera rather than a file browser on a phone", () => {
    expect(app).toContain('capture="environment"');
    expect(app).toContain('accept="image/*"');
  });

  it("shrinks the photo before it is queued or sent", () => {
    expect(app).toContain("shrinkPhoto(file)");
  });
});

describe("the offline queue", () => {
  const queue = codeOf("lib/partners/visit-queue.ts");

  it("carries the photo now that it is small enough", () => {
    // The old rule refused photos because a camera's output is megabytes. At
    // 1024px and quality 0.7 it is about 100 KB, so the objection is gone —
    // and dropping the photo offline would be a hole anybody could use by
    // claiming they had no signal.
    expect(queue).toContain("fields.photo");
    expect(QUEUE_PHOTO_LIMIT).toBeGreaterThan(300_000);
  });

  it("drops the photo rather than the visit if it is somehow huge", () => {
    // The visit matters more than the picture.
    const enqueue = queue.slice(queue.indexOf("export async function enqueue"));
    expect(enqueue).toContain("delete fields.photo");
    expect(enqueue).toContain("s.put({ ...item, fields,");
  });
});

describe("what a manager sees", () => {
  it("renders the photo, and says plainly when there is none", () => {
    const log = readFileSync(join(SRC, "components/partner/VisitLog.tsx"), "utf8");
    expect(log).toContain("v.photoUrl");
    expect(log).toContain("No photo");
  });

  it("signs each photo for the viewer instead of exposing the path", () => {
    // The bucket is private; a path in the payload would outlive the session.
    const page = readFileSync(
      join(SRC, "app/(platform)/partner/attendance/manager/page.tsx"),
      "utf8",
    );
    expect(page).toContain("signFieldPhoto(partner.id, v.photoPath)");
    expect(page).toContain("photoUrl: visitPhotos.get(v.id)");
  });

  it("does not describe a first visit as a failed location check", () => {
    // `no_address` is the NORMAL case for an operator who never collected
    // addresses. Calling it a mismatch would cry wolf on every first visit.
    const log = readFileSync(join(SRC, "components/partner/VisitLog.tsx"), "utf8");
    expect(log).toContain("First visit here");
  });
});

describe("the outcome labels", () => {
  it("has a label for every outcome the server accepts", () => {
    // They used to exist only inside the field app, so the manager's screen
    // could show nothing but the raw value.
    for (const o of VISIT_OUTCOMES) {
      expect(OUTCOME_LABELS[o], o).toBeTruthy();
    }
    expect(isVisitOutcome("signed")).toBe(true);
    expect(isVisitOutcome("whatever")).toBe(false);
  });
});
