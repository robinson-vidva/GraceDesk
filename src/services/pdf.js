import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { one, run, insert } from '../db.js';
import { memberContributions } from './contributions.js';
import { fullName } from './members.js';
import { formatMoney } from './settings.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return rgb(0.12, 0.35, 0.42);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Builds a monthly or annual giving statement PDF. Returns Uint8Array.
export async function buildStatement(settings, member, rows, { type, year, month }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = hexToRgb(settings.primary_color);
  const ink = rgb(0.16, 0.15, 0.12);
  const muted = rgb(0.42, 0.4, 0.38);

  let page = doc.addPage([612, 792]);
  const M = 54; // margin
  let y = 792 - M;
  const cur = member._currency || settings.currency || 'USD';

  const text = (s, x, yy, { size = 10, f = font, color = ink } = {}) =>
    page.drawText(String(s ?? ''), { x, y: yy, size, font: f, color });

  // Church header
  text(settings.church_name || 'Church', M, y, { size: 18, f: bold, color: brand });
  y -= 16;
  const addr = [settings.church_address_line1, [settings.church_city, settings.church_state, settings.church_zip].filter(Boolean).join(', ')].filter(Boolean);
  for (const line of addr) { text(line, M, y, { size: 9, color: muted }); y -= 12; }
  if (settings.ein_tax_id) { text(`Tax ID: ${settings.ein_tax_id}`, M, y, { size: 9, color: muted }); y -= 12; }

  // Title
  y -= 12;
  const title = type === 'annual'
    ? `${year} Annual Giving Statement`
    : `Giving Statement — ${MONTHS[month]} ${year}`;
  text(title, M, y, { size: 13, f: bold });
  y -= 22;

  // Member block
  text('Provided to:', M, y, { size: 9, color: muted }); y -= 13;
  text(fullName(member), M, y, { size: 11, f: bold }); y -= 13;
  const maddr = [member.address_line1, member.address_line2, [member.city, member.state, member.postal_code].filter(Boolean).join(', ')].filter(Boolean);
  for (const line of maddr) { text(line, M, y, { size: 9, color: muted }); y -= 12; }
  y -= 10;

  // Table header
  const cols = [M, M + 78, M + 168, M + 300, M + 400];
  const drawHeader = () => {
    text('Date', cols[0], y, { size: 9, f: bold, color: muted });
    text('Amount', cols[1], y, { size: 9, f: bold, color: muted });
    text('Method', cols[2], y, { size: 9, f: bold, color: muted });
    text('Category', cols[3], y, { size: 9, f: bold, color: muted });
    text('Receipt', cols[4], y, { size: 9, f: bold, color: muted });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: 558, y }, thickness: 0.5, color: rgb(0.85, 0.82, 0.77) });
    y -= 12;
  };
  drawHeader();

  let total = 0;
  for (const r of rows) {
    if (y < M + 60) { page = doc.addPage([612, 792]); y = 792 - M; drawHeader(); }
    total += r.amount;
    text(r.date, cols[0], y, { size: 9 });
    text(formatMoney(r.amount, cur), cols[1], y, { size: 9 });
    text((r.method || '').replace('_', ' '), cols[2], y, { size: 9 });
    text(r.category || '—', cols[3], y, { size: 9 });
    text(r.receipt_number || '—', cols[4], y, { size: 9 });
    y -= 14;
  }

  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: 558, y }, thickness: 0.5, color: rgb(0.85, 0.82, 0.77) });
  y -= 16;
  text('Total', cols[0], y, { size: 11, f: bold });
  text(formatMoney(total, cur), cols[1], y, { size: 11, f: bold });
  y -= 28;

  if (type === 'annual') {
    text('No goods or services were provided in exchange for these contributions,', M, y, { size: 9, color: muted });
    y -= 12;
    text('other than intangible religious benefits.', M, y, { size: 9, color: muted });
    y -= 20;
  }
  text('Thank you for your generosity.', M, y, { size: 9, color: muted });

  return doc.save();
}

// Returns a cached PDF from R2 if valid, otherwise generates, caches, and returns it.
export async function getOrBuildStatement(env, settings, member, { type, year, month }) {
  const churchId = settings.church_id;
  const key = `reports/${churchId}/${member.id}/${type}-${year}${type === 'monthly' ? '-' + month : ''}.pdf`;

  const cached = await one(env.DB,
    `SELECT * FROM report_cache WHERE church_id=? AND member_id=? AND report_type=? AND period_year=? AND period_month IS ? AND is_valid=1`,
    churchId, member.id, type, year, type === 'monthly' ? month : null);
  if (cached) {
    const obj = await env.FILES.get(key);
    if (obj) return new Uint8Array(await obj.arrayBuffer());
  }

  // Build fresh.
  let rows = await memberContributions(env.DB, churchId, member.id, { year });
  if (type === 'monthly') {
    const mm = String(month).padStart(2, '0');
    rows = rows.filter((r) => r.date.slice(0, 7) === `${year}-${mm}`);
  }
  rows = rows.slice().reverse(); // chronological in the statement
  const bytes = await buildStatement(settings, member, rows, { type, year: Number(year), month: Number(month) });

  await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  // Upsert cache row.
  const existing = await one(env.DB,
    `SELECT id FROM report_cache WHERE church_id=? AND member_id=? AND report_type=? AND period_year=? AND period_month IS ?`,
    churchId, member.id, type, year, type === 'monthly' ? month : null);
  if (existing) {
    await run(env.DB, 'UPDATE report_cache SET file_key=?, generated_at=datetime(\'now\'), is_valid=1 WHERE id=?', key, existing.id);
  } else {
    await insert(env.DB,
      'INSERT INTO report_cache (church_id, member_id, report_type, period_year, period_month, file_key) VALUES (?, ?, ?, ?, ?, ?)',
      churchId, member.id, type, year, type === 'monthly' ? month : null, key);
  }
  return bytes;
}
