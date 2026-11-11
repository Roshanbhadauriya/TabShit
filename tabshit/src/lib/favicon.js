const FALLBACK_ICON = "icons/icon16.png";

/**
 * Chrome's built-in favicon cache (needs the "favicon" permission). Outside the
 * extension (plain dev server) there is no cache, so use the app icon.
 * @param {string} url
 */
export function faviconFor(url) {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  }
  return FALLBACK_ICON;
}

/**
 * onError handler for favicon <img>s: swap to the fallback once, never loop.
 * @param {React.SyntheticEvent<HTMLImageElement>} e
 */
export function handleIconError(e) {
  const img = e.currentTarget;
  img.onerror = null;
  if (!img.src.endsWith(FALLBACK_ICON)) img.src = FALLBACK_ICON;
}
