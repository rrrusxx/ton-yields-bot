import { api } from 'sdk';
import { SNAPSHOT } from '../lib/data.js';
import { answerFor } from '../lib/yields.js';

// Requests from the widget: "s:top" (its background refresh), "s:TON" and
// "s:STABLE" (its tabs). Every query gets an answer within 15 seconds, an
// unknown one without data, or the widget would wait and show TIMEOUT.
export default async function (query) {
  const data = answerFor(SNAPSHOT, query.data);
  await api.answerWidgetQuery(data === null ? { widget_query_id: query.id } : { widget_query_id: query.id, data });
}
