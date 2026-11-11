/**
 * Board canvas geometry.
 *
 * Positions are stored in "canvas units": a board is always BOARD_WIDTH units
 * wide. Compact mode renders the whole canvas with transform: scale(s), so
 * stored positions never need to change when the size changes.
 */

export const BOARD_WIDTH = 340;
export const BOARD_GAP = 20;
/** Screen pixels kept free under the lowest board so the dock never covers it. */
export const DOCK_CLEARANCE_PX = 120;
export const TODO_ID = "todo-board";
export const LAYOUT_VERSION = 2;

/**
 * Links shown per board before "Show remaining". Same in compact and normal
 * mode: compact is a pure scale, so board heights (in canvas units) never
 * change when it is toggled and boards cannot start overlapping.
 */
export const MAX_VISIBLE = 10;

/** Compact level 0 (Low) → 95% size, 100 (High) → 60% size. */
export const COMPACT_SCALE_MAX = 0.95;
export const COMPACT_SCALE_MIN = 0.6;
export const DEFAULT_COMPACT_LEVEL = 40;
export const DEFAULT_BOARD_OPACITY = 25;

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {{ title: string, url: string }} Bookmark
 * @typedef {{ id: string, title: string, page: string, bookmarks: Bookmark[], x?: number, y?: number }} BoardData
 */

/** @param {number} n @param {number} min @param {number} max */
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** @param {{ isCompact?: boolean, compactLevel?: number }} settings */
export function getCanvasScale(settings) {
  if (!settings?.isCompact) return 1;
  const level = clamp(Number(settings.compactLevel ?? DEFAULT_COMPACT_LEVEL), 0, 100);
  return COMPACT_SCALE_MAX - (level / 100) * (COMPACT_SCALE_MAX - COMPACT_SCALE_MIN);
}

/** @param {{ x?: unknown, y?: unknown } | null | undefined} item */
export const hasPosition = (item) =>
  !!item && Number.isFinite(item.x) && Number.isFinite(item.y);

/**
 * Height guess (canvas units) used until the board has been measured.
 * @param {BoardData} board
 */
export function estimateBoardHeight(board) {
  const count = board.bookmarks?.length ?? 0;
  const maxVisible = MAX_VISIBLE;
  if (count === 0) return 64 + 40 + 32;
  const rows = Math.min(count, maxVisible);
  const moreButton = count > maxVisible ? 44 : 0;
  return 64 + rows * 40 + moreButton + 32;
}

export const TODO_ESTIMATED_HEIGHT = 260;

/**
 * Number of board columns that fit in a viewport of `viewportWidthPx` at `scale`.
 * @param {number} viewportWidthPx
 * @param {number} scale
 */
export function columnsFor(viewportWidthPx, scale) {
  const units = viewportWidthPx / scale;
  return Math.max(1, Math.floor((units + BOARD_GAP) / (BOARD_WIDTH + BOARD_GAP)));
}

/**
 * Masonry placement: the column whose lowest obstacle ends highest.
 * @param {Box[]} occupied
 * @param {number} cols
 * @returns {Point}
 */
export function findFreeSpot(occupied, cols) {
  let best = { x: 0, y: 0 };
  let minY = Infinity;
  for (let c = 0; c < cols; c++) {
    const px = c * (BOARD_WIDTH + BOARD_GAP);
    let py = 0;
    for (const box of occupied) {
      const overlapsColumn = px < box.x + box.w && px + BOARD_WIDTH > box.x;
      if (overlapsColumn) py = Math.max(py, box.y + box.h + BOARD_GAP);
    }
    if (py < minY) {
      minY = py;
      best = { x: px, y: py };
    }
  }
  return best;
}

/**
 * @param {BoardData} board
 * @param {Record<string, number>} sizes measured heights by id
 * @returns {Box}
 */
export function boxForBoard(board, sizes) {
  return {
    x: board.x ?? 0,
    y: board.y ?? 0,
    w: BOARD_WIDTH,
    h: sizes[board.id] ?? estimateBoardHeight(board),
  };
}

/**
 * Spots for every board that has no stored position, per page.
 * Only boards on the same page are obstacles (boards on other pages are not drawn).
 *
 * @param {BoardData[]} boards
 * @param {number} cols
 * @param {Record<string, number>} sizes
 * @param {Box | null} todoBox shown on every page, so it is an obstacle everywhere
 * @returns {Map<string, Point>}
 */
export function computeAutoSpots(boards, cols, sizes, todoBox) {
  const spots = new Map();
  const byPage = new Map();
  for (const b of boards) {
    if (!byPage.has(b.page)) byPage.set(b.page, []);
    byPage.get(b.page).push(b);
  }
  for (const list of byPage.values()) {
    if (list.every(hasPosition)) continue;
    const occupied = list.filter(hasPosition).map((b) => boxForBoard(b, sizes));
    if (todoBox) occupied.push(todoBox);
    for (const b of list) {
      if (hasPosition(b)) continue;
      const spot = findFreeSpot(occupied, cols);
      spots.set(b.id, spot);
      occupied.push({
        ...spot,
        w: BOARD_WIDTH,
        h: sizes[b.id] ?? estimateBoardHeight(b),
      });
    }
  }
  return spots;
}

/**
 * Display-time fix for overlapping items (e.g. a board was expanded and now
 * reaches into the board below). Items keep their x; any item that overlaps
 * an earlier one (reading order) is pushed down just below it. Stored
 * positions are not changed, so collapsing the board restores the layout.
 *
 * @param {{ id: string, x: number, y: number, w: number, h: number }[]} items
 * @returns {Map<string, Point>}
 */
export function resolveOverlaps(items) {
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  /** @type {Box[]} */
  const placed = [];
  const result = new Map();
  for (const item of ordered) {
    let y = item.y;
    // Each pass moves y strictly down past one blocker, so this terminates.
    for (let guard = 0; guard <= placed.length; guard++) {
      const blocker = placed.find(
        (p) => item.x < p.x + p.w && item.x + item.w > p.x && y < p.y + p.h && y + item.h > p.y,
      );
      if (!blocker) break;
      y = blocker.y + blocker.h + BOARD_GAP;
    }
    placed.push({ x: item.x, y, w: item.w, h: item.h });
    result.set(item.id, { x: item.x, y });
  }
  return result;
}

/**
 * Re-flow items into a masonry grid, keeping reading order (top→bottom, left→right).
 * @param {{ id: string, x: number, y: number, h: number }[]} items
 * @param {number} cols
 * @returns {Map<string, Point>}
 */
export function arrangeItems(items, cols) {
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  /** @type {Box[]} */
  const occupied = [];
  const result = new Map();
  for (const item of ordered) {
    const spot = findFreeSpot(occupied, cols);
    result.set(item.id, spot);
    occupied.push({ ...spot, w: BOARD_WIDTH, h: item.h });
  }
  return result;
}
