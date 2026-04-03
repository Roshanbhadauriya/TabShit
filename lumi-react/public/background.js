// LumiList Background Service Worker

chrome.commands.onCommand.addListener((command) => {
  if (command === "quick-save") {
    quickSaveBookmark();
  }
});

async function quickSaveBookmark() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 1. Standard Chrome Bookmark (Backup)
    await chrome.bookmarks.create({
      title: tab.title,
      url: tab.url,
      parentId: '2'
    });

    // 2. LumiList State Integration
    const data = await chrome.storage.local.get(['boards']);
    let boards = data.boards || [];
    
    // Find or Create Inbox
    let inbox = boards.find(b => b.title.toLowerCase() === 'inbox');
    if (!inbox) {
      inbox = {
        id: 'board-inbox-' + Date.now(),
        title: 'Inbox',
        page: 'home',
        bookmarks: []
      };
      boards.push(inbox);
    }

    if (!inbox.bookmarks.some(bm => bm.url === tab.url)) {
      inbox.bookmarks.push({ title: tab.title, url: tab.url });
      await chrome.storage.local.set({ boards });
    }

    // Notify all extension tabs to refresh
    try {
      chrome.runtime.sendMessage({ type: 'REFRESH_BOOKMARKS' });
    } catch (e) {}
  } catch (err) {
    console.error("LumiList Quick Save Error:", err);
  }
}

// Listen for new Chrome bookmarks and sync to boards
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    if (!bookmark.url) return; // skip folders

    const boardId = "board-chrome-" + bookmark.parentId;
    const data = await chrome.storage.local.get(["boards"]);
    let boards = data.boards || [];

    let board = boards.find((b) => b.id === boardId);
    if (board) {
      // Only add if URL doesn't already exist in this board
      if (!board.bookmarks.some((bm) => bm.url === bookmark.url)) {
        board.bookmarks.push({ title: bookmark.title, url: bookmark.url });
        await chrome.storage.local.set({ boards });
      }
    }
    // If board doesn't exist, user hasn't imported this folder yet — skip
  } catch (err) {
    console.error("LumiList Bookmark Sync Error:", err);
  }
});

// Listen for bookmark removals and sync to boards
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    const boardId = "board-chrome-" + removeInfo.parentId;
    const data = await chrome.storage.local.get(["boards"]);
    let boards = data.boards || [];

    let board = boards.find((b) => b.id === boardId);
    if (board && removeInfo.node?.url) {
      const before = board.bookmarks.length;
      board.bookmarks = board.bookmarks.filter(
        (bm) => bm.url !== removeInfo.node.url
      );
      if (board.bookmarks.length !== before) {
        await chrome.storage.local.set({ boards });
      }
    }
  } catch (err) {
    console.error("LumiList Bookmark Remove Sync Error:", err);
  }
});

// Initial Sync & Auth placeholders
chrome.runtime.onInstalled.addListener(() => {
  console.log("LumiList Installed");
});
