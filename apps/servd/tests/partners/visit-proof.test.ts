import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeAt } from "../support/source";
import { partnerManifest } from "@/lib/partners/manifest";
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


/**
 * A9 follow-up: the business that was not on the list.
 *
 * REPORTED FROM THE FIELD — "its asking me who did i visit, but i cannot find
 * any option where to write the name of the business."
 *
 * The dropdown offered the prospects assigned to that seat and the merchants
 * they look after, and nothing else. A salesperson standing inside a carinderia
 * nobody had entered could not log the visit at all — which is the exact case
 * this whole feature is written around, and the one the required photo exists
 * for. Discovery was the single thing the form refused to record.
 */
describe("logging a visit to a business nobody has entered yet", () => {
  const form = codeOf("components/partner/FieldApp.tsx");
  const action = codeOf("server/partners/attendance-actions.ts");
  const visit = action.slice(action.indexOf("export async function logVisitAction"));

  it("offers the option, at the bottom of the list", () => {
    // At the bottom because the common case is somebody already on the list,
    // and an "add new" at the top invites a duplicate.
    expect(form).toContain("NEW_SUBJECT");
    expect(form).toContain("Someone new");
    const options = form.indexOf("{subjects.map(");
    expect(form.indexOf("canAddNew && <option"), "add-new should come after the list")
      .toBeGreaterThan(options);
  });

  it("asks for a name, and for a product only when there is a choice", () => {
    expect(form).toContain("setNewName");
    // One product is not a question worth asking somebody in a doorway.
    expect(form).toContain("products.length > 1 &&");
    expect(form).toContain("products.length === 1 ? products[0].id");
  });

  it("counts the new fields in the same `missing` list as everything else", () => {
    const start = form.indexOf("const missing = [");
    const list = form.slice(start, form.indexOf("];", start));
    expect(list).toContain('"the business name"');
    expect(list).toContain('"which product"');
  });

  it("sends no subject id, so the server is the one that creates the row", () => {
    // A client-minted id would be a client deciding what exists.
    expect(form).toContain('["prospect", newProductId, ""]');
    expect(form).toContain("newSubjectName: isNew ? newName.trim()");
  });

  it("creates the prospect INSIDE the visit transaction", () => {
    // THE REASON THIS MATTERS: a queued visit is retried until accepted, and
    // the clientRef index makes the replay a no-op. Creating the business
    // outside the transaction would leave another copy of it behind on every
    // retry while the visit itself was correctly rejected.
    const tx = visit.slice(visit.indexOf("subjectId = await systemDb"));
    expect(tx).toContain("tx.prospect.create");
    expect(tx.indexOf("tx.prospect.create")).toBeLessThan(tx.indexOf("tx.staffVisit.create"));
  });

  it("files it as a walk-in lead assigned to whoever walked in", () => {
    expect(visit).toContain('source: "walk_in"');
    // `lead`, not `contacted`: the outcome moves it if the conversation earned
    // that. Defaulting past a stage nobody reached empties the pipeline of
    // meaning.
    expect(visit).toContain('stage: "lead"');
    expect(visit).toContain("assignedToId: who.userId");
  });

  it("reuses a business the partner already has rather than duplicating it", () => {
    // Two reps working the same street would otherwise enter the same
    // carinderia twice. The row is not reassigned — the visit records who
    // actually walked in.
    expect(visit).toContain('mode: "insensitive"');
    // The reuse branch READS and nothing more: it sets the local id, name and
    // point. If it ever starts writing, the second rep to visit would take the
    // first rep's prospect off them.
    const at = visit.indexOf("if (existing) {");
    // Search forward from there: an earlier `} else {` closes the "is this an
    // existing subject at all" branch, and slicing to that gives an empty
    // string every assertion below would pass against.
    const reuse = visit.slice(at, visit.indexOf("} else {", at));
    expect(reuse.length).toBeGreaterThan(0);
    expect(reuse).toContain("subjectId = existing.id");
    expect(reuse).not.toContain("update");
    expect(reuse).not.toContain("assignedToId");
  });

  it("refuses a seat without pipeline.write, on the server", () => {
    // `support` holds attendance.checkin and explicitly has no pipeline. The
    // hidden option is a courtesy; this is the gate.
    expect(visit).toContain('who.partner.permissions.has("pipeline.write")');
  });

  it("still refuses a nameless visit, and a new MERCHANT", () => {
    // A merchant exists by definition. Only a prospect can be new.
    expect(visit).toContain("if (!newSubjectName) return");
    expect(visit).toContain('if (subjectType !== "prospect")');
  });

  it("tells a seat that can neither pick nor add what to do", () => {
    // An empty dropdown over a dead button is the same dead end, one step
    // earlier.
    expect(form).toContain("subjects.length === 0 && !canAddNew");
  });

  it("gates the option on pipeline.write at the page too", () => {
    const page = codeOf("app/(platform)/partner/attendance/page.tsx");
    expect(page).toContain('partnerAllows(partner, "pipeline.write")');
    expect(page).toContain("provisionableProducts()");
  });
});

/**
 * The pin written by the first visit, and the read that was missing.
 */
describe("a repeat visit is checked against the first one", () => {
  const attendance = codeOf("server/partners/attendance.ts");
  const prospect = attendance.slice(
    attendance.indexOf("export async function subjectLocation"),
    attendance.indexOf('if (productId === "pharmacy")'),
  );

  it("reads the coordinates the first visit recorded", () => {
    // THE BUG: this returned `point: null` unconditionally, from before
    // prospects had coordinates at all. Once the first visit started writing
    // latitude/longitude, this function was the only thing between that column
    // and the check it exists for — so the pin was written and never read, and
    // every repeat visit still came back `no_address`.
    expect(prospect).toContain("latitude: true");
    expect(prospect).toContain("longitude: true");
    expect(prospect).toContain("isUsable(");
    expect(prospect).not.toContain("return { point: null, name:");
  });

  it("is still honestly null on a first visit", () => {
    // Nothing to compare to yet. That is the case the photo covers, and
    // inventing a point would make an unverifiable visit look verified.
    expect(prospect).toContain("? { lat: p.latitude as number, lng: p.longitude as number }");
    expect(prospect).toContain(": null");
  });
});


describe("the way out of the field app", () => {
  const form = codeOf("components/partner/FieldApp.tsx");

  it("has a link back to the portal", () => {
    // THE BUG: this screen is deliberately outside PortalShell, and "no chrome"
    // had been taken to mean "no links at all". On the web the browser's back
    // button only helps if you arrived from somewhere; in the INSTALLED app
    // there is no browser back button at all, because this page is the
    // start_url. Staff were stuck on it.
    expect(form).toContain('href="/partner"');
    expect(form).toContain("IconArrowLeft");
  });

  it("is a thumb-sized target, at the top", () => {
    expect(form).toContain("min-h-[44px]");
    const link = form.indexOf('href="/partner"');
    expect(link).toBeLessThan(form.indexOf("<header"));
  });

  it("stays inside the installed app's scope", () => {
    // A link out of `/partner` would open a browser tab with a URL bar on top
    // of the installed app. Both partner manifests are scoped to the portal,
    // so /partner is in scope on either host shape.
    // The href the component actually uses. `/partner` passes through
    // unprefixed on a branded host too (PASS_THROUGH in middleware), so one
    // link is correct on both.
    const href = "/partner";
    expect(form).toContain(`href="${href}"`);
    for (const bare of [true, false]) {
      const m = partnerManifest("field", bare);
      expect(href.startsWith(m.scope), `scope ${m.scope}`).toBe(true);
    }
  });

  it("leaves the wall-mounted kiosk screen with no way out, on purpose", () => {
    // That page is a locked display in a shop. A link out of it is a link a
    // customer taps.
    const kiosk = codeOf("app/(platform)/partner/attendance/kiosk/[id]/page.tsx");
    expect(kiosk).not.toContain('href="/partner"');
  });
});
