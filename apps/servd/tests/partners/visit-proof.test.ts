import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeAt } from "../support/source";
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

/**
 * Comments stripped, so an assertion about the code cannot be satisfied by a
 * comment that merely mentions the thing.
 *
 * This used to be a local pair of regexes. A slash-star inside a string opened
 * a comment as far as they were concerned, and FieldApp.tsx has one in the
 * camera input's MIME filter — so everything from there to the next close
 * marker, the photo error handler included, was deleted before any assertion
 * saw it. Those assertions ran against an empty string and could not fail.
 * See tests/support/source.test.ts.
 */
const codeOf = (p: string) => codeAt(join("src", p));

/** Raw source, for the assertions that are about user-visible copy. */
const SRC = join(process.cwd(), "src");

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
    //
    // Asserted through the `missing` list rather than an inline boolean,
    // because the list is now also what the screen PRINTS — see "the submit
    // button explains itself" below. One source for both is the point.
    expect(app).toContain('!photo && "a photo"');
    expect(app).toContain("disabled={missing.length > 0 || busy}");
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


/**
 * A9 follow-up: the button that would not say why.
 *
 * REPORTED FROM THE FIELD — "i tried to log a visit, but i cannot click the log
 * the visit, even though i already upload a sample photo."
 *
 * Five separate conditions disabled that button and the screen named none of
 * them. The photo was fine; the unanswered consent question was the blocker,
 * and the consent block looked exactly like the optional Notes box above it. A
 * disabled control that refuses to explain itself is a dead end, and this one
 * was reached by somebody who had done everything the form asked.
 */
describe("the submit button explains itself", () => {
  const form = codeOf("components/partner/FieldApp.tsx");

  it("derives the disabled state from a named list, not an inline boolean", () => {
    // The list is what gets rendered. Deriving `disabled` from anything else is
    // how the two drift apart and the message starts lying.
    expect(form).toContain("const missing = [");
    expect(form).toContain("disabled={missing.length > 0 || busy}");
  });

  it("names every one of the four things that can be missing", () => {
    const start = form.indexOf("const missing = [");
    // To the end of the array literal, NOT to the next `return (` — the first
    // one of those in the file belongs to FieldApp, hundreds of lines earlier,
    // which made this slice empty and every assertion below vacuous.
    const list = form.slice(start, form.indexOf("];", start));
    expect(list.length).toBeGreaterThan(0);
    for (const [cond, phrase] of [
      ["!subjectKey", "who you visited"],
      ["!photo", "a photo"],
      ["consent === null", "the answer about texting them"],
      ["!mobile.trim()", "their mobile number"],
    ] as const) {
      expect(list, cond).toContain(cond);
      expect(list, phrase).toContain(phrase);
    }
  });

  it("shows the reason on screen, above the button", () => {
    // Below it is where nobody scrolls: on a phone the button is often the last
    // thing on screen.
    const note = form.indexOf('id="visit-missing"');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(form.indexOf("disabled={missing.length > 0"));
    expect(form).toContain("Still needed:");
  });

  it("points a screen reader at that reason", () => {
    expect(form).toContain('aria-describedby={missing.length > 0 ? "visit-missing" : undefined}');
  });

  it("marks the two required blocks that look optional", () => {
    // Notes really is optional and sits right above them, which is most of why
    // the consent question got skipped.
    const required = form.split("*</span>").length - 1;
    expect(required, "photo and consent should both be marked").toBeGreaterThanOrEqual(2);
  });

  it("says it is saving rather than going quiet mid-submit", () => {
    expect(form).toContain('busy ? "Saving');
  });
});

describe("a photo the browser cannot decode", () => {
  const photo = codeOf("lib/partners/photo.ts");
  const form = codeOf("components/partner/FieldApp.tsx");

  it("names HEIC instead of advising a retry that fails identically", () => {
    // HEIC is the default on every current iPhone. The camera path converts it,
    // but a manager testing on a laptop from an AirDropped photo hands Chrome a
    // raw .heic, which it cannot decode at all. "Try again" is a loop.
    expect(photo).toContain("isUndecodableHeic");
    expect(photo).toContain("HEIC");
    expect(photo).toMatch(/\.hei\[cf\]\$|hei\[cf\]/);
  });

  it("surfaces the real message rather than swallowing it", () => {
    expect(form).toContain("err instanceof Error && err.message");
  });

  it("still refuses a file that is not an image at all", () => {
    expect(photo).toContain('throw new Error("That file isn\'t a photo.")');
  });
});
