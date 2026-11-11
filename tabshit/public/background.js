// Tabshit background service worker

const WEB_URL = /^https?:\/\//i;

/**
 * Every read-modify-write of `boards` in this worker runs through this queue,
 * so quick-save and the bookmark listeners can never overwrite each other.
 */
let boardsQueue = Promise.resolve();

/**
 * @param {(boards: object[], pages: string[]) => object[] | null} mutate
 *   return the new boards array, or null for "no change"
 */
function updateBoards(mutate) {
  const run = async () => {
    const data = await chrome.storage.local.get(["boards", "pages"]);
    const boards = Array.isArray(data.boards) ? data.boards : [];
    const pages = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : ["home"];
    const next = mutate(boards, pages);
    if (next) await chrome.storage.local.set({ boards: next });
  };
  boardsQueue = boardsQueue.then(run, run);
  return boardsQueue;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "quick-save") {
    quickSaveBookmark().catch((err) => console.error("Tabshit quick save error:", err));
  }
});

async function quickSaveBookmark() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Skip the new tab page itself and other browser/extension pages.
  if (!tab || !tab.url || !WEB_URL.test(tab.url)) return;

  const title = tab.title || new URL(tab.url).hostname;

  // 1. Chrome bookmark backup in "Other bookmarks", unless already bookmarked.
  const existing = await chrome.bookmarks.search({ url: tab.url });
  if (existing.length === 0) {
    await chrome.bookmarks.create({ title, url: tab.url, parentId: "2" });
  }

  // 2. Add to the Inbox board (created on the user's first page if missing).
  await updateBoards((boards, pages) => {
    const next = [...boards];
    let idx = next.findIndex((b) => (b.title || "").toLowerCase() === "inbox");
    if (idx === -1) {
      next.push({
        id: "board-inbox-" + Date.now(),
        title: "Inbox",
        page: pages[0],
        bookmarks: [],
      });
      idx = next.length - 1;
    }
    const inbox = next[idx];
    const bookmarks = inbox.bookmarks || [];
    if (bookmarks.some((bm) => bm.url === tab.url)) return null;
    next[idx] = { ...inbox, bookmarks: [...bookmarks, { title, url: tab.url }] };
    return next;
  });
}

// Mirror new Chrome bookmarks into boards that were imported from that folder.
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (!bookmark.url) return; // folders
  const boardId = "board-chrome-" + bookmark.parentId;
  updateBoards((boards) => {
    const idx = boards.findIndex((b) => b.id === boardId);
    // Folder not imported yet: nothing to do.
    if (idx === -1) return null;
    const board = boards[idx];
    const bookmarks = board.bookmarks || [];
    if (bookmarks.some((bm) => bm.url === bookmark.url)) return null;
    const next = [...boards];
    next[idx] = {
      ...board,
      bookmarks: [...bookmarks, { title: bookmark.title || bookmark.url, url: bookmark.url }],
    };
    return next;
  }).catch((err) => console.error("Tabshit bookmark sync error:", err));
});

// Mirror Chrome bookmark removals.
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  const url = removeInfo.node?.url;
  if (!url) return;
  const boardId = "board-chrome-" + removeInfo.parentId;
  updateBoards((boards) => {
    const idx = boards.findIndex((b) => b.id === boardId);
    if (idx === -1) return null;
    const board = boards[idx];
    const bookmarks = board.bookmarks || [];
    const filtered = bookmarks.filter((bm) => bm.url !== url);
    if (filtered.length === bookmarks.length) return null;
    const next = [...boards];
    next[idx] = { ...board, bookmarks: filtered };
    return next;
  }).catch((err) => console.error("Tabshit bookmark remove sync error:", err));
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Tabshit installed");
});
