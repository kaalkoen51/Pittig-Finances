/**
 * Small CSV reader for bank exports. Handles a UTF-8 BOM, `;` / `,` / tab separators (auto-detected),
 * quoted fields with doubled quotes and embedded newlines, and CRLF / LF line endings.
 */

export type CsvSeparator = ';' | ',' | '\t';

/** Pick the separator that splits the first lines most consistently (outside quotes). */
export function detectSeparator(text: string): CsvSeparator {
  const lines = splitLogicalLines(stripBom(text)).filter((l) => l.trim() !== '').slice(0, 10);
  const candidates: CsvSeparator[] = [';', '\t', ','];
  let best: CsvSeparator = ',';
  let bestScore = -1;
  for (const sep of candidates) {
    const counts = lines.map((l) => countOutsideQuotes(l, sep));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    // Consistent column count across lines scores highest; ties go to the earlier (;) candidate.
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = sep;
    }
  }
  return best;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countOutsideQuotes(line: string, sep: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) n++;
  }
  return n;
}

/** Split into lines but keep newlines that are inside quotes. */
function splitLogicalLines(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') q = !q;
    if (!q && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur !== '') out.push(cur);
  return out;
}

/** Parse CSV text into rows of trimmed strings. Empty trailing lines are dropped. */
export function parseCsv(input: string, separator?: CsvSeparator): string[][] {
  const text = stripBom(input);
  const sep = separator ?? detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (ch === sep) endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (!(wasQuoted && !quoted)) field += ch; // ignore junk after a closing quote
  }
  if (field !== '' || row.length > 0 || wasQuoted) endRow();
  // Drop completely empty lines.
  return rows.filter((r) => r.some((c) => c !== ''));
}
