/**
 * Philippine mobile numbers, normalised one way.
 *
 * In packages/core because TWO apps need it — the waitlist on canvexia.com and
 * the partner pipeline, which run in different Next processes. It is pure, so
 * it belongs here rather than in packages/db.
 *
 * Somebody will ring these. The same person types 0917, +63 917, 63917 and
 * (0917) 123-4567, and four spellings of one number is four rows that look like
 * four people and a duplicate check that never fires. So the number is
 * normalised to +639XXXXXXXXX on the way in, and the stored column has exactly
 * one shape.
 *
 * Only mobiles. A landline ("082 224 1234") cannot receive an SMS, and
 * accepting one means finding out weeks later, from someone who never got a
 * message. PH mobiles are 10 digits beginning with 9.
 */
export function normalizeMobile(raw: string): string | null {
  // Keep the leading + if it is there; drop every separator a person might
  // type — spaces, dashes, dots, parentheses, and the non-breaking space that
  // arrives when a number is pasted out of a chat app.
  const cleaned = raw.replace(/[\s ().\-]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) return null;

  let digits = cleaned.replace(/^\+/, "");

  // 00 is the international access prefix dialled from a PH landline.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // 63 = the country code, with or without the +.
  if (digits.startsWith("63")) digits = digits.slice(2);
  // 0 = the national trunk prefix, which is dropped in the international form.
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // What must remain is the subscriber number: 9 followed by nine digits.
  if (!/^9\d{9}$/.test(digits)) return null;
  return `+63${digits}`;
}

/** The message shown when it does not parse. One place, so two forms agree. */
export const MOBILE_HELP =
  "That doesn't look like a PH mobile number — 0917 123 4567 or +63 917 123 4567.";
