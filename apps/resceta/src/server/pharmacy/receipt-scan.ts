import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
/*
  zod/v4, NOT the project's default zod import.

  `zodOutputFormat` is typed against zod v4 and generates the JSON Schema from
  it. zod 3.25 ships v4 on this subpath, so the rest of the app keeps its v3
  schemas and this one module speaks the version the SDK helper expects.
*/
import * as z from "zod/v4";

/**
 * READING A DELIVERY RECEIPT FROM A PHOTO.
 *
 * Receiving a forty-line delivery means typing forty names, forty quantities,
 * forty costs, forty lot numbers and forty expiry dates off a piece of paper.
 * That is the job people do badly at 6pm, and a mistyped expiry is the one
 * error this whole system exists to prevent.
 *
 * FEATURE-FLAGGED ON THE KEY. With no ANTHROPIC_API_KEY the button is not shown
 * and this module refuses politely — the same shape as billing being gated on
 * the payment keys. A missing key must not be a crash on the receiving screen.
 *
 * NOTHING HERE WRITES ANYTHING. The extraction is a DRAFT: it fills the
 * receiving form, a human checks it against the paper, and the existing
 * receiving path does the writing with its own validation. An AI that could
 * book stock straight onto the shelf would be an AI that can silently invent an
 * expiry date.
 */

export function receiptScanEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * ONE SCHEMA, and the SDK derives the JSON Schema from it.
 *
 * REPORTED — "i tried to read the receipt in receive stock, its not working."
 *
 * It was two schemas: this zod object, and a JSON Schema written out by hand
 * beside it. The hand-written one spelled a nullable field
 * `type: ["string", "null"]`. Structured outputs accept a restricted subset of
 * JSON Schema in which a nullable is `anyOf: [{type:"string"},{type:"null"}]`,
 * so the API rejected the request — and the catch-all below turned that 400
 * into "The scan failed", which told nobody anything.
 *
 * Both halves of that are fixed. The schema is generated from this object by
 * `zodOutputFormat`, so the wire shape cannot drift from the shape being
 * validated; and the error now says what actually happened.
 */
export const ReceiptLine = z.object({
  productName: z
    .string()
    .describe("The product exactly as printed, including brand and strength."),
  genericName: z.string().nullable().describe("Generic name if shown separately, else null."),
  quantity: z.number().int().describe("Units received on this line. 0 if unreadable."),
  unitCostCentavos: z
    .number()
    .int()
    .describe(
      "Cost PER UNIT in CENTAVOS (pesos x 100). If only a line total is printed, divide by the quantity first. 0 if unreadable.",
    ),
  expiryDate: z
    .string()
    .nullable()
    .describe("Expiry as yyyy-mm-dd, or null if not printed on this line."),
  lotNumber: z
    .string()
    .nullable()
    .describe("Lot or batch number if printed (LOT, BATCH, B/N), else null."),
});

export const ReceiptExtraction = z.object({
  supplierName: z
    .string()
    .nullable()
    .describe("Supplier or distributor name printed on the receipt, else null."),
  lines: z.array(ReceiptLine),
});

export type ReceiptExtractionValues = z.infer<typeof ReceiptExtraction>;

const SYSTEM = `You are a meticulous pharmacy receiving clerk in the Philippines reading a
supplier delivery receipt, sales invoice or packing slip.

- Read the supplier or distributor name, usually in the header.
- Capture each product line exactly as printed, brand and strength together.
- unitCostCentavos is the cost PER UNIT, in centavos. Philippine receipts often
  print a line total — divide it by the quantity before converting.
- Normalise expiry to yyyy-mm-dd. Receipts print "EXP 06/2027" or "06/27"; when
  only a month and year are given use the LAST day of that month, because that
  is what the pack means.
- Capture lot or batch numbers where printed.
- NEVER invent a value. Use null, or 0 for a number, when something is
  unreadable or absent. A guessed expiry date is worse than no expiry date.
- Ignore non-product lines: VAT, subtotal, discounts, delivery charges.`;

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  return m ? { mediaType: m[1]!, data: m[2]! } : null;
}

export type ScanOutcome =
  | { ok: true; data: ReceiptExtractionValues }
  | { ok: false; error: string };

export async function scanReceipt(dataUrl: string): Promise<ScanOutcome> {
  if (!receiptScanEnabled()) {
    return { ok: false, error: "Receipt scanning is not switched on for this pharmacy." };
  }

  const image = parseDataUrl(dataUrl);
  if (!image) return { ok: false, error: "That doesn't look like a photo." };
  if (!SUPPORTED.has(image.mediaType)) {
    return { ok: false, error: "Use a JPEG, PNG, WebP or GIF photo." };
  }
  // ~7.5MB of base64 is ~5.5MB of image — under the API's per-image ceiling,
  // and past the point where a counter's connection would finish uploading.
  if (image.data.length > 7_500_000) {
    return { ok: false, error: "That photo is too large. Take it again at a smaller size." };
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      // A receipt is a careful reading job, not a hard reasoning one, and the
      // counter is waiting. `medium` keeps it quick without getting sloppy.
      output_config: {
        effort: "medium",
        // Generated from the zod object above, so the schema on the wire and
        // the schema that validates the reply cannot disagree.
        format: zodOutputFormat(ReceiptExtraction),
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: image.data,
              },
            },
            {
              type: "text",
              text: "Extract the supplier and every product line from this receipt.",
            },
          ],
        },
      ],
    });

    // A refusal is an HTTP 200 with no usable content. Checked before reading
    // it, or the JSON parse below fails with a confusing message.
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "That photo could not be read. Enter the delivery by hand." };
    }

    // `parse` validates against the same zod object it built the schema from.
    // Null means the reply did not fit it — a sharper photo, not a bad request.
    const parsed = response.parsed_output;
    if (!parsed) {
      return { ok: false, error: "That receipt could not be read cleanly. Try a sharper photo." };
    }

    // Anything with no name is not a line somebody can check against the paper.
    const lines = parsed.lines.filter((l) => l.productName.trim() !== "");
    if (lines.length === 0) {
      return { ok: false, error: "No product lines were found on that photo." };
    }

    return { ok: true, data: { supplierName: parsed.supplierName, lines } };
  } catch (e) {
    /*
      SAY WHAT WENT WRONG.

      The previous version answered every failure with "The scan failed. Enter
      the delivery by hand." A request the API rejected outright, an expired
      key and a flat connection all read identically, so the one fault that was
      actually here — a malformed schema — could not be told apart from a bad
      photo. Reported, and fixed here as well as in the schema above.
    */
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Too many scans at once. Try again in a moment." };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The Anthropic API key is missing or not valid." };
    }
    if (e instanceof Anthropic.BadRequestError) {
      // Ours, not the photographer's. Printed rather than hidden, because the
      // person seeing it is the only one who can report it.
      return { ok: false, error: `The scan request was rejected: ${e.message.slice(0, 200)}` };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "Could not reach the scanning service. Check the connection." };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, error: `Scanning failed (${e.status}): ${e.message.slice(0, 200)}` };
    }
    const msg = e instanceof Error ? e.message.split("\n").find((l) => l.trim()) : "";
    return {
      ok: false,
      error: msg ? `The scan failed — ${msg.slice(0, 200)}` : "The scan failed. Enter the delivery by hand.",
    };
  }
}
