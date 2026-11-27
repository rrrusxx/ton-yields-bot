/**
 * The URL buttons under the daily post (since 2026-11-27). Plain URL buttons
 * need no running bot: "Share" opens Telegram's share sheet with the post's
 * link, and "How we calculate" opens the channel's pinned post (the owner pins
 * the methodology note there). A button is left out when its link cannot be
 * built: a channel without a public @username has no post links, and a
 * channel without a pinned post gets no "How we calculate".
 */

export interface UrlButton {
  text: string;
  url: string;
}

/**
 * One line under the link in the share sheet. Only the liquid staking (and
 * Storm vault) rows are read on-chain, so the line says exactly that.
 */
export const SHARE_TEXT = "TON (GRAM) yields today: staking, lending and vaults; liquid staking APY read on-chain";

/** Public link of a channel post, or null when the channel id is not a public @username */
export function publicPostUrl(channelId: string, messageId: number): string | null {
  const match = /^@([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(channelId.trim());
  if (!match || !Number.isSafeInteger(messageId) || messageId <= 0) return null;
  return `https://t.me/${match[1]}/${messageId}`;
}

/** The line under the link when the Monday card is shared */
export const CARD_SHARE_TEXT = "GRAM (TON) yields this week: liquid staking APY measured on-chain, the best stablecoin pools";

export function shareButton(postUrl: string, text: string = SHARE_TEXT): UrlButton {
  const url = `https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(text)}`;
  return { text: "↗️ Share", url };
}

export function howWeCalculateButton(pinnedUrl: string): UrlButton {
  return { text: "ℹ️ How we calculate", url: pinnedUrl };
}

/** The buttons as one row, or no rows when neither link exists */
export function postButtons(postUrl: string | null, pinnedUrl: string | null, shareText: string = SHARE_TEXT): UrlButton[][] {
  const row: UrlButton[] = [];
  if (postUrl) row.push(shareButton(postUrl, shareText));
  if (pinnedUrl) row.push(howWeCalculateButton(pinnedUrl));
  return row.length > 0 ? [row] : [];
}
