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

// Initial Sync & Auth placeholders
chrome.runtime.onInstalled.addListener(() => {
  console.log("LumiList Installed");
});
