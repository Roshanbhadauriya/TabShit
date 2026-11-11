import React, { useEffect } from 'react';
import { SearchX, CornerDownLeft } from 'lucide-react';
import { faviconFor, handleIconError } from '../lib/favicon';

/** @param {string} s */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bold the parts of `text` that match any query word. */
function Highlight({ text, words }) {
  if (!words.length) return text;
  const re = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'ig');
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent text-[var(--color-accent)] font-bold">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/**
 * Flat list of matching bookmarks shown in place of the boards while searching.
 * Selection is driven from the search input (arrow keys / Enter) by the parent.
 */
export function SearchResults({
  query,
  results,
  total,
  selectedIndex,
  onSelect,
  openInNewTab,
  itemRefs,
  pending,
}) {
  const words = query.trim().split(/\s+/).filter(Boolean);

  // Keep the keyboard-selected row in view.
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, itemRefs]);

  if (!query.trim()) return null;

  if (results.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-center py-16 text-white/50 transition-opacity duration-150 ${pending ? 'opacity-0' : 'opacity-100'}`}
        role="status"
      >
        <SearchX size={28} className="mb-3 text-white/30" />
        <p className="text-sm font-semibold text-white/70">No bookmarks match "{query.trim()}"</p>
        <p className="text-xs mt-1">Try a shorter word or part of the website address.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto" aria-busy={pending}>
      <div className="flex justify-between items-center px-2 mb-2 text-[11px] font-semibold text-white/40">
        <span>
          {total} {total === 1 ? 'bookmark' : 'bookmarks'}
          {total > results.length ? ` · showing top ${results.length}` : ''}
        </span>
        <span className="hidden sm:flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10">↑</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10">↓</kbd> to move ·
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 inline-flex items-center"><CornerDownLeft size={10} /></kbd> to open ·
          <kbd className="px-1.5 py-0.5 rounded bg-white/10">Esc</kbd> to clear
        </span>
      </div>
      <ul
        id="search-results"
        role="listbox"
        aria-label="Search results"
        className="glass-card flex flex-col gap-0.5 p-2 rounded-[16px]"
      >
        {results.map((r, i) => {
          const active = i === selectedIndex;
          return (
            <li key={r.key} role="option" aria-selected={active} id={`search-result-${i}`}>
              <a
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={r.url}
                target={openInNewTab ? '_blank' : '_self'}
                rel="noreferrer"
                onMouseMove={() => !active && onSelect(i)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  active ? 'bg-white/15' : 'hover:bg-white/10'
                }`}
              >
                <img
                  src={faviconFor(r.url)}
                  onError={handleIconError}
                  alt=""
                  loading="lazy"
                  className="w-5 h-5 rounded-sm shrink-0 blur-sensitive"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/90 truncate blur-sensitive">
                    <Highlight text={r.title} words={words} />
                  </div>
                  <div className="text-[11px] text-white/40 truncate blur-sensitive">
                    <Highlight text={r.host} words={words} />
                  </div>
                </div>
                <span
                  className="shrink-0 max-w-[40%] truncate text-[10px] font-semibold px-2 py-1 rounded-md bg-white/5 text-white/50 border border-white/10"
                  title={`Board: ${r.boardTitle} · Page: ${r.page}`}
                >
                  {r.boardTitle || 'Untitled'}
                  {r.alsoIn > 0 ? ` +${r.alsoIn}` : ''}
                </span>
                {active && <CornerDownLeft size={14} className="shrink-0 text-white/40" aria-hidden="true" />}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
