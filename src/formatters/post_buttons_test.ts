import { assertEquals } from "std/assert/mod.ts";
import { postButtons, publicPostUrl, SHARE_TEXT, shareButton } from "./post_buttons.ts";

Deno.test("post links exist only for public @usernames", () => {
  assertEquals(publicPostUrl("@ton_yields_daily", 351), "https://t.me/ton_yields_daily/351");
  assertEquals(publicPostUrl(" @ton_yields_test ", 7), "https://t.me/ton_yields_test/7");
  assertEquals(publicPostUrl("-1001234567890", 351), null); // numeric id: no public link
  assertEquals(publicPostUrl("@a/b", 351), null);
  assertEquals(publicPostUrl("@ton_yields_daily", 0), null);
});

Deno.test("the Share button opens Telegram's share sheet with the post link and one line of text", () => {
  const button = shareButton("https://t.me/ton_yields_daily/351");
  assertEquals(button.text, "↗️ Share");
  const url = new URL(button.url);
  assertEquals(url.origin + url.pathname, "https://t.me/share/url");
  assertEquals(url.searchParams.get("url"), "https://t.me/ton_yields_daily/351");
  assertEquals(url.searchParams.get("text"), SHARE_TEXT);
});

Deno.test("buttons appear only when their link exists", () => {
  const post = "https://t.me/ton_yields_daily/351";
  const pinned = "https://t.me/ton_yields_daily/352";
  assertEquals(postButtons(post, pinned).map((row) => row.map((b) => b.text)), [["↗️ Share", "ℹ️ How we calculate"]]);
  assertEquals(postButtons(post, pinned)[0][1].url, pinned);
  assertEquals(postButtons(null, pinned).map((row) => row.map((b) => b.text)), [["ℹ️ How we calculate"]]);
  assertEquals(postButtons(post, null).map((row) => row.map((b) => b.text)), [["↗️ Share"]]);
  assertEquals(postButtons(null, null), []);
});
