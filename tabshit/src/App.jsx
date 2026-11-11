import React, {
  useState,
  useDeferredValue,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Palette,
  Eye,
  EyeOff,
  Settings,
  X,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Download,
  Link as LinkIcon,
  ListTodo,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useStorage, storage } from "./hooks/useStorage";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Modal } from "./components/Modal";
import { WallpaperPanel } from "./components/WallpaperPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  BOARD_WIDTH,
  BOARD_GAP,
  DOCK_CLEARANCE_PX,
  TODO_ID,
  LAYOUT_VERSION,
  MAX_VISIBLE,
  DEFAULT_COMPACT_LEVEL,
  DEFAULT_BOARD_OPACITY,
  TODO_ESTIMATED_HEIGHT,
  getCanvasScale,
  hasPosition,
  boxForBoard,
  columnsFor,
  computeAutoSpots,
  findFreeSpot,
  arrangeItems,
  resolveOverlaps,
  clamp,
} from "./lib/layout";
import { getDailyQuote } from "./lib/quotes";
import { extractAccent, contrastText } from "./lib/wallpaperColor";
import { faviconFor, handleIconError } from "./lib/favicon";
import { searchBookmarks } from "./lib/search";
import { SearchResults } from "./components/SearchResults";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const DEFAULT_WALLPAPER = "wallpapers/10050.jpg";
const CHROME_BOARD_PREFIX = "board-chrome-";
const TOMBSTONE_CAP = 500;
const MAX_PAGE_NAME = 40;

const INITIAL_BOARDS = [
  {
    id: "board-social",
    title: "Social",
    page: "home",
    bookmarks: [
      { title: "Facebook", url: "https://www.facebook.com" },
      { title: "Instagram", url: "https://www.instagram.com" },
      { title: "Twitter", url: "https://www.x.com" },
      { title: "LinkedIn", url: "https://www.linkedin.com" },
      { title: "Reddit", url: "https://www.reddit.com" },
    ],
    x: 0,
    y: 0,
  },
  {
    id: "board-entertainment",
    title: "Entertainment",
    page: "home",
    bookmarks: [
      { title: "YouTube", url: "https://www.youtube.com" },
      { title: "Netflix", url: "https://www.netflix.com" },
      { title: "Hotstar", url: "https://www.hotstar.com" },
      { title: "Prime Video", url: "https://www.primevideo.com" },
      { title: "Twitch", url: "https://www.twitch.tv" },
    ],
    x: BOARD_WIDTH + BOARD_GAP,
    y: 0,
  },
];

const DEFAULT_SETTINGS = {
  alignment: "left",
  isCompact: false,
  compactLevel: DEFAULT_COMPACT_LEVEL,
  boardOpacity: DEFAULT_BOARD_OPACITY,
  showTodo: false,
  showQuote: false,
  showGhostBoard: true,
  openInNewTab: true,
  layoutVersion: LAYOUT_VERSION,
};

const DEFAULT_THEME = {
  accent: "#00d2ff",
  boardText: "#ffffff",
  tabBg: "rgba(255, 255, 255, 0.1)",
  tabText: "rgba(255, 255, 255, 0.6)",
  /** When true the accent colour is picked from the current wallpaper. */
  autoAccent: false,
  /** Last colour picked from `autoAccentSource`, saved so new tabs open with it (no flash). */
  autoAccentColor: null,
  autoAccentContrast: null,
  autoAccentSource: null,
};

/**
 * Short, stable key for a wallpaper source. Uploaded wallpapers are data URLs
 * of several hundred KB, too big to store a second time as a key.
 * @param {string} src
 */
function wallpaperKey(src) {
  if (!src || !src.startsWith("data:")) return src || "";
  return `data:${src.length}:${src.slice(-48)}`;
}

/** @typedef {{ boards: string[], urls: Record<string, string[]> }} ImportTombstones */
/** @type {ImportTombstones} */
const EMPTY_TOMBSTONES = { boards: [], urls: {} };

/** @param {unknown} t @returns {ImportTombstones} */
function normalizeTombstones(t) {
  const value = /** @type {Partial<ImportTombstones>} */ (t || {});
  return {
    boards: Array.isArray(value.boards) ? value.boards : [],
    urls: value.urls && typeof value.urls === "object" ? value.urls : {},
  };
}

/** @param {string} url */
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Merge the Chrome bookmark tree into boards. One board per folder that
 * directly contains links. Returns `current` unchanged when nothing new.
 */
function mergeChromeTree(current, tree, tombstones, page) {
  let changed = false;
  const next = [...current];
  const indexById = new Map(next.map((b, i) => [b.id, i]));
  const blockedBoards = new Set(tombstones.boards);

  const toBookmark = (node) => ({
    title: node.title || hostnameOf(node.url),
    url: node.url,
  });

  const visit = (nodes, parentTitle, parentId) => {
    const links = nodes.filter((n) => n.url);
    const boardId = CHROME_BOARD_PREFIX + parentId;
    if (links.length > 0 && !blockedBoards.has(boardId)) {
      const blockedUrls = new Set(tombstones.urls[boardId] || []);
      const idx = indexById.get(boardId);
      if (idx !== undefined) {
        const existing = next[idx];
        const have = new Set((existing.bookmarks || []).map((bm) => bm.url));
        const additions = [];
        for (const link of links) {
          if (have.has(link.url) || blockedUrls.has(link.url)) continue;
          have.add(link.url);
          additions.push(toBookmark(link));
        }
        if (additions.length > 0) {
          next[idx] = {
            ...existing,
            bookmarks: [...(existing.bookmarks || []), ...additions],
          };
          changed = true;
        }
      } else {
        const seen = new Set();
        const bookmarks = [];
        for (const link of links) {
          if (seen.has(link.url) || blockedUrls.has(link.url)) continue;
          seen.add(link.url);
          bookmarks.push(toBookmark(link));
        }
        if (bookmarks.length > 0) {
          indexById.set(boardId, next.length);
          next.push({
            id: boardId,
            title: parentTitle || "Imported Board",
            page,
            bookmarks,
          });
          changed = true;
        }
      }
    }
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        visit(node.children, node.title, node.id);
      }
    }
  };

  for (const rootChild of tree?.[0]?.children || []) {
    if (rootChild.children && rootChild.children.length > 0) {
      visit(rootChild.children, rootChild.title, rootChild.id);
    }
  }
  return changed ? next : current;
}

/**
 * One-time conversion of positions saved by the old compact mode (280px wide
 * boards) into canvas units (340 wide). Guarded by a Web Lock so two new tabs
 * opened at the same moment cannot both migrate.
 */
async function migrateLayoutIfNeeded() {
  const run = async () => {
    const stored = await storage.get("settings");
    if (!stored || stored.layoutVersion === LAYOUT_VERSION) return;
    if (stored.isCompact) {
      const fx = BOARD_WIDTH / 280;
      const fy = 1.3;
      const boards = await storage.get("boards");
      if (Array.isArray(boards)) {
        await storage.set(
          "boards",
          boards.map((b) =>
            hasPosition(b)
              ? { ...b, x: Math.round(b.x * fx), y: Math.round(b.y * fy) }
              : b,
          ),
        );
      }
      const todoPos = await storage.get("todoPos");
      if (hasPosition(todoPos)) {
        await storage.set("todoPos", {
          x: Math.round(todoPos.x * fx),
          y: Math.round(todoPos.y * fy),
        });
      }
    }
    await storage.set("settings", { ...stored, layoutVersion: LAYOUT_VERSION });
  };
  if (navigator.locks?.request) {
    await navigator.locks.request("tabshit-layout-migration", run);
  } else {
    await run();
  }
}

export default function App() {
  const [activePage, setActivePage, activePageLoaded] = useStorage("activePage", "home");
  const [privacyMode, setPrivacyMode, privacyLoaded] = useStorage("privacyMode", false);
  const [boards, setBoards, boardsLoaded] = useStorage("boards", INITIAL_BOARDS);
  const [pages, setPages, pagesLoaded] = useStorage("pages", ["home"]);
  const [background, setBackground, backgroundLoaded] = useStorage(
    "customBackground",
    DEFAULT_WALLPAPER,
  );
  const [storedSettings, setSettings, settingsLoaded] = useStorage(
    "settings",
    DEFAULT_SETTINGS,
  );
  const [storedTheme, setAppTheme] = useStorage("appTheme", DEFAULT_THEME);
  const [todos, setTodos] = useStorage("todos", []);
  const [todoPos, setTodoPos, todoPosLoaded] = useStorage("todoPos", null);
  const [tombstonesRaw, setTombstones, tombstonesLoaded] = useStorage(
    "importTombstones",
    EMPTY_TOMBSTONES,
  );
  const [searchQuery, setSearchQuery] = useState("");
  // Last non-empty query. Results render from this (deferred), so the list keeps
  // its content while fading out after the search is cleared.
  const [lastQuery, setLastQuery] = useState("");
  const [searchSelection, setSearchSelection] = useState({ query: "", index: 0 });
  const searchItemRefs = useRef([]);

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(storedSettings || {}) }),
    [storedSettings],
  );
  const appTheme = useMemo(
    () => ({ ...DEFAULT_THEME, ...(storedTheme || {}) }),
    [storedTheme],
  );
  const tombstones = useMemo(() => normalizeTombstones(tombstonesRaw), [tombstonesRaw]);

  // ---- Accent colour: manual, or picked from the wallpaper
  const wallpaperSrc = background || DEFAULT_WALLPAPER;
  const [pickedAccent, setPickedAccent] = useState(null); // { key, accent, contrast }
  useEffect(() => {
    if (!appTheme.autoAccent || !backgroundLoaded) return;
    let cancelled = false;
    const key = wallpaperKey(wallpaperSrc);
    extractAccent(wallpaperSrc)
      .then((res) => {
        if (cancelled) return;
        setPickedAccent({ key, ...res });
        setAppTheme((prev) => {
          const t = prev || {};
          if (
            t.autoAccentSource === key &&
            t.autoAccentColor === res.accent &&
            t.autoAccentContrast === res.contrast
          ) {
            return prev;
          }
          return {
            ...t,
            autoAccentColor: res.accent,
            autoAccentContrast: res.contrast,
            autoAccentSource: key,
          };
        });
      })
      .catch((err) => console.error("[theme] Could not pick accent from wallpaper", err));
    return () => {
      cancelled = true;
    };
  }, [appTheme.autoAccent, backgroundLoaded, wallpaperSrc, setAppTheme]);

  const currentKey = wallpaperKey(wallpaperSrc);
  const autoForCurrent =
    pickedAccent?.key === currentKey
      ? pickedAccent
      : appTheme.autoAccentSource === currentKey && appTheme.autoAccentColor
        ? { accent: appTheme.autoAccentColor, contrast: appTheme.autoAccentContrast || contrastText(appTheme.autoAccentColor) }
        : null;
  // Until the new wallpaper's colour is ready, keep the manual accent.
  const effectiveAccent = appTheme.autoAccent && autoForCurrent ? autoForCurrent.accent : appTheme.accent;
  const accentContrast =
    appTheme.autoAccent && autoForCurrent ? autoForCurrent.contrast : contrastText(appTheme.accent);
  const quote = useMemo(() => getDailyQuote(), []);

  // UI State
  const [isWallpaperOpen, setIsWallpaperOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [modalInput, setModalInput] = useState("");
  const [targetItem, setTargetItem] = useState(null);
  const [targetSpot, setTargetSpot] = useState(null);
  const [showSupport, setShowSupport] = useState(false);
  const [activePageMenu, setActivePageMenu] = useState(null);
  const [activePageMenuPos, setActivePageMenuPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  /** @type {["pending" | "done" | "failed", Function]} */
  const [migrationState, setMigrationState] = useState("pending");
  const tabsScrollRef = useRef(null);
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);

  // ---- First paint: wait for stored state so privacy mode / wallpaper never flash.
  const coreLoaded =
    privacyLoaded &&
    boardsLoaded &&
    settingsLoaded &&
    backgroundLoaded &&
    pagesLoaded &&
    activePageLoaded;
  const appReady = coreLoaded || loadTimedOut;
  useEffect(() => {
    const timer = setTimeout(() => setLoadTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // ---- One-time layout migration
  useEffect(() => {
    let cancelled = false;
    migrateLayoutIfNeeded()
      .then(() => {
        if (!cancelled) setMigrationState("done");
      })
      .catch((err) => {
        console.error("[layout] Migration failed", err);
        if (!cancelled) setMigrationState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing may write boards/todoPos until the migrated values have reached this tab
  // (the migration writes boards before settings, and onChanged events arrive in order).
  const layoutReady =
    boardsLoaded &&
    settingsLoaded &&
    todoPosLoaded &&
    (migrationState === "failed" ||
      (migrationState === "done" &&
        storedSettings?.layoutVersion === LAYOUT_VERSION));

  // ---- Repair state that points at pages that no longer exist (once, after load).
  const repairedRef = useRef(false);
  useEffect(() => {
    if (repairedRef.current) return;
    if (!layoutReady || !pagesLoaded || !activePageLoaded) return;
    repairedRef.current = true;
    const validPages = Array.isArray(pages) && pages.length > 0 ? pages : ["home"];
    if (validPages !== pages) setPages(validPages);
    if (!validPages.includes(activePage)) setActivePage(validPages[0]);
    setBoards((prev) =>
      prev.some((b) => !validPages.includes(b.page))
        ? prev.map((b) => {
            if (validPages.includes(b.page)) return b;
            // Drop the old position so it is auto-placed in a free spot on its new page.
            // eslint-disable-next-line no-unused-vars
            const { x, y, ...rest } = b;
            return { ...rest, page: validPages[0] };
          })
        : prev,
    );
  }, [
    layoutReady,
    pagesLoaded,
    activePageLoaded,
    pages,
    activePage,
    setPages,
    setActivePage,
    setBoards,
  ]);

  // ---- Canvas geometry
  const scale = getCanvasScale(settings);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth - 80 : 1200,
    h: typeof window !== "undefined" ? window.innerHeight - 300 : 600,
  }));
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setViewport((prev) =>
        prev.w === el.clientWidth && prev.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    // ResizeObserver covers layout changes (panels, header wrap); the window
    // resize/zoom event is a second trigger in case observer callbacks are delayed.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const cols = columnsFor(viewport.w, scale);

  // Measured heights (canvas units) of boards and the todo widget.
  const [sizes, setSizes] = useState({});
  const handleMeasure = useCallback((id, h) => {
    setSizes((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const todoHeight = sizes[TODO_ID] ?? TODO_ESTIMATED_HEIGHT;

  const autoSpots = useMemo(() => {
    const storedTodoBox =
      settings.showTodo && hasPosition(todoPos)
        ? { x: todoPos.x, y: todoPos.y, w: BOARD_WIDTH, h: todoHeight }
        : null;
    return computeAutoSpots(boards, cols, sizes, storedTodoBox);
  }, [boards, cols, sizes, settings.showTodo, todoPos, todoHeight]);

  const pageBoards = useMemo(
    () =>
      boards
        .filter((b) => b.page === activePage)
        .map((b) => (hasPosition(b) ? b : { ...b, ...(autoSpots.get(b.id) || { x: 0, y: 0 }) })),
    [boards, activePage, autoSpots],
  );

  // Persist auto-assigned positions so boards stay put after resize/reload.
  useEffect(() => {
    if (!layoutReady || autoSpots.size === 0) return;
    setBoards((prev) => {
      let changed = false;
      const next = prev.map((b) => {
        if (hasPosition(b)) return b;
        const spot = autoSpots.get(b.id);
        if (!spot) return b;
        changed = true;
        return { ...b, ...spot };
      });
      return changed ? next : prev;
    });
  }, [layoutReady, autoSpots, setBoards]);

  const occupiedBoxes = useMemo(() => {
    const list = pageBoards.map((b) => boxForBoard(b, sizes));
    return list;
  }, [pageBoards, sizes]);

  // Todo widget: give it a free spot once and persist it, instead of recomputing every render.
  const autoTodoPos = useMemo(
    () => (hasPosition(todoPos) ? todoPos : findFreeSpot(occupiedBoxes, cols)),
    [todoPos, occupiedBoxes, cols],
  );
  useEffect(() => {
    if (settings.showTodo && todoPosLoaded && layoutReady && !hasPosition(todoPos)) {
      setTodoPos(autoTodoPos);
    }
  }, [settings.showTodo, todoPosLoaded, layoutReady, todoPos, autoTodoPos, setTodoPos]);

  // Saved layout of everything on this page, in canvas units.
  const storedItems = useMemo(() => {
    const list = pageBoards.map((b) => ({ id: b.id, ...boxForBoard(b, sizes) }));
    if (settings.showTodo) {
      list.push({ id: TODO_ID, x: autoTodoPos.x, y: autoTodoPos.y, w: BOARD_WIDTH, h: todoHeight });
    }
    return list;
  }, [pageBoards, sizes, settings.showTodo, autoTodoPos, todoHeight]);

  // What is actually drawn. Saved positions are never rewritten by a resize:
  // - saved layout fits the window → draw it, pushing down anything that overlaps
  //   (e.g. an expanded board) so nothing is hidden underneath;
  // - saved layout is wider than the window → re-flow into the columns that fit.
  //   Making the window wide again shows the saved layout again.
  const storedRight = storedItems.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  const isReflowed = storedRight * scale > viewport.w + 1 && storedItems.length > 0;
  const layoutSpots = useMemo(
    () => (isReflowed ? arrangeItems(storedItems, cols) : resolveOverlaps(storedItems)),
    [isReflowed, storedItems, cols],
  );
  const allBoxes = useMemo(
    () => storedItems.map((item) => ({ ...item, ...(layoutSpots.get(item.id) || {}) })),
    [storedItems, layoutSpots],
  );
  const shownTodoPos = layoutSpots.get(TODO_ID) || autoTodoPos;

  const contentRight = allBoxes.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  const contentBottom = allBoxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  // Minimum size is 100% of the scroll area (CSS), so no measuring lag on resize.
  const wrapperW = Math.ceil(contentRight * scale) + 8;
  const wrapperH = Math.ceil(contentBottom * scale) + DOCK_CLEARANCE_PX;

  /** Save the drawn positions of this page (used before editing a re-flowed layout). */
  const commitShownLayout = () => {
    if (!isReflowed) return;
    setBoards((prev) =>
      prev.map((b) =>
        b.page === activePage && layoutSpots.has(b.id) ? { ...b, ...layoutSpots.get(b.id) } : b,
      ),
    );
    if (layoutSpots.has(TODO_ID)) setTodoPos(layoutSpots.get(TODO_ID));
  };

  // Close the fixed-position page menu when the window resizes (its anchor moves).
  useEffect(() => {
    const onResize = () => {
      setActivePageMenu(null);
      setActivePageMenuPos(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const displayBoards = useMemo(
    () => pageBoards.map((b) => ({ ...b, ...(layoutSpots.get(b.id) || {}) })),
    [pageBoards, layoutSpots],
  );

  // ---- Search: matching bookmarks from every page, shown instead of the boards
  // useDeferredValue instead of a fixed debounce: typing is never blocked, the
  // result list catches up as soon as the browser is idle, and stale renders for
  // superseded keystrokes are thrown away. No artificial delay, no blank frame.
  const resultsQuery = useDeferredValue(lastQuery);
  const isSearching = searchQuery.trim() !== "";
  const activeQuery = resultsQuery;
  const searchPending = resultsQuery !== lastQuery;
  const { results: searchResults, total: searchTotal } = useMemo(
    () => searchBookmarks(boards, activeQuery, activePage),
    [boards, activeQuery, activePage],
  );
  const selectedResult =
    searchSelection.query === activeQuery
      ? Math.min(searchSelection.index, Math.max(0, searchResults.length - 1))
      : 0;
  const selectResult = (index) => setSearchSelection({ query: activeQuery, index });

  const clearSearch = () => setSearchQuery("");

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    const trimmed = value.trim();
    if (trimmed) setLastQuery(trimmed);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      clearSearch();
      return;
    }
    if (!searchResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectResult((selectedResult + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectResult((selectedResult - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Click the real link so "open in new tab" and the browser's own handling apply.
      searchItemRefs.current[selectedResult]?.click();
    }
  };

  // ---- Close menus on outside click
  useEffect(() => {
    if (!activePageMenu) return;
    const handleClickOutside = (e) => {
      if (
        !e.target.closest(".page-menu-trigger") &&
        !e.target.closest(".page-menu-dropdown")
      ) {
        setActivePageMenu(null);
        setActivePageMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activePageMenu]);

  // ---- Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        if (typing) return;
        e.preventDefault();
        setSettings((prev) => ({
          ...prev,
          showGhostBoard: !(prev?.showGhostBoard ?? true),
        }));
      }
      if (e.key === "Escape" && !modalType && !showSupport) {
        setIsWallpaperOpen(false);
        setIsSettingsOpen(false);
        setActivePageMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSettings, modalType, showSupport]);

  // ---- Bookmark import
  const addTombstone = useCallback(
    (boardId, url) => {
      if (!boardId.startsWith(CHROME_BOARD_PREFIX)) return;
      setTombstones((prev) => {
        const t = normalizeTombstones(prev);
        if (!url) {
          if (t.boards.includes(boardId)) return prev;
          return { ...t, boards: [...t.boards, boardId].slice(-TOMBSTONE_CAP) };
        }
        const list = t.urls[boardId] || [];
        if (list.includes(url)) return prev;
        return {
          ...t,
          urls: { ...t.urls, [boardId]: [...list, url].slice(-TOMBSTONE_CAP) },
        };
      });
    },
    [setTombstones],
  );

  const removeUrlTombstone = useCallback(
    (boardId, url) => {
      setTombstones((prev) => {
        const t = normalizeTombstones(prev);
        const list = t.urls[boardId];
        if (!list || !list.includes(url)) return prev;
        return { ...t, urls: { ...t.urls, [boardId]: list.filter((u) => u !== url) } };
      });
    },
    [setTombstones],
  );

  /**
   * @param {{ restoreDeleted: boolean }} opts restoreDeleted=true for the manual
   *   Import button: forget deletions and import everything again.
   */
  const importChromeBookmarks = useCallback(
    async ({ restoreDeleted }) => {
      if (typeof chrome === "undefined" || !chrome.bookmarks?.getTree) return;
      let tree;
      try {
        tree = await chrome.bookmarks.getTree();
      } catch (err) {
        console.error("[import] Could not read Chrome bookmarks", err);
        return;
      }
      const effective = restoreDeleted ? EMPTY_TOMBSTONES : tombstones;
      if (restoreDeleted) setTombstones(EMPTY_TOMBSTONES);
      setBoards((current) => mergeChromeTree(current, tree, effective, activePage));
    },
    [tombstones, activePage, setBoards, setTombstones],
  );

  // Auto-import once per new tab, after everything it depends on has loaded.
  const autoImportedRef = useRef(false);
  useEffect(() => {
    if (autoImportedRef.current) return;
    if (!layoutReady || !activePageLoaded || !tombstonesLoaded || !pagesLoaded) return;
    autoImportedRef.current = true;
    importChromeBookmarks({ restoreDeleted: false });
  }, [layoutReady, activePageLoaded, tombstonesLoaded, pagesLoaded, importChromeBookmarks]);

  // ---- Board mutations (functional updates so concurrent changes are never lost)
  const updateBoard = useCallback(
    (boardId, fn) => setBoards((prev) => prev.map((b) => (b.id === boardId ? fn(b) : b))),
    [setBoards],
  );

  const addBookmark = useCallback(
    (boardId, bookmark) => {
      updateBoard(boardId, (b) =>
        (b.bookmarks || []).some((bm) => bm.url === bookmark.url)
          ? b
          : { ...b, bookmarks: [...(b.bookmarks || []), bookmark] },
      );
      removeUrlTombstone(boardId, bookmark.url);
    },
    [updateBoard, removeUrlTombstone],
  );

  const removeBookmark = useCallback(
    (boardId, url) => {
      updateBoard(boardId, (b) => ({
        ...b,
        bookmarks: (b.bookmarks || []).filter((bm) => bm.url !== url),
      }));
      addTombstone(boardId, url);
    },
    [updateBoard, addTombstone],
  );

  const deleteBoard = useCallback(
    (boardId) => {
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
      addTombstone(boardId);
    },
    [setBoards, addTombstone],
  );

  const tidyUp = () => {
    // Arrange in the order the user currently sees.
    const spots = arrangeItems(allBoxes, cols);
    setBoards((prev) =>
      prev.map((b) => (b.page === activePage && spots.has(b.id) ? { ...b, ...spots.get(b.id) } : b)),
    );
    if (spots.has(TODO_ID)) setTodoPos(spots.get(TODO_ID));
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  // ---- Modals
  const closeModal = () => {
    setModalType(null);
    setModalInput("");
    setTargetSpot(null);
    setTargetItem(null);
  };

  const handleModalSubmit = () => {
    const input = modalInput.trim();
    if (!input && !["board", "delete-page", "delete-board"].includes(modalType)) return;

    if (modalType === "page") {
      const newPage = input.toLowerCase().slice(0, MAX_PAGE_NAME);
      if (!pages.includes(newPage)) setPages([...pages, newPage]);
      setActivePage(newPage);
    } else if (modalType === "board") {
      const newBoard = {
        id: "board-" + Date.now(),
        title: input || "New Board",
        page: activePage,
        bookmarks: [],
        ...(targetSpot ? { x: targetSpot.x, y: targetSpot.y } : {}),
      };
      // The ghost spot was picked on the drawn (possibly re-flowed) layout.
      if (targetSpot) commitShownLayout();
      setBoards((prev) => [...prev, newBoard]);
    } else if (modalType === "rename-board" && targetItem) {
      updateBoard(targetItem.id, (b) => ({ ...b, title: input }));
    } else if (modalType === "rename-page") {
      const newName = input.toLowerCase().slice(0, MAX_PAGE_NAME);
      if (newName && newName !== targetItem && !pages.includes(newName)) {
        setPages(pages.map((p) => (p === targetItem ? newName : p)));
        setBoards((prev) =>
          prev.map((b) => (b.page === targetItem ? { ...b, page: newName } : b)),
        );
        if (activePage === targetItem) setActivePage(newName);
      }
    } else if (modalType === "delete-page") {
      if (pages.length <= 1) return closeModal();
      const nextPages = pages.filter((p) => p !== targetItem);
      setPages(nextPages);
      setBoards((prev) => prev.filter((b) => b.page !== targetItem));
      if (activePage === targetItem) setActivePage(nextPages[0] || "home");
    } else if (modalType === "delete-board" && targetItem) {
      deleteBoard(targetItem.id);
    }
    closeModal();
  };

  const scrollTabs = (dir) => {
    tabsScrollRef.current?.scrollBy({
      left: dir === "left" ? -200 : 200,
      behavior: "smooth",
    });
  };

  // ---- Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event) => {
    setIsDragging(false);
    const { active, delta } = event;
    // dnd-kit reports screen pixels; positions are stored in canvas units.
    const dx = delta.x / scale;
    const dy = delta.y / scale;
    if (dx === 0 && dy === 0) return;
    // Move from where the item is drawn. If the page is re-flowed for a narrow
    // window, the drawn layout becomes the saved layout (what you see is kept).
    const base = layoutSpots.get(active.id) || { x: 0, y: 0 };
    const target = {
      x: Math.max(0, Math.round(base.x + dx)),
      y: Math.max(0, Math.round(base.y + dy)),
    };
    commitShownLayout();
    if (active.id === TODO_ID) {
      setTodoPos(target);
      return;
    }
    setBoards((prev) => prev.map((b) => (b.id === active.id ? { ...b, ...target } : b)));
  };

  const compactChrome = settings.isCompact;
  const boardAlpha = clamp(Number(settings.boardOpacity ?? DEFAULT_BOARD_OPACITY), 0, 90) / 100;

  return (
    <div
      style={{
        "--color-accent": effectiveAccent,
        "--color-accent-contrast": accentContrast,
        "--color-board-text": appTheme.boardText,
        "--color-tab-bg": appTheme.tabBg,
        "--color-tab-text": appTheme.tabText,
        "--board-alpha": boardAlpha,
      }}
      className={cn(
        "h-screen relative flex flex-col transition-opacity duration-300",
        // Keep boards hidden until the saved privacy setting is known, even if the
        // load fallback timer has already revealed the page.
        (privacyMode || !privacyLoaded) && "privacy-mode",
        appReady ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="bg-canvas" />
      <img
        src={background || DEFAULT_WALLPAPER}
        className="bg-image"
        alt=""
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          img.onerror = null;
          if (!img.src.endsWith(DEFAULT_WALLPAPER)) img.src = DEFAULT_WALLPAPER;
        }}
      />

      <main
        className={cn(
          "flex-1 min-h-0 flex flex-col px-4 md:px-10 overflow-hidden transition-[padding] duration-300",
          compactChrome ? "pt-4" : "pt-5 tall:pt-10",
          settings.alignment === "center" ? "items-center" : "items-start",
        )}
      >
        {/* Top Bar */}
        <header
          className={cn(
            "flex flex-col z-50 animate-in fade-in slide-in-from-top-4 duration-700 w-full shrink-0",
            compactChrome ? "gap-3 mb-4" : "gap-4 mb-5 tall:gap-8 tall:mb-12",
          )}
        >
          {/* Row 1: Tabs - follows alignment setting */}
          <div
            className={cn(
              "flex items-center gap-6 w-full",
              settings.alignment === "center" ? "justify-center" : "justify-start",
            )}
          >
            <div className="hidden md:block w-10 h-10 shrink-0" />

            <div className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md shadow-2xl min-w-0 max-w-full">
              <button
                onClick={() => scrollTabs("left")}
                aria-label="Scroll pages left"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all shrink-0"
              >
                <ChevronLeft size={14} />
              </button>

              <div
                ref={tabsScrollRef}
                className="flex items-center gap-1.5 overflow-x-auto scroll-smooth max-w-[70vw] px-1 hide-scrollbar"
              >
                {pages.map((p) => (
                  <div key={p} className="relative flex items-center group/tab shrink-0">
                    <button
                      onClick={() => setActivePage(p)}
                      onDoubleClick={() => {
                        setTargetItem(p);
                        setModalType("rename-page");
                        setModalInput(p);
                      }}
                      className={cn(
                        "font-bold text-xs rounded-xl flex items-center justify-center transition-all duration-300 border border-transparent shrink-0",
                        compactChrome ? "px-6 py-2" : "px-6 py-2 tall:px-8 tall:py-2.5",
                        activePage === p
                          ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-[0_4px_20px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
                          : "bg-[var(--color-tab-bg)] text-[var(--color-tab-text)] hover:text-white hover:bg-white/10",
                      )}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActivePageMenu(activePageMenu === p ? null : p);
                        setActivePageMenuPos({ x: rect.left, y: rect.bottom });
                      }}
                      aria-label={`Page options for ${p}`}
                      className={cn(
                        "absolute right-1.5 w-6 h-6 flex items-center justify-center rounded-lg transition-all opacity-0 group-hover/tab:opacity-100 focus:opacity-100 page-menu-trigger",
                        activePage === p
                          ? "text-[var(--color-accent-contrast)]/50 hover:bg-black/10 hover:text-[var(--color-accent-contrast)]"
                          : "text-white/20 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => scrollTabs("right")}
                aria-label="Scroll pages right"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all shrink-0"
              >
                <ChevronRight size={14} />
              </button>

              <div className="w-[1px] h-5 bg-white/10 mx-1 shrink-0" />

              <button
                onClick={() => setModalType("page")}
                aria-label="Add page"
                title="Add page"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-all shrink-0"
              >
                <Plus size={16} />
              </button>
            </div>

            {activePageMenu &&
              activePageMenuPos &&
              createPortal(
                <div
                  style={{
                    position: "fixed",
                    left: Math.min(activePageMenuPos.x, window.innerWidth - 180),
                    top: activePageMenuPos.y + 8,
                  }}
                  className="w-40 bg-[#161616] border border-white/10 rounded-xl p-1.5 z-[1000] shadow-[0_8px_32px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 page-menu-dropdown backdrop-blur-xl"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTargetItem(activePageMenu);
                      setModalType("rename-page");
                      setModalInput(activePageMenu);
                      setActivePageMenu(null);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 text-[11px] font-bold text-white/70 hover:text-white transition-all"
                  >
                    <Edit2 size={12} className="text-[var(--color-accent)] opacity-70" /> Rename Page
                  </button>
                  {pages.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetItem(activePageMenu);
                        setModalType("delete-page");
                        setActivePageMenu(null);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-500/10 text-[11px] font-bold text-red-400/80 hover:text-red-400 transition-all border-t border-white/5 mt-1 pt-2"
                    >
                      <Trash2 size={12} className="opacity-70" /> Delete Page
                    </button>
                  )}
                </div>,
                document.body,
              )}
          </div>

          {/* Row 2: Search & Add Board */}
          <div className="flex items-center justify-center gap-3 tall:gap-4 w-full">
            <div className="relative group min-w-0">
              <div className="absolute inset-0 bg-white/2 blur-2xl group-hover:bg-white/5 transition-all rounded-full" />
              <div
                className={cn(
                  "relative flex items-center bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md transition-all group-focus-within:border-[var(--color-accent)] group-focus-within:bg-white/10 shadow-lg",
                  compactChrome ? "px-4 py-2" : "px-5 py-2 tall:px-6 tall:py-2.5",
                )}
              >
                <Search className="w-4 h-4 text-white/40 mr-3 shrink-0" />
                <input
                  type="search"
                  placeholder="Search bookmarks..."
                  aria-label="Search bookmarks"
                  role="combobox"
                  aria-expanded={isSearching}
                  aria-controls="search-results"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    isSearching && searchResults.length ? `search-result-${selectedResult}` : undefined
                  }
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={200}
                  className="bg-transparent border-none outline-none text-sm w-[min(24rem,55vw)] font-medium placeholder:text-white/20 [&::-webkit-search-cancel-button]:hidden"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    aria-label="Clear search"
                    className="ml-2 text-white/20 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setTargetSpot(null);
                setModalType("board");
              }}
              className={cn(
                "shrink-0 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all shadow-lg text-white/60 hover:text-white group",
                compactChrome ? "w-9 h-9" : "w-10 h-10 tall:w-11 tall:h-11",
              )}
              title="Add Board"
              aria-label="Add Board"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </header>

        <div className="relative w-full flex-1 min-h-0 flex flex-col">
        {/* Search results cross-fade with the boards. Both layers stay mounted so the
            switch is a fade, not a pop, in both directions. */}
        <div
          className={cn(
            "search-layer absolute inset-0 z-10 overflow-y-auto custom-scroll px-1 pt-1 pb-32",
            isSearching ? "is-visible" : "pointer-events-none",
          )}
          aria-hidden={!isSearching}
        >
          <SearchResults
            query={activeQuery}
            results={searchResults}
            total={searchTotal}
            selectedIndex={selectedResult}
            onSelect={selectResult}
            openInNewTab={settings.openInNewTab ?? true}
            itemRefs={searchItemRefs}
            pending={searchPending}
          />
        </div>

        {/* Board canvas: scrolls in both directions so no board is ever unreachable.
            Hidden with visibility (not unmounted) while searching, so board sizes and
            expanded state are kept. */}
        <DndContext
          sensors={sensors}
          modifiers={[restrictToParentElement]}
          onDragStart={() => setIsDragging(true)}
          onDragCancel={() => setIsDragging(false)}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={scrollRef}
            id="board-container"
            className={cn(
              "board-layer relative w-full flex-1 min-h-0 overflow-auto custom-scroll [scrollbar-gutter:stable]",
              isSearching && "is-hidden",
            )}
            aria-hidden={isSearching}
          >
            <div
              className="relative min-w-full min-h-full"
              style={{ width: wrapperW, height: wrapperH }}
            >
              <div
                ref={canvasRef}
                className="absolute top-0 left-0"
                style={{
                  width: `${100 / scale}%`,
                  height: `${100 / scale}%`,
                  transform: scale === 1 ? undefined : `scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              >
                {settings.showGhostBoard !== false && (
                  <GhostBoardOverlay
                    canvasRef={canvasRef}
                    scrollRef={scrollRef}
                    occupiedBoxes={allBoxes}
                    scale={scale}
                    disabled={isDragging || !!modalType || isSearching}
                    onAdd={(spot) => {
                      setTargetSpot(spot);
                      setModalType("board");
                    }}
                  />
                )}

                {displayBoards.map((board) => (
                  <Board
                    key={board.id}
                    board={board}
                    scale={scale}
                    openInNewTab={settings.openInNewTab ?? true}
                    onMeasure={handleMeasure}
                    onDelete={() => {
                      setTargetItem(board);
                      setModalType("delete-board");
                    }}
                    onRename={() => {
                      setTargetItem(board);
                      setModalType("rename-board");
                      setModalInput(board.title);
                    }}
                    onAddBookmark={(bm) => addBookmark(board.id, bm)}
                    onRemoveBookmark={(url) => removeBookmark(board.id, url)}
                  />
                ))}

                {settings.showTodo && (
                  <TodoBoard
                    todos={todos}
                    onUpdate={setTodos}
                    scale={scale}
                    position={shownTodoPos}
                    onMeasure={handleMeasure}
                  />
                )}
              </div>
            </div>
          </div>
        </DndContext>
        </div>
      </main>

      {/* Daily Quote */}
      {settings.showQuote && quote && (
        <div className="fixed bottom-24 tall:bottom-28 left-1/2 -translate-x-1/2 z-[90] max-w-2xl w-full px-6 text-center animate-in fade-in slide-in-from-bottom-5 duration-700 pointer-events-none">
          <p className="text-white/90 font-medium text-sm md:text-base leading-relaxed mb-2 drop-shadow-md">
            "{quote.content}"
          </p>
          <p className="text-white/50 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase drop-shadow-md">
            — {quote.author}
          </p>
        </div>
      )}

      {/* Floating Dock */}
      <nav
        className={cn(
          "fixed left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-700",
          compactChrome ? "bottom-3" : "bottom-4 tall:bottom-8",
        )}
      >
        <div
          className={cn(
            "flex items-center bg-black/60 backdrop-blur-[30px] rounded-[20px] border border-white/10 shadow-2xl",
            compactChrome ? "gap-1.5 p-1.5" : "gap-2 p-2 tall:gap-3 tall:p-3",
          )}
        >
          <DockItem
            compact={compactChrome}
            icon={<Palette size={20} />}
            label="Style & Wallpapers"
            onClick={() => {
              setIsWallpaperOpen(!isWallpaperOpen);
              setIsSettingsOpen(false);
            }}
            active={isWallpaperOpen}
          />
          <DockItem
            compact={compactChrome}
            icon={privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
            label={privacyMode ? "Disable Privacy" : "Enable Privacy"}
            onClick={() => setPrivacyMode((prev) => !prev)}
            active={privacyMode}
          />
          <DockItem
            compact={compactChrome}
            icon={<Download size={20} />}
            label="Import Bookmarks"
            onClick={() => importChromeBookmarks({ restoreDeleted: true })}
          />
          <div className="w-[1px] h-6 bg-white/10 mx-1 tall:mx-2" />
          <DockItem
            compact={compactChrome}
            icon={<Settings size={20} />}
            label="Settings"
            onClick={() => {
              setIsSettingsOpen(!isSettingsOpen);
              setIsWallpaperOpen(false);
            }}
            active={isSettingsOpen}
          />
        </div>
      </nav>

      {/* Overlays */}
      <WallpaperPanel
        isOpen={isWallpaperOpen}
        onClose={() => setIsWallpaperOpen(false)}
        current={background}
        onSelect={setBackground}
        theme={appTheme}
        effectiveAccent={effectiveAccent}
        onThemeUpdate={setAppTheme}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdate={setSettings}
        canvasScale={scale}
        onTidyUp={tidyUp}
      />

      <Modal
        isOpen={!!modalType}
        onClose={closeModal}
        title={
          {
            page: "Create New Page",
            "rename-board": "Rename Board",
            "rename-page": "Rename Page",
            "delete-page": "Delete Page",
            "delete-board": "Delete Board",
          }[modalType] || "Name your Board"
        }
        confirmLabel={modalType?.startsWith("delete") ? "Delete" : "Confirm"}
        danger={modalType?.startsWith("delete")}
        onSubmit={handleModalSubmit}
      >
        {modalType === "delete-page" || modalType === "delete-board" ? (
          <div className="py-2">
            <p className="text-white/70 text-sm mb-4">
              Are you sure you want to delete the {modalType === "delete-page" ? "page" : "board"}{" "}
              <span className="text-white font-bold">
                "{modalType === "delete-page" ? targetItem : targetItem?.title}"
              </span>
              ?
            </p>
            <p className="text-red-400/80 text-xs bg-red-400/10 p-3 rounded-lg border border-red-500/20">
              {modalType === "delete-page"
                ? "Warning: This will permanently delete all boards and bookmarks on this page."
                : "Warning: This will permanently delete this board and all of its bookmarks."}
            </p>
          </div>
        ) : (
          <input
            type="text"
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
            placeholder="Type here..."
            autoFocus
            maxLength={modalType === "page" || modalType === "rename-page" ? MAX_PAGE_NAME : 80}
            onKeyDown={(e) => e.key === "Enter" && handleModalSubmit()}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-accent)] transition-all"
          />
        )}
      </Modal>

      {/* Sponsor Us Link */}
      <a
        href="mailto:roshanbhadoriya178@gmail.com?subject=Sponsorship%20Inquiry%20-%20Tabshit"
        className="hidden md:block fixed bottom-7 tall:bottom-10 left-8 text-white/30 hover:text-white text-[10px] md:text-xs font-bold tracking-widest uppercase transition-colors z-[100] hover:underline underline-offset-4"
      >
        Sponsor Us
      </a>

      {/* Support Me Button */}
      <button
        onClick={() => setShowSupport(true)}
        aria-label="Support me"
        className="fixed bottom-5 tall:bottom-8 right-5 tall:right-8 w-11 h-11 tall:w-12 tall:h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-[30px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-center text-white transition-colors group attention-bounce z-[100]"
      >
        <img src="icons/tabshit-nobg.png" alt="" className="w-6 h-6 object-contain" />
        <span className="absolute right-full mr-3 px-3 py-1.5 bg-black/80 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
          Support me
        </span>
      </button>

      {/* Support Modal */}
      <Modal
        isOpen={showSupport}
        onClose={() => setShowSupport(false)}
        title="Support My Work"
        hideButtons
      >
        <div className="flex flex-col items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl mb-6 shadow-2xl">
            <img src="Payment.png" alt="QR Code" className="w-56 h-56 object-contain" />
          </div>
          <div className="w-full">
            <p className="text-white/50 text-xs tracking-wider uppercase font-bold mb-2 text-center">
              UPI ID
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3 group">
              <span className="text-white font-mono text-base md:text-lg">8839421616@yescred</span>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText("8839421616@yescred")
                    .catch((err) => console.error("Copy failed", err))
                }
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/20 text-white/50 hover:text-white transition-all"
                title="Copy UPI ID"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Report an element's layout height (unaffected by ancestor transforms).
 * @param {React.RefObject<HTMLElement>} ref
 * @param {string} id
 * @param {(id: string, h: number) => void} onMeasure
 */
function useMeasuredHeight(ref, id, onMeasure) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onMeasure) return;
    const report = () => onMeasure(id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, id, onMeasure]);
}

/** @param {string} raw */
function normalizeUrl(raw) {
  let url = raw.trim();
  if (!url) return null;
  if (!/^(https?|chrome|edge|file):\/\//i.test(url)) url = "https://" + url;
  try {
    const parsed = new URL(url);
    if (/^https?:$/.test(parsed.protocol) && !parsed.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

function Board({
  board,
  scale,
  openInNewTab,
  onMeasure,
  onDelete,
  onRename,
  onAddBookmark,
  onRemoveBookmark,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(false);
  const menuRef = useRef(null);
  const nodeRef = useRef(null);
  const maxVisible = MAX_VISIBLE;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: board.id,
  });
  const setRefs = useCallback(
    (node) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  useMeasuredHeight(nodeRef, board.id, onMeasure);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isMenuOpen]);

  const style = {
    position: "absolute",
    left: board.x || 0,
    top: board.y || 0,
    width: BOARD_WIDTH,
    // Keep the whole board visible; long lists scroll inside the board.
    maxHeight: `calc((100vh - 170px) / ${scale})`,
    transform: transform
      ? `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0) scale(${isDragging ? 1.02 : 1})`
      : undefined,
    transition: "box-shadow 0.2s, opacity 0.2s, background-color 0.3s, border-color 0.3s",
    zIndex: isDragging ? 200 : isMenuOpen ? 100 : 1,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging
      ? "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)"
      : undefined,
    willChange: isDragging ? "transform" : "auto",
  };

  const closeLinkForm = () => {
    setIsAddingLink(false);
    setLinkInput("");
    setLinkError(false);
  };

  const handleAddLink = () => {
    const url = normalizeUrl(linkInput);
    if (!url) {
      setLinkError(true);
      return;
    }
    onAddBookmark({ title: hostnameOf(url), url });
    closeLinkForm();
  };

  const filteredBookmarks = board.bookmarks || [];

  const visibleBookmarks = isExpanded ? filteredBookmarks : filteredBookmarks.slice(0, maxVisible);
  const showMore = filteredBookmarks.length > maxVisible;

  return (
    <div
      ref={setRefs}
      style={style}
      className="glass-card flex flex-col group/board fade-in p-4 rounded-[16px]"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex justify-between items-center pb-3 mb-3 border-b border-white/10 cursor-grab active:cursor-grabbing shrink-0"
      >
        <h3 className="font-bold text-base flex items-center gap-3 blur-sensitive text-[var(--color-board-text)] truncate flex-1">
          {board.title}
        </h3>
        <div
          ref={menuRef}
          className="flex items-center gap-1 relative"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => (isAddingLink ? closeLinkForm() : setIsAddingLink(true))}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 transition-all opacity-0 group-hover/board:opacity-100 focus:opacity-100",
              isAddingLink
                ? "bg-white text-black opacity-100"
                : "bg-white/10 text-white/60 hover:text-white",
            )}
            title="Add Bookmark"
            aria-label="Add bookmark"
          >
            <LinkIcon size={14} />
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Board options"
            aria-label="Board options"
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 border border-white/10 hover:bg-white hover:text-black transition-all opacity-0 group-hover/board:opacity-100 focus:opacity-100",
              isMenuOpen && "opacity-100",
            )}
          >
            <Settings size={14} />
          </button>

          {isMenuOpen && (
            <div className="absolute top-8 right-0 w-40 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-[60] shadow-2xl animate-in fade-in zoom-in-95">
              <button
                onClick={() => {
                  onRename();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 text-xs font-semibold text-white/70 hover:text-white transition-all"
              >
                <Edit2 size={14} /> Rename
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-400 hover:text-red-300 transition-all"
              >
                <Trash2 size={14} /> Delete Board
              </button>
            </div>
          )}
        </div>
      </div>

      {isAddingLink && (
        <div className="mb-4 p-3 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-2 animate-in slide-in-from-top-2 duration-300 flex-shrink-0">
          <input
            type="text"
            placeholder="https://example.com"
            autoFocus
            value={linkInput}
            onChange={(e) => {
              setLinkInput(e.target.value);
              setLinkError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddLink();
              if (e.key === "Escape") closeLinkForm();
            }}
            aria-invalid={linkError}
            className={cn(
              "w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-all",
              linkError
                ? "border-red-400/70"
                : "border-[var(--color-accent)]/30 focus:border-[var(--color-accent)]",
            )}
          />
          {linkError && <p className="text-[10px] text-red-400">Enter a valid link.</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAddLink}
              className="flex-1 py-1.5 bg-neutral-200 hover:bg-white text-black text-[10px] font-bold rounded-lg transition-all"
            >
              Add Link
            </button>
            <button
              onClick={closeLinkForm}
              className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 overflow-y-auto custom-scroll flex-1 min-h-0 pr-1">
        {filteredBookmarks.length === 0 ? (
          !isAddingLink && (
            <div className="py-4 px-3 flex flex-col items-center gap-2.5 text-center border border-dashed border-white/10 rounded-lg">
              <span className="text-white/40 text-xs">No links yet</span>
              <button
                onClick={() => setIsAddingLink(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] text-[11px] font-bold hover:opacity-85 active:scale-95 transition-all"
              >
                <LinkIcon size={12} /> Add link
              </button>
            </div>
          )
        ) : (
          visibleBookmarks.map((bm, i) => (
            <a
              key={`${i}-${bm.url}`}
              href={bm.url}
              target={openInNewTab ? "_blank" : "_self"}
              rel="noreferrer"
              title={bm.url}
              className="flex items-center gap-3 rounded-lg hover:bg-white/10 transition-all group/item overflow-hidden px-3 py-2 shrink-0"
            >
              <img
                src={faviconFor(bm.url)}
                onError={handleIconError}
                className="w-4 h-4 rounded-sm flex-shrink-0 blur-sensitive"
                alt=""
                loading="lazy"
              />
              <span className="font-medium text-sm truncate flex-1 text-white/90 blur-sensitive">
                {bm.title || hostnameOf(bm.url)}
              </span>
              <div className="flex gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveBookmark(bm.url);
                  }}
                  aria-label={`Remove ${bm.title || bm.url}`}
                  className="text-white/40 hover:text-red-400 p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </a>
          ))
        )}

        {showMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-2 py-2 flex items-center justify-between px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all text-xs font-semibold shrink-0"
          >
            <span>
              {isExpanded
                ? "Collapse"
                : `Show remaining ${filteredBookmarks.length - maxVisible}`}
            </span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function DockItem({ icon, label, onClick, active = false, compact = false }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-2xl transition-all duration-300 relative group",
        compact ? "w-9 h-9" : "w-10 h-10 tall:w-12 tall:h-12",
        active
          ? "bg-white text-black"
          : "text-white/50 hover:bg-white/10 hover:text-white hover:-translate-y-1.5 hover:scale-110",
      )}
    >
      {icon}
      <span className="absolute bottom-full mb-3 px-3 py-1 bg-black/80 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
        {label}
      </span>
    </button>
  );
}

function TodoBoard({ todos, onUpdate, scale, position, onMeasure }) {
  const [newTodo, setNewTodo] = useState("");
  const nodeRef = useRef(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: TODO_ID,
  });
  const setRefs = useCallback(
    (node) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  useMeasuredHeight(nodeRef, TODO_ID, onMeasure);

  const style = {
    position: "absolute",
    left: position?.x || 0,
    top: position?.y || 0,
    width: BOARD_WIDTH,
    transform: transform
      ? `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0)`
      : undefined,
    zIndex: isDragging ? 200 : 1,
    opacity: isDragging ? 0.7 : 1,
    willChange: isDragging ? "transform" : "auto",
  };

  const list = Array.isArray(todos) ? todos : [];

  const handleAddTodo = () => {
    if (!newTodo.trim()) return;
    onUpdate((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      { id: Date.now(), text: newTodo.trim(), done: false },
    ]);
    setNewTodo("");
  };

  const toggleTodo = (id) =>
    onUpdate((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const deleteTodo = (id) => onUpdate((prev) => prev.filter((t) => t.id !== id));

  return (
    <div ref={setRefs} style={style} className="glass-card flex flex-col p-4 rounded-[16px]">
      <div
        {...attributes}
        {...listeners}
        className="flex justify-between items-center pb-3 mb-3 border-b border-white/10 cursor-grab active:cursor-grabbing"
      >
        <h3 className="font-bold text-base flex items-center gap-2">
          <ListTodo size={16} className="text-[var(--color-accent)]" /> Todos
        </h3>
        <span className="text-white/30 text-[10px] uppercase font-bold tracking-wider">
          {list.filter((t) => !t.done).length} LEFT
        </span>
      </div>

      <div className="flex gap-2 mb-4" onPointerDown={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add todo..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddTodo();
          }}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)]/40 transition-all"
        />
        <button
          onClick={handleAddTodo}
          aria-label="Add todo"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:opacity-80 transition-all flex-shrink-0"
        >
          <Plus size={14} strokeWidth={3} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scroll">
        {list.length === 0 ? (
          <p className="text-white/20 text-xs text-center py-6">No todos yet</p>
        ) : (
          list.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all group"
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
                  todo.done
                    ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
                    : "border-white/20 hover:border-white/40",
                )}
              >
                {todo.done && <span className="text-[var(--color-accent-contrast)] text-[8px] font-black">✓</span>}
              </button>
              <span
                className={cn(
                  "flex-1 text-xs transition-all break-words min-w-0",
                  todo.done ? "line-through text-white/25" : "text-white/70",
                )}
              >
                {todo.text}
              </span>
              <button
                onClick={() => deleteTodo(todo.id)}
                aria-label="Delete todo"
                className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const GHOST_HEIGHT = 100;

function GhostBoardOverlay({ canvasRef, scrollRef, occupiedBoxes, scale, disabled, onAdd }) {
  const [ghostSpot, setGhostSpot] = useState(null);
  const boxesRef = useRef(occupiedBoxes);
  useEffect(() => {
    boxesRef.current = occupiedBoxes;
  }, [occupiedBoxes]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const canvas = canvasRef.current;
      const scroller = scrollRef.current;
      if (!canvas || !scroller) return;

      // Ignore the area near the dock and anything outside the visible canvas.
      const visible = scroller.getBoundingClientRect();
      if (
        e.clientY > window.innerHeight - 110 ||
        e.clientX < visible.left ||
        e.clientX > visible.right ||
        e.clientY < visible.top ||
        e.clientY > visible.bottom
      ) {
        setGhostSpot(null);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      const canvasW = rect.width / scale;

      const col = Math.floor(x / (BOARD_WIDTH + BOARD_GAP));
      const px = col * (BOARD_WIDTH + BOARD_GAP);
      const py = Math.max(0, Math.round(y - 50));

      const overlaps =
        x < 0 ||
        y < 0 ||
        px + BOARD_WIDTH > canvasW ||
        boxesRef.current.some(
          (box) =>
            px < box.x + box.w &&
            px + BOARD_WIDTH > box.x &&
            py < box.y + box.h &&
            py + GHOST_HEIGHT > box.y,
        );

      setGhostSpot((prev) => {
        if (overlaps) return null;
        return prev?.x === px && prev?.y === py ? prev : { x: px, y: py };
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [canvasRef, scrollRef, scale]);

  if (!ghostSpot || disabled) return null;

  return (
    <div
      onClick={() => onAdd(ghostSpot)}
      className="absolute border-2 border-dashed border-white/20 rounded-[16px] bg-white/5 backdrop-blur-[2px] transition-all cursor-pointer flex items-center justify-center group hover:bg-white/10 hover:border-white/40 z-0"
      style={{
        left: ghostSpot.x,
        top: ghostSpot.y,
        width: BOARD_WIDTH,
        height: GHOST_HEIGHT,
      }}
    >
      <Plus
        size={24}
        className="text-white/20 group-hover:text-white/60 group-hover:scale-110 transition-all"
      />
      <span className="ml-2 font-semibold text-sm tracking-widest uppercase text-white/20 group-hover:text-white/60">
        Add Board
      </span>
    </div>
  );
}
