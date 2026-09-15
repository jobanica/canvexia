/**
 * CSV, for territory import and export.
 *
 * WRITTEN RATHER THAN INSTALLED, and that is a considered trade rather than
 * pride: the brief is 143 rows of five short fields, the repository's rule is
 * not to add a paid or heavyweight dependency without asking, and the parts of
 * CSV that are genuinely hard — encodings, streaming, a megabyte of quoted
 * newlines — are not in scope for a file somebody exports from this screen and
 * re-imports after editing it in Excel.
 *
 * What it DOES handle, because a spreadsheet will produce all of it:
 *   - quoted fields containing commas
 *   - doubled quotes ("" inside a quoted field)
 *   - newlines inside quoted fields
 *   - CRLF line endings, and a trailing newline
 *   - a UTF-8 BOM, which Excel writes and which otherwise corrupts the first
 *     header name into something that matches nothing
 *
 * What it does NOT: alternative delimiters, alternative encodings, escaped
 * quotes with a backslash. Each would be a guess about a file nobody has shown
 * us, and guessing wrong is worse than refusing.
 */

/** One parsed row, keyed by the header names as they appeared. */
export type CsvRow = Record<string, string>;

export interface CsvParse {
  headers: string[];
  rows: CsvRow[];
}

/**
 * Split CSV text into a grid of raw cells.
 *
 * A character-at-a-time scanner rather than a regex or a split on commas: a
 * split cannot see that a comma is inside quotes, which is the one thing that
 * actually matters here. A city called "Santa Cruz, Laguna" is not exotic.
 */
export function parseCsvGrid(text: string): string[][] {
  // Excel's byte-order mark. Left in place it becomes part of the first header
  // name, which then matches no column and the import silently drops a field.
  const src = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        // A doubled quote is a literal quote; a single one closes the field.
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }

    if (c === '"' && cell === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (c === "\r") {
      // CRLF and a bare CR both end the row. Consuming the LF here is what
      // stops a Windows file producing a blank row between every real one.
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }

    cell += c;
    i += 1;
  }

  // The last row, unless the file ended with a newline and nothing after it —
  // in which case there is no last row, and adding one would produce a phantom
  // empty record on every well-formed export.
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

/** Parse with the first row as headers. Blank lines are dropped. */
export function parseCsv(text: string): CsvParse {
  const grid = parseCsvGrid(text).filter(
    (r) => r.length > 1 || (r[0] ?? "").trim() !== "",
  );
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((h, n) => {
      row[h] = (cells[n] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

/**
 * Quote a value only when it needs it.
 *
 * Quoting everything would be valid CSV and would also make the exported file
 * unpleasant to read and to diff, which matters because the intended workflow
 * is export → edit → import.
 */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Serialise rows under a fixed set of headers.
 *
 * CRLF and a trailing newline, both because Excel expects them — a file with
 * bare LF endings opens with every row on one line in some versions, and the
 * first thing anyone does with an export is open it in Excel.
 */
export function toCsv<T extends Record<string, unknown>>(
  headers: readonly (keyof T & string)[],
  rows: readonly T[],
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvCell(r[h] as string | number | null)).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
