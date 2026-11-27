import { api } from 'sdk';
import { SNAPSHOT } from '../lib/data.js';
import { sectionMessage } from '../lib/yields.js';

// Buttons under channel posts with callback data "only:TON" or
// "only:STABLE": the section goes to the person who tapped as an ephemeral
// reply (Bot API 10.4), which nobody else in the channel sees. The callback
// query is answered in every case, so the button never keeps spinning.
export default async function (query) {
  const match = /^only:(TON|STABLE)$/.exec(query.data ?? '');
  let note;
  if (match) {
    try {
      await api.sendMessage({
        ...(query.message?.chat?.id !== undefined && { chat_id: query.message.chat.id }),
        text: sectionMessage(SNAPSHOT, match[1]),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ephemeral_message_parameters: { callback_query_id: query.id },
      });
    } catch (error) {
      console.error('ephemeral reply failed:', error?.description ?? String(error));
      note = 'Could not show it here. Open the daily post or send /yields to the bot.';
    }
  }
  await api.answerCallbackQuery({ callback_query_id: query.id, ...(note && { text: note, show_alert: true }) });
}
