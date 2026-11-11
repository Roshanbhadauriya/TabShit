/**
 * Bookmark search across every board and page.
 *
 * Query is split into words; every word must appear in the bookmark title,
 * its URL or its board's title (AND match). Results are ranked so the most
 * obvious hit is first (title starts with the query > title contains > host >
 * URL > board name) and the current page wins ties. Same URL saved in several
 * boards is shown once.
 */

/** Hard cap so a one-letter query over thousands of bookmarks stays cheap to render. */
export const MAX_RESULTS = 60;

/**
 * @typedef {{ title: string, url: string }} Bookmark
 * @typedef {{ id: string, title: string, page: string, bookmarks: Bookmark[] }} BoardData
 * @typedef {{
 *   key: string,
 *   title: string,
 *   url: string,
 *   host: string,
 *   boardTitle: string,
 *   page: string,
 *   alsoIn: number,
 *   score: number,
 * }} SearchResult
 */

/** @param {string} url */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "";
  }
}

/**
 * @param {BoardData[]} boards
 * @param {string} rawQuery
 * @param {string} activePage
 * @returns {{ results: SearchResult[], total: number }}
 */
export function searchBookmarks(boards, rawQuery, activePage) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return { results: [], total: 0 };
  const words = query.split(/\s+/).filter(Boolean);

  /** @type {Map<string, SearchResult>} */
  const byUrl = new Map();

  for (const board of boards) {
    const boardTitle = board.title || "";
    const boardLower = boardTitle.toLowerCase();
    for (const bm of board.bookmarks || []) {
      if (!bm || !bm.url) continue;
      const host = hostOf(bm.url);
      const title = bm.title || host;
      const titleLower = title.toLowerCase();
      const hostLower = host.toLowerCase();
      const urlLower = bm.url.toLowerCase();

      let score = 0;
      let matchedAll = true;
      for (const w of words) {
        if (titleLower.startsWith(w)) score += 100;
        else if (titleLower.split(/[\s\-_.]+/).some((part) => part.startsWith(w))) score += 70;
        else if (titleLower.includes(w)) score += 50;
        else if (hostLower.startsWith(w)) score += 45;
        else if (hostLower.includes(w)) score += 35;
        else if (urlLower.includes(w)) score += 20;
        else if (boardLower.includes(w)) score += 10;
        else {
          matchedAll = false;
          break;
        }
      }
      if (!matchedAll) continue;
      if (board.page === activePage) score += 5;

      const existing = byUrl.get(bm.url);
      if (existing) {
        existing.alsoIn += 1;
        if (score > existing.score) {
          Object.assign(existing, { title, boardTitle, page: board.page, score });
        }
        continue;
      }
      byUrl.set(bm.url, {
        key: `${board.id}|${bm.url}`,
        title,
        url: bm.url,
        host,
        boardTitle,
        page: board.page,
        alsoIn: 0,
        score,
      });
    }
  }

  const all = [...byUrl.values()].sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  );
  return { results: all.slice(0, MAX_RESULTS), total: all.length };
}
