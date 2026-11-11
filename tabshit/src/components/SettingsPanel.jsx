import React from 'react';
import {
  X,
  AlignCenter,
  AlignLeft,
  Download,
  ExternalLink,
  Minimize2,
  Maximize2,
  Droplet,
  Droplets,
  LayoutGrid,
} from 'lucide-react';
import { DEFAULT_COMPACT_LEVEL, DEFAULT_BOARD_OPACITY } from '../lib/layout';

const Toggle = ({ label, description, value, onChange }) => (
  <section>
    <div className="flex justify-between items-center mb-2 gap-4">
      <h4 className="text-xs font-bold uppercase tracking-widest text-white/30">{label}</h4>
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={onChange}
        aria-label={`Toggle ${label}`}
        className={`w-12 h-6 shrink-0 rounded-full p-1 cursor-pointer transition-all ${value ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-tab-bg)]'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
    {description && <p className="text-[10px] text-white/40 leading-relaxed font-medium">{description}</p>}
  </section>
);

/**
 * Windows 11 style slider: thin track, accent fill, round thumb.
 */
const Slider = ({ label, value, min = 0, max = 100, step = 1, onChange, leftIcon, rightIcon, leftLabel, rightLabel, valueLabel }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <h4 className="text-xs font-bold uppercase tracking-widest text-white/30">{label}</h4>
        <span className="text-xs font-bold text-white/70 tabular-nums">{valueLabel}</span>
      </div>
      <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
        <span className="text-white/60 shrink-0" aria-hidden="true">{leftIcon}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={valueLabel}
          onChange={(e) => onChange(Number(e.target.value))}
          className="win-slider flex-1"
          style={{ '--fill': `${pct}%` }}
        />
        <span className="text-white/60 shrink-0" aria-hidden="true">{rightIcon}</span>
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-[10px] font-semibold text-white/30 px-1">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
};

export function SettingsPanel({ isOpen, onClose, settings, onUpdate, canvasScale, onTidyUp }) {
  if (!isOpen) return null;

  // Functional updates so quick slider drags never drop a change.
  const set = (patch) => onUpdate((prev) => ({ ...(prev || {}), ...patch }));
  const compactLevel = settings.compactLevel ?? DEFAULT_COMPACT_LEVEL;
  const boardOpacity = settings.boardOpacity ?? DEFAULT_BOARD_OPACITY;

  return (
    <div className="side-panel" role="dialog" aria-label="Preferences">
      <div className="flex justify-between items-center mb-6 tall:mb-8 shrink-0">
        <h3 className="text-xl font-bold">Preferences</h3>
        <button onClick={onClose} aria-label="Close preferences" className="text-white/50 hover:text-white"><X size={24} /></button>
      </div>

      <div className="flex flex-col gap-7 overflow-y-auto custom-scroll -mr-3 pr-3 pb-2 min-h-0">
        {/* Alignment */}
        <section>
          <h4 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">Alignment</h4>
          <div className="flex bg-white/5 p-1 rounded-xl">
            {[
              { key: 'left', icon: <AlignLeft size={16} />, label: 'Left' },
              { key: 'center', icon: <AlignCenter size={16} />, label: 'Center' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => set({ alignment: opt.key })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-lg transition-all ${settings.alignment === opt.key ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Compact Mode */}
        <div className="flex flex-col gap-4">
          <Toggle
            label="Compact Mode"
            description="Shrinks boards, header and dock so more fits on small screens."
            value={settings.isCompact}
            onChange={() => set({ isCompact: !settings.isCompact })}
          />
          {settings.isCompact && (
            <Slider
              label="Compact Level"
              value={compactLevel}
              onChange={(v) => set({ compactLevel: v })}
              leftIcon={<Maximize2 size={16} />}
              rightIcon={<Minimize2 size={16} />}
              leftLabel="Low"
              rightLabel="High"
              valueLabel={`${Math.round(canvasScale * 100)}% size`}
            />
          )}
        </div>

        {/* Board opacity */}
        <Slider
          label="Board Opacity"
          value={boardOpacity}
          max={90}
          onChange={(v) => set({ boardOpacity: v })}
          leftIcon={<Droplet size={16} />}
          rightIcon={<Droplets size={16} />}
          leftLabel="Low"
          rightLabel="High"
          valueLabel={`${boardOpacity}%`}
        />

        {/* Tidy up */}
        <section>
          <button
            onClick={onTidyUp}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-accent-contrast)] transition-colors shrink-0">
              <LayoutGrid size={16} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white">Tidy Up Boards</h4>
              <p className="text-xs text-white/50">Arrange this page's boards to fit the window</p>
            </div>
          </button>
        </section>

        {/* Todo Toggle */}
        <Toggle
          label="Todo Widget"
          description="Show a todo board on the canvas."
          value={settings.showTodo}
          onChange={() => set({ showTodo: !settings.showTodo })}
        />

        {/* Quote Toggle */}
        <Toggle
          label="Daily Quote"
          description="Show a daily dose of inspiration above the dock."
          value={settings.showQuote}
          onChange={() => set({ showQuote: !settings.showQuote })}
        />

        {/* Ghost Board Toggle */}
        <Toggle
          label="Hover Board Creation"
          description="Show an Add Board container when hovering empty spaces."
          value={settings.showGhostBoard ?? true}
          onChange={() => set({ showGhostBoard: !(settings.showGhostBoard ?? true) })}
        />

        {/* New Tab Toggle */}
        <Toggle
          label="Open Bookmarks in New Tab"
          description="Open links in a new tab instead of the current one."
          value={settings.openInNewTab ?? true}
          onChange={() => set({ openInNewTab: !(settings.openInNewTab ?? true) })}
        />

        <div className="pt-4 mt-2 border-t border-white/10">
          <a
            href="https://github.com/Roshanbhadauriya/wallpapers.git"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-accent-contrast)] transition-colors">
              <Download size={16} strokeWidth={2.5} />
            </div>
            <div className="flex-1 text-left">
              <h4 className="text-sm font-bold text-white group-hover:text-[var(--color-accent)] transition-colors">Download Wallpapers</h4>
              <p className="text-xs text-white/50">Get more premium backgrounds</p>
            </div>
            <ExternalLink size={16} className="text-white/30 group-hover:text-white/70 transition-colors" />
          </a>
        </div>
      </div>
    </div>
  );
}
