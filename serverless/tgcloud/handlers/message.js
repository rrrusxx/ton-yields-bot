import { api } from 'sdk';
import { SNAPSHOT } from '../lib/data.js';
import { WIDGET_HTML } from '../lib/widget_html.js';
import { CHANNEL_URL, topData, widgetCaption } from '../lib/yields.js';

// /start and /yields in the private chat answer with the yields widget.
// Widgets work only in private chats, so other chats get nothing.
export default async function (message) {
  if (message.chat?.type !== 'private') return;
  const text = (message.text ?? '').trim();
  if (/^\/(start|yields)(@\w+)?(\s|$)/.test(text)) {
    await api.sendWidget({
      chat_id: message.chat.id,
      html: WIDGET_HTML,
      public_data: topData(SNAPSHOT),
      allow_queries: true,
      caption: widgetCaption(SNAPSHOT),
    });
    return;
  }
  await api.sendMessage({
    chat_id: message.chat.id,
    text: `Send /yields for today's GRAM (TON) yields. The daily post: ${CHANNEL_URL}`,
    link_preview_options: { is_disabled: true },
  });
}
