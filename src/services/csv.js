// Minimal RFC-4180-ish CSV parser (handles quotes, commas, CRLF).
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
  const s = (text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// Maps a header row to a lookup: header name (normalized) -> column index.
export function headerIndex(headerRow) {
  const norm = headerRow.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return (names) => {
    for (const n of names) { const i = norm.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
}
