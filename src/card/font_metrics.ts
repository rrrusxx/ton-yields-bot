// Minimal, dependency-free reader of the font tables the card layout needs:
// advance widths (cmap + hmtx), unitsPerEm, cap height and x-height (OS/2).
//
// Why it exists: resvg (the SVG renderer) ignores `font-feature-settings` and
// `font-variant-numeric`, so Inter's tabular figures (`tnum`) cannot be switched
// on. The card emulates them by placing every digit in an equal-width slot, and
// that needs real advance widths. The same widths let the layout measure labels
// before it places them (kerning is ignored, which overestimates widths by a few
// pixels: safe for fit checks).

export interface FontMetrics {
  readonly unitsPerEm: number;
  /** OS/2 sCapHeight in font units (falls back to 0.7 em on old fonts). */
  readonly capHeight: number;
  /** OS/2 sxHeight in font units (falls back to 0.5 em on old fonts). */
  readonly xHeight: number;
  /** True when the font maps this code point to a real glyph. */
  hasGlyph(codePoint: number): boolean;
  /** Advance width of one code point in font units (.notdef when missing). */
  advanceUnits(codePoint: number): number;
}

type TableRecord = { offset: number; length: number };

export function parseFontMetrics(bytes: Uint8Array): FontMetrics {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(0);
  // 0x00010000 TrueType, "true" (old Apple), "OTTO" (CFF). Collections and
  // WOFF/WOFF2 are rejected: this reader does not decompress them (resvg-wasm
  // 2.6.2 itself does draw WOFF2, tested), so the card ships TTF files.
  if (version !== 0x00010000 && version !== 0x74727565 && version !== 0x4f54544f) {
    throw new Error("parseFontMetrics: not a TTF/OTF file (TTC, WOFF and WOFF2 are not supported)");
  }
  const tables = new Map<string, TableRecord>();
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(
      dv.getUint8(rec),
      dv.getUint8(rec + 1),
      dv.getUint8(rec + 2),
      dv.getUint8(rec + 3),
    );
    tables.set(tag, { offset: dv.getUint32(rec + 8), length: dv.getUint32(rec + 12) });
  }
  const need = (tag: string): TableRecord => {
    const t = tables.get(tag);
    if (!t) throw new Error(`parseFontMetrics: font has no '${tag}' table`);
    return t;
  };

  const unitsPerEm = dv.getUint16(need("head").offset + 18);
  const numberOfHMetrics = dv.getUint16(need("hhea").offset + 34);
  const hmtx = need("hmtx").offset;

  let capHeight = Math.round(unitsPerEm * 0.7);
  let xHeight = Math.round(unitsPerEm * 0.5);
  const os2 = tables.get("OS/2");
  if (os2 && os2.length >= 90 && dv.getUint16(os2.offset) >= 2) {
    xHeight = dv.getInt16(os2.offset + 86);
    capHeight = dv.getInt16(os2.offset + 88);
  }

  const glyphOf = makeCmapLookup(dv, need("cmap").offset);
  const cache = new Map<number, number>();
  const advanceOfGlyph = (gid: number): number => {
    const i = Math.min(gid, numberOfHMetrics - 1);
    return dv.getUint16(hmtx + i * 4);
  };

  return {
    unitsPerEm,
    capHeight,
    xHeight,
    hasGlyph: (cp) => glyphOf(cp) !== 0,
    advanceUnits(cp) {
      let a = cache.get(cp);
      if (a === undefined) {
        a = advanceOfGlyph(glyphOf(cp));
        cache.set(cp, a);
      }
      return a;
    },
  };
}

/** Width of a string in px at `size`, from advance widths (no kerning). */
export function measureText(m: FontMetrics, text: string, size: number, letterSpacing = 0): number {
  let units = 0;
  let n = 0;
  for (const ch of text) {
    units += m.advanceUnits(ch.codePointAt(0)!);
    n++;
  }
  return (units * size) / m.unitsPerEm + Math.max(0, n - 1) * letterSpacing;
}

/** Cap height in px at `size`. */
export function capHeightPx(m: FontMetrics, size: number): number {
  return (m.capHeight * size) / m.unitsPerEm;
}

// cmap: prefer a full-Unicode format 12 subtable, else the BMP format 4 one.
function makeCmapLookup(dv: DataView, cmap: number): (cp: number) => number {
  const n = dv.getUint16(cmap + 2);
  let fmt12 = -1;
  let fmt4 = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = dv.getUint16(rec);
    const encoding = dv.getUint16(rec + 2);
    const sub = cmap + dv.getUint32(rec + 4);
    const format = dv.getUint16(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12 && fmt12 < 0) fmt12 = sub;
    if (format === 4 && fmt4 < 0) fmt4 = sub;
  }
  if (fmt12 >= 0) {
    const groups = dv.getUint32(fmt12 + 12);
    return (cp) => {
      let lo = 0;
      let hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = fmt12 + 16 + mid * 12;
        const start = dv.getUint32(g);
        const end = dv.getUint32(g + 4);
        if (cp < start) hi = mid - 1;
        else if (cp > end) lo = mid + 1;
        else return dv.getUint32(g + 8) + (cp - start);
      }
      return 0;
    };
  }
  if (fmt4 >= 0) {
    const segX2 = dv.getUint16(fmt4 + 6);
    const ends = fmt4 + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segX2 / 2; i++) {
        if (dv.getUint16(ends + i * 2) < cp) continue;
        const start = dv.getUint16(starts + i * 2);
        if (start > cp) return 0;
        const delta = dv.getInt16(deltas + i * 2);
        const rangeOffset = dv.getUint16(ranges + i * 2);
        if (rangeOffset === 0) return (cp + delta) & 0xffff;
        const addr = ranges + i * 2 + rangeOffset + (cp - start) * 2;
        const g = dv.getUint16(addr);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
      return 0;
    };
  }
  throw new Error("parseFontMetrics: no Unicode cmap subtable (format 4 or 12)");
}
