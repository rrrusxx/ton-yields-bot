import { assert, assertEquals, assertRejects } from "std/assert/mod.ts";
import { type Bot, GrammyError, HttpError } from "grammy";
import { describeSendError, sendCard, sendDigest } from "./bot.ts";
import { postFormatFrom } from "./config.ts";

/** A bot whose API calls are recorded; `richFails` makes sendRichMessage throw */
function fakeBot(options: { pinnedId?: number; richFails?: Error } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let nextId = 100;
  const api = {
    getChat: (...args: unknown[]) => {
      calls.push({ method: "getChat", args });
      return Promise.resolve(options.pinnedId ? { pinned_message: { message_id: options.pinnedId } } : {});
    },
    sendMessage: (...args: unknown[]) => {
      calls.push({ method: "sendMessage", args });
      return Promise.resolve({ message_id: nextId++ });
    },
    sendRichMessage: (...args: unknown[]) => {
      calls.push({ method: "sendRichMessage", args });
      return options.richFails ? Promise.reject(options.richFails) : Promise.resolve({ message_id: nextId++ });
    },
    sendPhoto: (...args: unknown[]) => {
      calls.push({ method: "sendPhoto", args });
      return Promise.resolve({ message_id: nextId++, photo: [{ width: 320, height: 180 }, { width: 1600, height: 900 }] });
    },
    editMessageReplyMarkup: (...args: unknown[]) => {
      calls.push({ method: "editMessageReplyMarkup", args });
      return Promise.resolve(true);
    },
  };
  return { bot: { api } as unknown as Bot, calls };
}

const digest = { html: "<b>TON Yields Daily</b>", richHtml: "<h3>TON Yields Daily</h3>" };
const refused = () =>
  new GrammyError(
    "Call to 'sendRichMessage' failed!",
    { ok: false, error_code: 400, description: "Bad Request: can't parse rich message" },
    "sendRichMessage",
    {},
  );

/** Run `fn` with console output swallowed */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const real = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, { log: () => {}, warn: () => {}, error: () => {} });
  try {
    return await fn();
  } finally {
    Object.assign(console, real);
  }
}

const methods = (calls: Array<{ method: string }>) => calls.map((c) => c.method);

Deno.test("the classic post goes out with sendMessage, then gets its Share button", async () => {
  const { bot, calls } = fakeBot({ pinnedId: 42 });
  await quietly(() => sendDigest(bot, digest, "classic", "@ton_yields_test"));
  assertEquals(methods(calls), ["getChat", "sendMessage", "editMessageReplyMarkup"]);
  const [, text, extra] = calls[1].args as [string, string, { parse_mode: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; url: string }>> } }];
  assertEquals(text, digest.html);
  assertEquals(extra.parse_mode, "HTML");
  assertEquals(extra.reply_markup.inline_keyboard[0][0].url, "https://t.me/ton_yields_test/42");
});

Deno.test("the rich post goes out with sendRichMessage and no automatic entity detection", async () => {
  const { bot, calls } = fakeBot();
  await quietly(() => sendDigest(bot, digest, "rich", "@ton_yields_test"));
  assertEquals(methods(calls), ["getChat", "sendRichMessage", "editMessageReplyMarkup"]);
  assertEquals(calls[1].args.slice(0, 2), ["@ton_yields_test", { html: digest.richHtml, skip_entity_detection: true }]);
  const [, , markup] = calls[2].args as [string, number, { reply_markup: { inline_keyboard: Array<Array<{ url: string }>> } }];
  assertEquals(markup.reply_markup.inline_keyboard[0][0].url.startsWith("https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fton_yields_test%2F100"), true);
});

Deno.test("a rich message Telegram refuses (400) is replaced by the classic post", async () => {
  const { bot, calls } = fakeBot({ richFails: refused() });
  await quietly(() => sendDigest(bot, digest, "rich", "@ton_yields_test"));
  assertEquals(methods(calls), ["getChat", "sendRichMessage", "sendMessage", "editMessageReplyMarkup"]);
  assertEquals(calls[2].args[1], digest.html);
});

Deno.test("any other rich-message error fails the send without a second post", async () => {
  const { bot, calls } = fakeBot({ richFails: new Error("Network request for 'sendRichMessage' failed!") });
  await quietly(() => assertRejects(() => sendDigest(bot, digest, "rich", "@ton_yields_test"), Error, "Network request"));
  assertEquals(methods(calls), ["getChat", "sendRichMessage"]);
});

Deno.test("POST_FORMAT turns on the rich post only when it says rich", () => {
  assertEquals(postFormatFrom("rich"), "rich");
  assertEquals(postFormatFrom(" RICH "), "rich");
  assertEquals(postFormatFrom(undefined), "classic");
  assertEquals(postFormatFrom("classic"), "classic");
  assertEquals(postFormatFrom("richer"), "classic");
});

Deno.test("a network error never shows the bot token, even inside the wrapped fetch error", () => {
  const token = "123456:SECRET-TOKEN";
  const inner = new TypeError(`error sending request for url (https://api.telegram.org/bot${token}/sendMessage): connection refused`);
  const error = new HttpError("Network request for 'sendMessage' failed!", inner);
  const text = describeSendError(error, token);
  assert(text.includes("connection refused"), text);
  assert(!text.includes("SECRET-TOKEN"), text);
  // Also when the token is not known here: the URL path is masked
  assert(!describeSendError(error, "").includes("SECRET-TOKEN"));
});

Deno.test("the weekly card is a silent photo post with its own Share text", async () => {
  const { bot, calls } = fakeBot();
  await quietly(() => sendCard(bot, new Uint8Array([137, 80, 78, 71]), "📊 caption", "@ton_yields_test"));
  assertEquals(methods(calls), ["sendPhoto", "editMessageReplyMarkup"]);
  const [, , options] = calls[0].args as [string, unknown, { caption: string; disable_notification: boolean }];
  assertEquals(options, { caption: "📊 caption", disable_notification: true });
  const [, , markup] = calls[1].args as [string, number, { reply_markup: { inline_keyboard: Array<Array<{ url: string }>> } }];
  const share = decodeURIComponent(markup.reply_markup.inline_keyboard[0][0].url);
  assert(share.includes("GRAM (TON) yields this week"), share);
  assertEquals(markup.reply_markup.inline_keyboard[0].length, 1); // no "How we calculate" under the card
});
