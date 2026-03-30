import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Palette,
  Eye,
  EyeOff,
  Settings,
  X,
  ExternalLink,
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
import { useStorage } from "./hooks/useStorage";
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

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activePage, setActivePage] = useStorage("activePage", "home");
  const [privacyMode, setPrivacyMode] = useStorage("privacyMode", false);
  const [boards, setBoards] = useStorage("boards", []);
  const [pages, setPages] = useStorage("pages", ["home"]);
  const [background, setBackground] = useStorage(
    "customBackground",
    "wallpapers/10050.jpg",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [settings, setSettings] = useStorage("settings", {
    alignment: "left",
    isCompact: false,
    showTodo: false,
    showQuote: false,
    showGhostBoard: true,
    openInNewTab: true,
  });
  const [appTheme, setAppTheme] = useStorage("appTheme", {
    accent: "#00d2ff",
    boardText: "#ffffff",
    tabBg: "rgba(255, 255, 255, 0.1)",
    tabText: "rgba(255, 255, 255, 0.6)",
  });
  const [quote, setQuote] = useState(null);
  const [todos, setTodos] = useStorage("todos", []);
  const [todoPos, setTodoPos] = useStorage("todoPos", null);
  const [appReady, setAppReady] = useState(false);

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
  const tabsScrollRef = React.useRef(null);

  // Click outside to close menus
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        !e.target.closest(".page-menu-trigger") &&
        !e.target.closest(".page-menu-dropdown")
      ) {
        setActivePageMenu(null);
        setActivePageMenuPos(null);
      }
    };
    if (activePageMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activePageMenu]);

  // Fetch Quote
  React.useEffect(() => {
    if (settings.showQuote) {
      fetch("https://api.quotable.io/quotes/random")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.length > 0) setQuote(data[0]);
        })
        .catch((err) => console.error("Error fetching quote:", err));
    }
  }, [settings.showQuote]);

  const filteredBoards = useMemo(() => {
    return boards.filter((b) => b.page === activePage);
  }, [boards, activePage]);

  const togglePrivacy = () => setPrivacyMode(!privacyMode);

  // Fade in after first render to prevent privacy flash
  React.useEffect(() => {
    const timer = setTimeout(() => setAppReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleModalSubmit = () => {
    if (
      !modalInput.trim() &&
      modalType !== "board" &&
      modalType !== "delete-page"
    )
      return;

    if (modalType === "page") {
      const newPage = modalInput.trim().toLowerCase();
      if (!pages.includes(newPage)) {
        setPages([...pages, newPage]);
        setActivePage(newPage);
      }
    } else if (modalType === "board") {
      const newBoard = {
        id: "board-" + Date.now(),
        title: modalInput.trim() || "New Board",
        page: activePage,
        bookmarks: [],
        ...(targetSpot ? { x: targetSpot.x, y: targetSpot.y } : {}),
      };
      setBoards([...boards, newBoard]);
      setTargetSpot(null);
    } else if (modalType === "rename-board") {
      setBoards(
        boards.map((b) =>
          b.id === targetItem.id ? { ...b, title: modalInput.trim() } : b,
        ),
      );
    } else if (modalType === "rename-page") {
      const newName = modalInput.trim().toLowerCase();
      if (newName && !pages.includes(newName)) {
        setPages(pages.map((p) => (p === targetItem ? newName : p)));
        setBoards(
          boards.map((b) =>
            b.page === targetItem ? { ...b, page: newName } : b,
          ),
        );
        if (activePage === targetItem) setActivePage(newName);
      }
    } else if (modalType === "delete-page") {
      if (pages.length <= 1) return; // Don't delete last page
      const nextPages = pages.filter((p) => p !== targetItem);
      setPages(nextPages);
      setBoards(boards.filter((b) => b.page !== targetItem));
      if (activePage === targetItem) {
        setActivePage(nextPages[0] || "home");
      }
    }

    setModalType(null);
    setModalInput("");
    if (modalType !== "board") setTargetSpot(null);
  };

  const scrollTabs = (dir) => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({
        left: dir === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  const handleImport = async () => {
    if (!chrome.bookmarks) return;
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0].children[0].children || [];

    if (bar.length > 0) {
      const importedBoard = {
        id: "board-imported-" + Date.now(),
        title: "Imported from Chrome",
        page: "home",
        bookmarks: bar.map((b) => ({ title: b.title, url: b.url })),
      };
      setBoards([...boards, importedBoard]);
      setActivePage("home");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Provide default collision-free positions
  const boardWidth = settings.isCompact ? 280 : 340;
  const gap = 20;
  const cols = Math.max(
    1,
    Math.floor(
      (typeof window !== "undefined" ? window.innerWidth - 80 : 1200) /
        (boardWidth + gap),
    ),
  );

  const occupiedBoxes = [];

  filteredBoards.forEach((b) => {
    if (b.x !== undefined && b.y !== undefined) {
      const bmarks = b.bookmarks || [];
      const visibleCount = Math.min(bmarks.length, settings.isCompact ? 5 : 10);
      const estHeight =
        (settings.isCompact ? 56 : 64) +
        visibleCount * (settings.isCompact ? 32 : 44) +
        20;
      occupiedBoxes.push({ x: b.x, y: b.y, w: boardWidth, h: estHeight });
    }
  });

  if (settings.showTodo && todoPos) {
    occupiedBoxes.push({ x: todoPos.x, y: todoPos.y, w: boardWidth, h: 250 });
  }

  const findFreeSpot = () => {
    let bestSpot = { x: 0, y: 0 };
    let minPy = Infinity;

    for (let c = 0; c < cols; c++) {
      const px = c * (boardWidth + gap);
      const boxesInCol = occupiedBoxes.filter(
        (box) => px < box.x + box.w && px + boardWidth > box.x,
      );

      let py = 0;
      if (boxesInCol.length > 0) {
        py = Math.max(...boxesInCol.map((b) => b.y + b.h)) + gap;
      }

      if (py < minPy) {
        minPy = py;
        bestSpot = { x: px, y: py };
      }
    }
    return bestSpot;
  };

  const positionedBoards = filteredBoards.map((b) => {
    if (b.x !== undefined && b.y !== undefined) return b;
    const spot = findFreeSpot();
    occupiedBoxes.push({ x: spot.x, y: spot.y, w: boardWidth, h: 320 });
    return { ...b, x: spot.x, y: spot.y };
  });

  const finalTodoPos = todoPos || findFreeSpot();
  if (settings.showTodo && !todoPos) {
    occupiedBoxes.push({
      x: finalTodoPos.x,
      y: finalTodoPos.y,
      w: boardWidth,
      h: 400,
    });
  }

  const handleDragEnd = (event) => {
    const { active, delta } = event;
    // Handle todo board position
    if (active.id === "todo-board") {
      setTodoPos((prev) => {
        const currentX = prev ? prev.x : finalTodoPos.x;
        const currentY = prev ? prev.y : finalTodoPos.y;
        return {
          x: Math.max(0, currentX + delta.x),
          y: Math.max(0, currentY + delta.y),
        };
      });
      return;
    }
    // Handle regular boards
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id === active.id) {
          // If the board was previously unpositioned, we need to grab its auto-assigned spot
          const currentX =
            b.x !== undefined
              ? b.x
              : positionedBoards.find((pb) => pb.id === b.id)?.x || 0;
          const currentY =
            b.y !== undefined
              ? b.y
              : positionedBoards.find((pb) => pb.id === b.id)?.y || 0;
          return {
            ...b,
            x: Math.max(0, currentX + delta.x),
            y: Math.max(0, currentY + delta.y),
          };
        }
        return b;
      }),
    );
  };

  return (
    <div
      style={{
        "--color-accent": appTheme.accent,
        "--color-board-text": appTheme.boardText,
        "--color-tab-bg": appTheme.tabBg,
        "--color-tab-text": appTheme.tabText,
      }}
      className={cn(
        "min-h-screen relative flex flex-col transition-opacity duration-300",
        privacyMode && "privacy-mode",
        appReady ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="bg-canvas" />
      <img src={background} className="bg-image" alt="" />

      <main
        className={cn(
          "flex-1 flex flex-col px-6 md:px-10 pt-10 pb-28 overflow-hidden transition-all duration-700",
          settings.alignment === "center" ? "items-center" : "items-start",
        )}
      >
        {/* Top Bar */}
        <header
          className={cn(
            "flex flex-col gap-8 mb-16 z-50 animate-in fade-in slide-in-from-top-4 duration-700 w-full",
          )}
        >
          {/* Row 1: Logo & Tabs - Follows Alignment Setting */}
          <div
            className={cn(
              "flex items-center gap-6 w-full",
              settings.alignment === "center" && "justify-center",
              settings.alignment === "left" && "justify-start",
            )}
          >
            <img
              src="icons/tabshit-nobg.png"
              className="w-10 h-10 drop-shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
              alt="Tabshit"
            />

            <div className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md shadow-2xl">
              <button
                onClick={() => scrollTabs("left")}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all shrink-0"
              >
                <ChevronLeft size={14} />
              </button>

              <div
                ref={tabsScrollRef}
                className="flex items-center gap-1.5 overflow-x-hidden scroll-smooth max-w-[80vw] px-1 hide-scrollbar"
              >
                {pages.map((p) => (
                  <div
                    key={p}
                    className="relative flex items-center group/tab shrink-0"
                  >
                    <button
                      onClick={() => setActivePage(p)}
                      onDoubleClick={() => {
                        setTargetItem(p);
                        setModalType("rename-page");
                        setModalInput(p);
                      }}
                      className={cn(
                        "px-8 py-2.5 font-bold text-xs rounded-xl flex items-center justify-center transition-all duration-300 border border-transparent shrink-0",
                        activePage === p
                          ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-black shadow-[0_4px_20px_rgba(0,210,255,0.3)]"
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
                      className={cn(
                        "absolute right-2.5 w-6 h-6 flex items-center justify-center rounded-lg transition-all opacity-0 group-hover/tab:opacity-100 page-menu-trigger",
                        activePage === p
                          ? "text-black/40 hover:bg-black/10 hover:text-black"
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
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all shrink-0"
              >
                <ChevronRight size={14} />
              </button>

              <div className="w-[1px] h-5 bg-white/10 mx-1 shrink-0" />

              <button
                onClick={() => setModalType("page")}
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
                    left: Math.min(
                      activePageMenuPos.x,
                      window.innerWidth - 180,
                    ),
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
                    <Edit2
                      size={12}
                      className="text-[var(--color-accent)] opacity-70"
                    />{" "}
                    Rename Page
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

          {/* Row 2: Search & Add Board - Centered */}
          <div className="flex items-center justify-center gap-4 w-full">
            <div className="relative group">
              <div className="absolute inset-0 bg-white/2 blur-2xl group-hover:bg-white/5 transition-all rounded-full" />
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-2xl px-6 py-2.5 backdrop-blur-md transition-all group-focus-within:border-[var(--color-accent)] group-focus-within:bg-white/10 shadow-lg">
                <Search className="w-4 h-4 text-white/40 mr-4" />
                <input
                  type="text"
                  placeholder="Search bookmarks..."
                  className="bg-transparent border-none outline-none text-sm w-64 md:w-96 font-medium placeholder:text-white/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={() => setModalType("board")}
              className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all shadow-lg text-white/60 hover:text-white group"
              title="Add Board"
            >
              <Plus
                size={20}
                className="group-hover:rotate-90 transition-transform duration-300"
              />
            </button>
          </div>
        </header>

        {/* Full-Screen Canvas */}
        <DndContext
          sensors={sensors}
          modifiers={[restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <div id="board-container" className="relative w-full flex-1">
            {settings.showGhostBoard !== false && (
              <GhostBoardOverlay
                occupiedBoxes={occupiedBoxes}
                boardWidth={boardWidth}
                gap={gap}
                isCompact={settings.isCompact}
                onAdd={(spot) => {
                  setTargetSpot(spot);
                  setModalType("board");
                }}
              />
            )}

            {positionedBoards.map((board) => (
              <Board
                key={board.id}
                board={board}
                settings={settings}
                isCompact={settings.isCompact}
                searchQuery={searchQuery}
                onDelete={() =>
                  setBoards(boards.filter((b) => b.id !== board.id))
                }
                onRename={() => {
                  setTargetItem(board);
                  setModalType("rename-board");
                  setModalInput(board.title);
                }}
                onUpdate={(updatedBoard) =>
                  setBoards(
                    boards.map((b) =>
                      b.id === updatedBoard.id ? updatedBoard : b,
                    ),
                  )
                }
              />
            ))}

            {settings.showTodo && (
              <TodoBoard
                todos={todos}
                onUpdate={setTodos}
                isCompact={settings.isCompact}
                position={finalTodoPos}
              />
            )}
          </div>
        </DndContext>
      </main>

      {/* Daily Quote */}
      {settings.showQuote && quote && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[90] max-w-2xl w-full px-6 text-center animate-in fade-in slide-in-from-bottom-5 duration-700 pointer-events-none">
          <p className="text-white/90 font-medium text-sm md:text-base leading-relaxed mb-2 drop-shadow-md">
            "{quote.content}"
          </p>
          <p className="text-white/50 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase drop-shadow-md">
            — {quote.author}
          </p>
        </div>
      )}

      {/* Floating Dock */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-700">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-[30px] p-3 rounded-[20px] border border-white/10 shadow-2xl">
          <DockItem
            icon={<Palette size={22} />}
            label="Style & Wallpapers"
            onClick={() => {
              setIsWallpaperOpen(!isWallpaperOpen);
              setIsSettingsOpen(false);
            }}
            active={isWallpaperOpen}
          />
          <DockItem
            icon={privacyMode ? <EyeOff size={22} /> : <Eye size={22} />}
            label={privacyMode ? "Disable Privacy" : "Enable Privacy"}
            onClick={togglePrivacy}
            active={privacyMode}
          />
          <DockItem
            icon={<Download size={22} />}
            label="Import Bookmarks"
            onClick={handleImport}
          />
          <div className="w-[1px] h-6 bg-white/10 mx-2" />
          <DockItem
            icon={<Settings size={22} />}
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
        onThemeUpdate={setAppTheme}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        theme={appTheme}
        onUpdate={setSettings}
        onThemeUpdate={setAppTheme}
      />

      <Modal
        isOpen={!!modalType}
        onClose={() => setModalType(null)}
        title={
          modalType === "page"
            ? "Create New Page"
            : modalType === "rename-board"
              ? "Rename Board"
              : modalType === "rename-page"
                ? "Rename Page"
                : modalType === "delete-page"
                  ? "Delete Page"
                  : "Name your Board"
        }
        onSubmit={handleModalSubmit}
      >
        {modalType === "delete-page" ? (
          <div className="py-4">
            <p className="text-white/70 text-sm mb-4">
              Are you sure you want to delete the page{" "}
              <span className="text-white font-bold">"{targetItem}"</span>?
            </p>
            <p className="text-red-400/80 text-xs bg-red-400/10 p-3 rounded-lg border border-red-500/20">
              Warning: This will permanently delete all boards and bookmarks on
              this page.
            </p>
          </div>
        ) : (
          <input
            type="text"
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
            placeholder="Type here..."
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleModalSubmit()}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent-blue transition-all"
          />
        )}
      </Modal>

      {/* Sponsor Us Link */}
      <a
        href="mailto:roshanbhadoriya178@gmail.com?subject=Sponsorship%20Inquiry%20-%20Tabshit"
        className="fixed bottom-10 left-8 text-white/30 hover:text-white text-[10px] md:text-xs font-bold tracking-widest uppercase transition-colors z-[100] hover:underline underline-offset-4"
      >
        Sponsor Us
      </a>

      {/* Support Me Button */}
      <button
        onClick={() => setShowSupport(true)}
        className="fixed bottom-8 right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-[30px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-center text-white transition-colors group attention-bounce z-[100]"
      >
        <img
          src="icons/tabshit-nobg.png"
          alt="Support"
          className="w-6 h-6 object-contain"
        />
        <span className="absolute right-full mr-3 px-3 py-1.5 bg-black/80 text-white text-xs font-bold rounded-lg opacity-0 group-[.hover]:opacity-100 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
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
            <img
              src="Payment.png"
              alt="QR Code"
              className="w-56 h-56 object-contain"
            />
          </div>
          <div className="w-full">
            <p className="text-white/50 text-xs tracking-wider uppercase font-bold mb-2 text-center">
              UPI ID
            </p>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3 group">
              <span className="text-white font-mono text-base md:text-lg">
                8839421616@yescred
              </span>
              <button
                onClick={() =>
                  navigator.clipboard.writeText("8839421616@yescred")
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

function Board({
  board,
  searchQuery,
  onDelete,
  onRename,
  onUpdate,
  isCompact,
  settings,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const MAX_VISIBLE = isCompact ? 5 : 10;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: board.id });

  const style = {
    position: "absolute",
    left: board.x || 0,
    top: board.y || 0,
    width: isCompact ? 280 : 340,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    zIndex: isDragging ? 200 : 1,
    opacity: isDragging ? 0.7 : 1,
    willChange: isDragging ? "transform" : "auto",
  };

  const handleAddLink = (url) => {
    if (!url.trim()) return;
    const formattedUrl = url.trim().startsWith("http")
      ? url.trim()
      : "https://" + url.trim();
    let title = formattedUrl;
    try {
      title = new URL(formattedUrl).hostname;
    } catch (e) {}

    onUpdate({
      ...board,
      bookmarks: [...board.bookmarks, { title, url: formattedUrl }],
    });
    setIsAddingLink(false);
  };

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery) return board.bookmarks || [];
    const q = searchQuery.toLowerCase();
    return (board.bookmarks || []).filter(
      (bm) =>
        bm.title.toLowerCase().includes(q) || bm.url.toLowerCase().includes(q),
    );
  }, [board.bookmarks, searchQuery]);

  const visibleBookmarks = isExpanded
    ? filteredBookmarks
    : filteredBookmarks.slice(0, MAX_VISIBLE);
  const showMore = filteredBookmarks.length > MAX_VISIBLE;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass-card flex flex-col group/board fade-in max-h-[calc(100vh-250px)]",
        isCompact ? "p-3 rounded-[12px]" : "p-4 rounded-[16px]",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex justify-between items-center pb-3 mb-3 border-b border-white/10 cursor-grab active:cursor-grabbing"
      >
        <h3
          className={cn(
            "font-bold flex items-center gap-3 blur-sensitive text-[var(--color-board-text)]",
            isCompact ? "text-sm" : "text-base",
          )}
        >
          {board.title}
        </h3>
        <div
          className="flex items-center gap-1 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setIsAddingLink(!isAddingLink)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 transition-all opacity-0 group-hover/board:opacity-100",
              isAddingLink
                ? "bg-white text-black"
                : "bg-white/10 text-white/60 hover:text-white",
            )}
            title="Add Bookmark"
          >
            <LinkIcon size={14} />
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 border border-white/10 hover:bg-white hover:text-black transition-all opacity-0 group-hover/board:opacity-100"
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
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddLink(e.target.value);
              if (e.key === "Escape") setIsAddingLink(false);
            }}
            className="w-full bg-black/40 border border-[var(--color-accent)]/30 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)] transition-all"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                const input = document.querySelector(
                  'input[placeholder="https://example.com"]',
                );
                if (input) handleAddLink(input.value);
              }}
              className="flex-1 py-1.5 bg-neutral-200 hover:bg-white text-black text-[10px] font-bold rounded-lg transition-all"
            >
              Add Link
            </button>
            <button
              onClick={() => setIsAddingLink(false)}
              className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 overflow-y-auto custom-scroll flex-1 pr-1">
        {filteredBookmarks.length === 0 ? (
          <div className="py-2 text-white/30 text-xs text-center border border-dashed border-white/10 rounded-lg">
            {searchQuery ? "No matches found" : "Drop links here"}
          </div>
        ) : (
          visibleBookmarks.map((bm, i) => (
            <a
              key={i}
              href={bm.url}
              target={(settings.openInNewTab ?? true) ? "_blank" : "_self"}
              rel="noreferrer"
              className={cn(
                "flex items-center gap-3 rounded-lg hover:bg-white/10 transition-all group/item overflow-hidden",
                isCompact ? "px-2 py-1.5" : "px-3 py-2",
              )}
            >
              <img
                src={`chrome-extension://${chrome.runtime?.id}/_favicon/?pageUrl=${encodeURIComponent(bm.url)}&size=32`}
                onError={(e) => (e.target.src = "icons/icon16.png")}
                className="w-4 h-4 rounded-sm flex-shrink-0 blur-sensitive"
                alt=""
              />
              <span
                className={cn(
                  "font-medium truncate flex-1 text-white/90 blur-sensitive",
                  isCompact ? "text-[13px]" : "text-sm",
                )}
              >
                {bm.title}
              </span>
              <div className="flex gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUpdate({
                      ...board,
                      bookmarks: board.bookmarks.filter(
                        (b) => b.url !== bm.url,
                      ),
                    });
                  }}
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
            className="w-full mt-2 py-2 flex items-center justify-between px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all text-xs font-semibold"
          >
            <span>
              {isExpanded
                ? "Collapse"
                : `Show remaining ${filteredBookmarks.length - MAX_VISIBLE}`}
            </span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function DockItem({ icon, label, onClick, active = false }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300 relative group",
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

function TodoBoard({ todos, onUpdate, isCompact, position }) {
  const [newTodo, setNewTodo] = useState("");
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: "todo-board" });

  const style = {
    position: "absolute",
    left: position?.x || 0,
    top: position?.y || 0,
    width: isCompact ? 280 : 340,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    zIndex: isDragging ? 200 : 1,
    opacity: isDragging ? 0.7 : 1,
    willChange: isDragging ? "transform" : "auto",
  };

  const handleAddTodo = () => {
    if (!newTodo.trim()) return;
    onUpdate([...todos, { id: Date.now(), text: newTodo.trim(), done: false }]);
    setNewTodo("");
  };

  const toggleTodo = (id) =>
    onUpdate(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const deleteTodo = (id) => onUpdate(todos.filter((t) => t.id !== id));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass-card flex flex-col",
        isCompact ? "p-3 rounded-[12px]" : "p-4 rounded-[16px]",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex justify-between items-center pb-3 mb-3 border-b border-white/10 cursor-grab active:cursor-grabbing"
      >
        <h3
          className={cn(
            "font-bold flex items-center gap-2",
            isCompact ? "text-sm" : "text-base",
          )}
        >
          <ListTodo size={16} className="text-[var(--color-accent)]" /> Todos
        </h3>
        <span className="text-white/30 text-[10px] uppercase font-bold tracking-wider">
          {todos.filter((t) => !t.done).length} LEFT
        </span>
      </div>

      <div className="flex gap-2 mb-4" onClick={(e) => e.stopPropagation()}>
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
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-black hover:opacity-80 transition-all flex-shrink-0"
        >
          <Plus size={14} strokeWidth={3} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scroll">
        {todos.length === 0 ? (
          <p className="text-white/20 text-xs text-center py-6">No todos yet</p>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all group"
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
                  todo.done
                    ? "bg-[#00d2ff] border-[#00d2ff]"
                    : "border-white/20 hover:border-white/40",
                )}
              >
                {todo.done && (
                  <span className="text-black text-[8px] font-black">✓</span>
                )}
              </button>
              <span
                className={cn(
                  "flex-1 text-xs transition-all",
                  todo.done ? "line-through text-white/25" : "text-white/70",
                )}
              >
                {todo.text}
              </span>
              <button
                onClick={() => deleteTodo(todo.id)}
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

function GhostBoardOverlay({
  occupiedBoxes,
  boardWidth,
  gap,
  isCompact,
  onAdd,
}) {
  const [ghostSpot, setGhostSpot] = React.useState(null);

  React.useEffect(() => {
    const handleMouseMove = (e) => {
      const container = document.getElementById("board-container");
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Ignore if hovering near the bottom UI elements (dock, support, sponsor)
      if (e.clientY > window.innerHeight - 120) {
        if (ghostSpot) setGhostSpot(null);
        return;
      }

      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        if (ghostSpot) setGhostSpot(null);
        return;
      }

      const col = Math.floor(x / (boardWidth + gap));
      const px = col * (boardWidth + gap);
      const py = Math.max(0, y - 50);

      const overlaps = occupiedBoxes.some(
        (box) =>
          px < box.x + box.w &&
          px + boardWidth > box.x &&
          py < box.y + box.h &&
          py + (isCompact ? 80 : 100) > box.y,
      );

      if (!overlaps) {
        setGhostSpot((prev) =>
          prev?.x === px && prev?.y === py ? prev : { x: px, y: py },
        );
      } else {
        setGhostSpot(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [occupiedBoxes, boardWidth, gap, ghostSpot]);

  if (!ghostSpot) return null;

  return (
    <div
      onClick={() => onAdd(ghostSpot)}
      className={cn(
        "absolute border-2 border-dashed border-white/20 rounded-[16px] bg-white/5 backdrop-blur-[2px] transition-all cursor-pointer flex items-center justify-center group hover:bg-white/10 hover:border-white/40 z-0",
        isCompact ? "h-[80px]" : "h-[100px]",
      )}
      style={{
        left: ghostSpot.x,
        top: ghostSpot.y,
        width: boardWidth,
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
