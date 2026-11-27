/**
 * Builds the deployable modules from their sources (only .js files inside
 * tgcloud/ are deployed):
 * - widget/yields.html → tgcloud/lib/widget_html.js, refusing a widget over
 *   Telegram's limits;
 * - sample/snapshot.json → tgcloud/lib/data.js.
 * Run from serverless/: deno run --allow-read --allow-write scripts/build.ts
 */

import {
  compressedSize,
  dataModule,
  minify,
  WIDGET_COMPRESSED_TARGET,
  WIDGET_HTML_LIMIT,
  widgetModule,
} from "./build_lib.ts";

const root = new URL("../", import.meta.url);
const source = await Deno.readTextFile(new URL("widget/yields.html", root));
const html = minify(source);
const bytes = new TextEncoder().encode(html).length;
const compressed = compressedSize(html);
if (bytes > WIDGET_HTML_LIMIT || compressed > WIDGET_COMPRESSED_TARGET) {
  throw new Error(`The widget is too large: ${bytes} bytes, ${compressed} compressed (limits ${WIDGET_HTML_LIMIT} and ${WIDGET_COMPRESSED_TARGET})`);
}
await Deno.writeTextFile(new URL("tgcloud/lib/widget_html.js", root), widgetModule(source));
await Deno.writeTextFile(new URL("tgcloud/lib/data.js", root), dataModule(await Deno.readTextFile(new URL("sample/snapshot.json", root))));
console.log(`widget: ${bytes} bytes, ${compressed} compressed (limit 4096); data: sample/snapshot.json`);
