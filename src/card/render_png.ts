// SVG -> PNG with resvg compiled to WebAssembly (npm:@resvg/resvg-wasm, MPL-2.0).
// No native modules and no system fonts: the wasm build cannot read system
// fonts at all, so every font is passed in as bytes.

import { initWasm, Resvg } from "@resvg/resvg-wasm";

let ready: Promise<void> | undefined;

/**
 * Loads resvg's .wasm from the npm package already on disk (Deno's npm cache;
 * `import.meta.resolve` turns the specifier into a file:// URL), so rendering
 * makes no network request. initWasm may run only once per process.
 */
export function initRenderer(): Promise<void> {
  ready ??= (async () => {
    const wasmUrl = new URL(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm"));
    await initWasm(await Deno.readFile(wasmUrl));
  })();
  return ready;
}

export interface RenderedPng {
  png: Uint8Array;
  width: number;
  height: number;
  /** RGBA pixels, only when `keepPixels` was asked for (for checks). */
  pixels?: Uint8Array;
}

export async function renderPng(
  svg: string,
  fontBuffers: Uint8Array[],
  opts: { width?: number; keepPixels?: boolean } = {},
): Promise<RenderedPng> {
  await initRenderer();
  const resvg = new Resvg(svg, {
    font: { fontBuffers, defaultFontFamily: "Inter", sansSerifFamily: "Inter" },
    fitTo: opts.width ? { mode: "width", value: opts.width } : { mode: "original" },
  });
  try {
    const image = resvg.render();
    try {
      return {
        png: image.asPng(),
        width: image.width,
        height: image.height,
        pixels: opts.keepPixels ? image.pixels.slice() : undefined,
      };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

/** Pixels within `margin` px of an edge that differ from the background. */
export function inkInMargin(p: RenderedPng, margin: number, bg: string): number {
  if (!p.pixels) throw new Error("inkInMargin: render with keepPixels");
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  let hits = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (x >= margin && x < p.width - margin && y >= margin && y < p.height - margin) continue;
      const o = (y * p.width + x) * 4;
      const d = Math.abs(p.pixels[o] - r) + Math.abs(p.pixels[o + 1] - g) + Math.abs(p.pixels[o + 2] - b);
      if (d > 6) hits++;
    }
  }
  return hits;
}
