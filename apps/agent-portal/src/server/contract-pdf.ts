import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * The signed contract as a PDF: the agreement exactly as the customer saw it,
 * then who signed, when, from where, and their drawn signature.
 *
 * pdf-lib's standard fonts are WinAnsi: no ₱. Money is written "PHP" in the
 * PDF, and any other character the font cannot draw becomes "?" rather than
 * aborting the whole document.
 */
function winAnsi(text: string): string {
  return text
    .replace(/₱\s?/g, "PHP ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "?");
}

export async function contractPdf(input: {
  title: string;
  body: string;
  signerName: string;
  signerPosition: string;
  signerPhone: string;
  signedAtLabel: string;
  ip: string | null;
  userAgent: string | null;
  signaturePng: Uint8Array;
  templateVersion: number;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const margin = 56;
  const width = A4[0] - margin * 2;
  let page = pdf.addPage(A4);
  let y = A4[1] - margin;

  const line = (text: string, size = 10, f = font, gap = 4) => {
    if (y < margin + size) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
    page.drawText(text, { x: margin, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + gap;
  };
  const paragraph = (text: string, size = 10, f = font) => {
    for (const raw of winAnsi(text).split("\n")) {
      if (raw.trim() === "") {
        y -= size;
        continue;
      }
      let current = "";
      for (const word of raw.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && current) {
          line(current, size, f);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) line(current, size, f);
    }
  };

  paragraph(input.title, 16, bold);
  y -= 8;
  paragraph(input.body);
  y -= 16;
  paragraph("Signed", 12, bold);
  paragraph(`Name: ${input.signerName}`);
  paragraph(`Position: ${input.signerPosition}`);
  paragraph(`Phone: ${input.signerPhone}`);
  paragraph(`Signed at: ${input.signedAtLabel}`);
  paragraph(`Template version: ${input.templateVersion}`);
  if (input.ip) paragraph(`IP address: ${input.ip}`);
  if (input.userAgent) paragraph(`Device: ${input.userAgent.slice(0, 200)}`, 8);

  const sig = await pdf.embedPng(input.signaturePng);
  const scale = Math.min(220 / sig.width, 90 / sig.height, 1);
  const h = sig.height * scale;
  if (y - h < margin) {
    page = pdf.addPage(A4);
    y = A4[1] - margin;
  }
  page.drawImage(sig, { x: margin, y: y - h - 6, width: sig.width * scale, height: h });

  pdf.setTitle(winAnsi(input.title));
  pdf.setCreator("CANVEXIA agent portal");
  return pdf.save();
}
