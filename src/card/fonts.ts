// Inter 4.1 static TTFs (the "text" cut), SIL Open Font License 1.1, no Reserved
// Font Name (see assets/fonts/OFL.txt, which must ship with the files).
// Source: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
//   (33,707,794 bytes, sha256 9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e),
//   files taken from extras/ttf/. Static instances, not InterVariable.ttf: one
//   file per weight is what resvg's font matching is known to handle.
// Inter's default digits are proportional; the card emulates tabular figures
// (see `tabular()` in weekly_card.ts) because resvg ignores `tnum`.

import { parseFontMetrics } from "./font_metrics.ts";
import type { FontSet, Weight } from "./weekly_card.ts";

export const INTER_FILES: Record<Weight, { file: string; bytes: number; sha256: string }> = {
  400: {
    file: "Inter-Regular.ttf",
    bytes: 411_640,
    sha256: "40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82",
  },
  600: {
    file: "Inter-SemiBold.ttf",
    bytes: 419_744,
    sha256: "78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3",
  },
  700: {
    file: "Inter-Bold.ttf",
    bytes: 420_428,
    sha256: "288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f",
  },
};

export interface LoadedFonts {
  /** Raw files for resvg (`font.fontBuffers`). */
  buffers: Uint8Array[];
  /** Parsed metrics for the layout. */
  metrics: FontSet;
}

/** The bundled fonts: assets/fonts in the repository */
export const FONTS_DIR = new URL("../../assets/fonts/", import.meta.url);

export async function loadFonts(dir: URL = FONTS_DIR): Promise<LoadedFonts> {
  const weights = [400, 600, 700] as const;
  const buffers = await Promise.all(weights.map((w) => Deno.readFile(new URL(INTER_FILES[w].file, dir))));
  const metrics = {} as FontSet;
  weights.forEach((w, i) => (metrics[w] = parseFontMetrics(buffers[i])));
  return { buffers, metrics };
}
