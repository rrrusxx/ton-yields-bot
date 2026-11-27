// Weekly card (Mondays, src/card/weekly.ts): a pure function from data to an SVG string (no I/O, no fonts
// loaded here). Every position is computed from font metrics, so nothing relies
// on the renderer's text layout except glyph drawing itself.
//
// Form (dataviz method): ranked horizontal bars, one hue, one shared zero
// baseline and one shared scale across both sections, values in a right-aligned
// tabular column, text in ink tokens (never the bar color), no legend (one
// series; the section titles name it).

import { capHeightPx, type FontMetrics, measureText } from "./font_metrics.ts";

export type Weight = 400 | 600 | 700;
export type FontSet = Record<Weight, FontMetrics>;

export interface CardRow {
  /** Protocol or product, primary ink, e.g. "Tonstakers". */
  name: string;
  /** Token or pool, secondary ink after the name, e.g. "tsTON". Optional. */
  detail?: string;
  /** APY in percent (12.1 means 12.1%). */
  apy: number;
}

export interface CardSection {
  /** Primary part of the section heading, e.g. "Liquid staking". */
  title: string;
  /** Secondary part, printed after ", ", e.g. "7-day APY measured on-chain". */
  note?: string;
  rows: CardRow[];
}

export interface WeeklyCardData {
  title: string;
  subtitle: string;
  sections: CardSection[];
  footer: { handle: string; sources: string };
}

export interface CardResult {
  svg: string;
  /** Anything the layout had to change (dropped glyphs, cut text, left-out rows). */
  warnings: string[];
  /** Computed geometry, for logs and tests. */
  layout: {
    pitch: number;
    labelSize: number;
    valueSize: number;
    barHeight: number;
    barX0: number;
    barMaxWidth: number;
    valueRight: number;
    rowsDrawn: number;
  };
}

export const CARD_WIDTH = 1600;
export const CARD_HEIGHT = 900;

/** Dark-mode tokens of the dataviz reference palette (validated on #1a1a19). */
export const COLORS = {
  surface: "#1a1a19",
  ink: "#f0efec", // 15.2:1 on surface
  ink2: "#c3c2b7", // 9.7:1
  muted: "#898781", // 4.9:1, separators only
  axis: "#383835", // baseline and rules
  bar: "#3987e5", // series slot 1, dark step
} as const;

const PAD_X = 80;
const PAD_TOP = 56;
const PAD_BOTTOM = 44;
const X_LEFT = PAD_X;
const X_RIGHT = CARD_WIDTH - PAD_X;

// Sizes are set for a phone: the card is shown about 350-400 pt wide, so it is
// scaled by roughly 0.22-0.25 (34 px here is about 8 pt on screen).
const TITLE_SIZE = 58;
const TITLE_TRACKING = -1.2; // Inter text cut at display size reads better slightly tight
const SUBTITLE_SIZE = 34;
const HEAD_SIZE = 34;
const FOOTER_SIZE = 28;
const HEADER_GAP = 56; // title baseline to the first section heading's cap top
const HEAD_TO_ROWS = 14; // section heading baseline to its first row
const SECTION_GAP = 34; // last row of a section to the next heading's cap top
const UNIT_SCALE = 0.72; // "%" drawn smaller, in secondary ink, so the digits lead
const MIN_PITCH = 40;
const MAX_PITCH = 64;
const LABEL_MAX_W = 520;
const GAP_LABEL_BAR = 40;
const GAP_BAR_VALUE = 40;
const BAR_RADIUS = 4;

const ELLIPSIS = "…";
const MINUS = "−";
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function formatApy(apy: number): string {
  if (!Number.isFinite(apy)) return "n/a";
  const s = Math.abs(apy).toFixed(1) + "%";
  return apy < 0 && s !== "0.0%" ? MINUS + s : s;
}

export function buildWeeklyCardSvg(data: WeeklyCardData, fonts: FontSet): CardResult {
  const warnings: string[] = [];
  const cap = (w: Weight, size: number) => capHeightPx(fonts[w], size);
  const width = (w: Weight, text: string, size: number, tracking = 0) =>
    measureText(fonts[w], text, size, tracking);
  const clean = (text: string, w: Weight, where: string) => sanitize(text, fonts[w], where, warnings);
  const out: string[] = [];

  // ---- header: title left, subtitle right on the same baseline (or below it)
  const titleBaseline = PAD_TOP + cap(700, TITLE_SIZE);
  const title = fit(fonts[700], clean(data.title, 700, "title"), TITLE_SIZE, X_RIGHT - X_LEFT, TITLE_TRACKING, warnings, "title");
  const titleW = width(700, title, TITLE_SIZE, TITLE_TRACKING);
  let subtitle = clean(data.subtitle, 400, "subtitle");
  let subtitleBaseline = titleBaseline;
  let subtitleAnchor: "end" | "start" = "end";
  if (titleW + 48 + width(400, subtitle, SUBTITLE_SIZE) > X_RIGHT - X_LEFT) {
    subtitleBaseline = titleBaseline + 46;
    subtitleAnchor = "start";
  }
  subtitle = fit(fonts[400], subtitle, SUBTITLE_SIZE, X_RIGHT - X_LEFT, 0, warnings, "subtitle");
  out.push(
    text(X_LEFT, titleBaseline, title, { size: TITLE_SIZE, weight: 700, fill: COLORS.ink, tracking: TITLE_TRACKING }),
    text(subtitleAnchor === "end" ? X_RIGHT : X_LEFT, subtitleBaseline, subtitle, {
      size: SUBTITLE_SIZE,
      weight: 400,
      fill: COLORS.ink2,
      anchor: subtitleAnchor,
    }),
  );

  // ---- footer: handle, separator dot, data providers
  const footerBaseline = CARD_HEIGHT - PAD_BOTTOM;
  const handle = clean(data.footer.handle, 600, "footer handle");
  const handleW = width(600, handle, FOOTER_SIZE);
  const gap = 2 * width(400, " ", FOOTER_SIZE);
  const dotX = X_LEFT + handleW + gap;
  const sourcesX = dotX + width(400, "·", FOOTER_SIZE) + gap;
  const sources = fit(fonts[400], clean(data.footer.sources, 400, "footer sources"), FOOTER_SIZE, X_RIGHT - sourcesX, 0, warnings, "footer sources");
  out.push(
    `<text y="${n(footerBaseline)}" font-size="${FOOTER_SIZE}">` +
      `<tspan x="${n(X_LEFT)}" font-weight="600" fill="${COLORS.ink}">${esc(handle)}</tspan>` +
      `<tspan x="${n(dotX)}" font-weight="400" fill="${COLORS.muted}">·</tspan>` +
      `<tspan x="${n(sourcesX)}" font-weight="400" fill="${COLORS.ink2}">${esc(sources)}</tspan>` +
      `</text>`,
  );

  // ---- vertical budget for the sections
  const contentTop = Math.max(titleBaseline, subtitleBaseline) + HEADER_GAP;
  const contentBottom = footerBaseline - cap(400, FOOTER_SIZE) - 34;
  const sections = data.sections
    .map((s) => ({ ...s, rows: rankRows(s.rows, warnings, s.title) }))
    .filter((s) => s.rows.length > 0);
  if (sections.length === 0) throw new Error("buildWeeklyCardSvg: no rows to draw");
  const headBlock = cap(600, HEAD_SIZE) + HEAD_TO_ROWS;
  const fixed = sections.length * headBlock + (sections.length - 1) * SECTION_GAP;
  const room = contentBottom - contentTop - fixed;
  // Leave out the lowest rows of the longest section until the rest fits.
  let total = sections.reduce((a, s) => a + s.rows.length, 0);
  while (total > 1 && room / total < MIN_PITCH) {
    const longest = sections.reduce((a, s) => (s.rows.length > a.rows.length ? s : a));
    const dropped = longest.rows.pop()!;
    warnings.push(`left out "${dropped.name}" (${longest.title}): more rows than the card can hold`);
    total--;
  }
  const pitch = Math.min(MAX_PITCH, room / total);
  const labelSize = clamp(Math.round(pitch * 0.74), 28, 44);
  const valueSize = labelSize + 5; // the number is the point of each row
  const barH = clamp(Math.round(pitch * 0.36), 12, 24);

  // ---- columns: labels (measured), bars (shared scale), values (tabular)
  const rows = sections.flatMap((s) => s.rows);
  const labels = rows.map((r) => {
    const name = clean(r.name, 600, "row name");
    const detail = r.detail ? clean(r.detail, 400, "row detail") : "";
    return fitLabel(fonts, name, detail, labelSize, LABEL_MAX_W, warnings);
  });
  const labelColW = clamp(
    Math.ceil(Math.max(...labels.map((l) => width(600, l.name, labelSize) + width(400, l.detail, labelSize)))),
    240,
    LABEL_MAX_W,
  );
  const values = rows.map((r) => formatApy(r.apy));
  const valueColW = Math.max(...values.map((v) => tabular(fonts[700], v, valueSize, 0, UNIT_SCALE).width));
  const barX0 = Math.round(X_LEFT + labelColW + GAP_LABEL_BAR);
  const barMaxW = Math.floor(X_RIGHT - valueColW - GAP_BAR_VALUE - barX0);
  if (barMaxW < 240) warnings.push(`bars are only ${barMaxW}px long: labels or values are too wide`);
  const scaleMax = Math.max(...rows.map((r) => (Number.isFinite(r.apy) ? r.apy : 0)), 1e-9);

  // ---- sections
  let y = contentTop;
  let i = 0;
  for (const s of sections) {
    const headBaseline = y + cap(600, HEAD_SIZE);
    const headTitle = clean(s.title, 600, "section title");
    const note = s.note ? clean(s.note, 400, "section note") : "";
    const headTitleW = width(600, headTitle, HEAD_SIZE);
    const noteText = note ? fit(fonts[400], ", " + note, HEAD_SIZE, X_RIGHT - X_LEFT - headTitleW - 80, 0, warnings, "section note") : "";
    out.push(
      `<text x="${n(X_LEFT)}" y="${n(headBaseline)}" font-size="${HEAD_SIZE}">` +
        `<tspan font-weight="600" fill="${COLORS.ink}">${esc(headTitle)}</tspan>` +
        (noteText ? `<tspan font-weight="400" fill="${COLORS.ink2}">${esc(noteText)}</tspan>` : "") +
        `</text>`,
    );
    const ruleX = Math.ceil(X_LEFT + headTitleW + width(400, noteText, HEAD_SIZE) + 24);
    if (ruleX < X_RIGHT - 40) {
      const ry = Math.round(headBaseline - cap(600, HEAD_SIZE) / 2);
      out.push(`<rect x="${ruleX}" y="${ry}" width="${X_RIGHT - ruleX}" height="1" fill="${COLORS.axis}"/>`);
    }

    const rowsTop = headBaseline + HEAD_TO_ROWS;
    // shared zero baseline for this section's bars
    const firstBarTop = rowsTop + (pitch - barH) / 2;
    const lastBarBottom = rowsTop + pitch * (s.rows.length - 1) + (pitch + barH) / 2;
    out.push(
      `<rect x="${barX0 - 2}" y="${n(firstBarTop - 6)}" width="1" height="${n(lastBarBottom - firstBarTop + 12)}" fill="${COLORS.axis}"/>`,
    );
    s.rows.forEach((r, k) => {
      const cy = rowsTop + pitch * (k + 0.5);
      const l = labels[i];
      out.push(
        `<text x="${n(X_LEFT)}" y="${n(cy + cap(600, labelSize) / 2)}" font-size="${labelSize}">` +
          `<tspan font-weight="600" fill="${COLORS.ink}">${esc(l.name)}</tspan>` +
          (l.detail ? `<tspan font-weight="400" fill="${COLORS.ink2}">${esc(l.detail)}</tspan>` : "") +
          `</text>`,
      );
      const len = r.apy > 0 && Number.isFinite(r.apy) ? (r.apy / scaleMax) * barMaxW : 0;
      if (len > 0) out.push(`<path d="${barPath(barX0, cy - barH / 2, len, barH)}" fill="${COLORS.bar}"/>`);
      const v = tabular(fonts[700], values[i], valueSize, X_RIGHT, UNIT_SCALE);
      const chars = [...values[i]];
      const unit = chars[chars.length - 1] === "%" ? chars.pop()! : "";
      const unitX = v.xs[chars.length];
      out.push(
        `<text x="${v.xs.slice(0, chars.length).map(n).join(" ")}" y="${n(cy + cap(700, valueSize) / 2)}" font-size="${valueSize}" font-weight="700" fill="${COLORS.ink}">${esc(chars.join(""))}` +
          (unit
            ? `<tspan x="${n(unitX)}" font-size="${n(valueSize * UNIT_SCALE)}" font-weight="600" fill="${COLORS.ink2}">${unit}</tspan>`
            : "") +
          `</text>`,
      );
      i++;
    });
    y = rowsTop + pitch * s.rows.length + SECTION_GAP;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" font-family="Inter">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLORS.surface}"/>` +
    out.join("") +
    `</svg>`;
  return {
    svg,
    warnings,
    layout: {
      pitch: Math.round(pitch * 10) / 10,
      labelSize,
      valueSize,
      barHeight: barH,
      barX0,
      barMaxWidth: barMaxW,
      valueRight: X_RIGHT,
      rowsDrawn: rows.length,
    },
  };
}

/** Rows ranked by APY, highest first (stable for ties); non-finite APYs dropped. */
function rankRows(rows: CardRow[], warnings: string[], where: string): CardRow[] {
  const kept = rows.filter((r) => {
    if (Number.isFinite(r.apy)) return true;
    warnings.push(`left out "${r.name}" (${where}): APY is not a number`);
    return false;
  });
  return kept.map((r, k) => ({ r, k })).sort((a, b) => b.r.apy - a.r.apy || a.k - b.k).map((x) => x.r);
}

/**
 * Tabular figures, emulated: each digit gets a slot as wide as the widest digit
 * and is centred in it; other characters keep their own advance. A trailing "%"
 * is measured at `unitScale` x size (it is drawn smaller). Returns one x per
 * character for SVG `x` lists, right-aligned at `rightX`.
 */
export function tabular(
  m: FontMetrics,
  s: string,
  size: number,
  rightX: number,
  unitScale = 1,
): { xs: number[]; width: number } {
  const scale = size / m.unitsPerEm;
  let slot = 0;
  for (let d = 0x30; d <= 0x39; d++) slot = Math.max(slot, m.advanceUnits(d));
  slot *= scale;
  const rel: number[] = [];
  let cursor = 0;
  const chars = [...s];
  for (const [k, ch] of chars.entries()) {
    const isUnit = ch === "%" && k === chars.length - 1;
    const adv = m.advanceUnits(ch.codePointAt(0)!) * scale * (isUnit ? unitScale : 1);
    if (ch >= "0" && ch <= "9") {
      rel.push(cursor + (slot - adv) / 2);
      cursor += slot;
    } else {
      rel.push(cursor);
      cursor += adv;
    }
  }
  const start = rightX - cursor;
  return { xs: rel.map((x) => start + x), width: cursor };
}

/** Square at the baseline, 4px rounded data end (dataviz mark spec). */
function barPath(x0: number, y: number, len: number, h: number): string {
  const r = Math.min(BAR_RADIUS, len, h / 2);
  const x1 = x0 + len;
  return `M${n(x0)} ${n(y)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y + h)}H${n(x0)}Z`;
}

/** Name and detail fitted into maxW: cut the detail first, then the name. */
function fitLabel(fonts: FontSet, name: string, detail: string, size: number, maxW: number, warnings: string[]) {
  const nameW = measureText(fonts[600], name, size);
  const d = detail ? " " + detail : "";
  if (nameW + measureText(fonts[400], d, size) <= maxW) return { name, detail: d };
  const room = maxW - nameW;
  if (detail && room >= measureText(fonts[400], " ab" + ELLIPSIS, size)) {
    warnings.push(`cut the label "${name}${d}" to fit`);
    return { name, detail: fit(fonts[400], d, size, room, 0, [], "") };
  }
  warnings.push(`cut the label "${name}${d}" to fit`);
  return { name: fit(fonts[600], name, size, maxW, 0, [], ""), detail: "" };
}

/** Cut text with an ellipsis until it fits maxW. */
function fit(m: FontMetrics, s: string, size: number, maxW: number, tracking: number, warnings: string[], where: string): string {
  if (measureText(m, s, size, tracking) <= maxW) return s;
  const chars = [...s];
  while (chars.length > 1 && measureText(m, chars.join("").trimEnd() + ELLIPSIS, size, tracking) > maxW) chars.pop();
  if (where) warnings.push(`cut the ${where} to fit`);
  return chars.join("").trimEnd() + ELLIPSIS;
}

/** One line, no control or direction characters, only glyphs the font has. */
function sanitize(s: string, m: FontMetrics, where: string, warnings: string[]): string {
  let out = "";
  let dropped = 0;
  for (const ch of String(s).replace(BIDI, "").replace(/\s+/g, " ").trim()) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || !m.hasGlyph(cp)) {
      dropped++;
      continue;
    }
    out += ch;
  }
  if (dropped) warnings.push(`${where}: left out ${dropped} character(s) the font cannot draw (emoji are not supported)`);
  return out.replace(/\s+/g, " ").trim();
}

function text(
  x: number,
  y: number,
  s: string,
  o: { size: number; weight: Weight; fill: string; anchor?: "start" | "end"; tracking?: number },
): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}"` +
    (o.anchor === "end" ? ` text-anchor="end"` : "") +
    (o.tracking ? ` letter-spacing="${o.tracking}"` : "") +
    `>${esc(s)}</text>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
