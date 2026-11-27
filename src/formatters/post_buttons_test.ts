import { assertEquals } from "std/assert/mod.ts";
import { postButtons, publicPostUrl } from "./post_buttons.ts";

Deno.test("post links exist only for public @usernames", () => {
  assertEquals(publicPostUrl("@ton_yields_daily", 351), "https://t.me/ton_yields_daily/351");
  assertEquals(publicPostUrl(" @ton_yields_test ", 7), "https://t.me/ton_yields_test/7");
  assertEquals(publicPostUrl("-1001234567890", 351), null); // numeric id: no public link
  assertEquals(publicPostUrl("@a/b", 351), null);
  assertEquals(publicPostUrl("@ton_yields_daily", 0), null);
});

Deno.test("How we calculate appears only when the channel has a pinned post; there is no Share button", () => {
  const pinned = "https://t.me/ton_yields_daily/352";
  assertEquals(postButtons(pinned), [[{ text: "ℹ️ How we calculate", url: pinned }]]);
  assertEquals(postButtons(null), []);
});
