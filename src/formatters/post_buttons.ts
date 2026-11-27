/**
 * The URL button under the daily post: "How we calculate" opens the
 * channel's pinned post (the owner pins the methodology note there). Plain
 * URL buttons need no running bot. The button is left out when its link
 * cannot be built: a channel without a public @username has no post links,
 * and a channel without a pinned post has nothing to open.
 *
 * The "Share" button of v1.7.0 was removed in v1.8.1 (owner's choice):
 * Forward does the same, and for a rich post it carries the post itself,
 * while a shared link previews as flattened text.
 */

export interface UrlButton {
  text: string;
  url: string;
}

/** Public link of a channel post, or null when the channel id is not a public @username */
export function publicPostUrl(channelId: string, messageId: number): string | null {
  const match = /^@([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(channelId.trim());
  if (!match || !Number.isSafeInteger(messageId) || messageId <= 0) return null;
  return `https://t.me/${match[1]}/${messageId}`;
}

export function howWeCalculateButton(pinnedUrl: string): UrlButton {
  return { text: "ℹ️ How we calculate", url: pinnedUrl };
}

/** The buttons as one row, or no rows when the channel has no pinned post */
export function postButtons(pinnedUrl: string | null): UrlButton[][] {
  return pinnedUrl ? [[howWeCalculateButton(pinnedUrl)]] : [];
}
