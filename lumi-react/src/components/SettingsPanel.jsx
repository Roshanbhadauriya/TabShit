import React from 'react';
import { X, Layout, AlignCenter, AlignLeft, ListTodo, Download, ExternalLink } from 'lucide-react';

const Toggle = ({ label, description, value, onChange }) => (
  <section>
    <div className="flex justify-between items-center mb-2">
      <h4 className="text-xs font-bold uppercase tracking-widest text-white/30">{label}</h4>
      <div 
        onClick={onChange}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onChange()}
        aria-label={`Toggle ${label}`}
        className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all ${value ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-tab-bg)]'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </div>
    </div>
    {description && <p className="text-[10px] text-white/40 leading-relaxed font-medium">{description}</p>}
  </section>
);

export function SettingsPanel({ isOpen, onClose, settings, onUpdate }) {
  if (!isOpen) return null;

  return (
    <div className={`fixed top-10 bottom-32 right-10 w-[380px] bg-[#0f0f0f] border border-white/10 rounded-[24px] p-8 z-[200] flex flex-col shadow-2xl transition-all duration-500 transform ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xl font-bold">Preferences</h3>
        <button onClick={onClose} className="text-white/50 hover:text-white"><X size={24} /></button>
      </div>

      <div className="flex flex-col gap-8">
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
                onClick={() => onUpdate({ ...settings, alignment: opt.key })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-lg transition-all ${settings.alignment === opt.key ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Compact Mode */}
        <Toggle
          label="Compact Mode"
          description="Reduces board size and spacing for higher information density."
          value={settings.isCompact}
          onChange={() => onUpdate({ ...settings, isCompact: !settings.isCompact })}
        />

        {/* Todo Toggle */}
        <Toggle
          label="Todo Widget"
          description="Show a todo board on the canvas."
          value={settings.showTodo}
          onChange={() => onUpdate({ ...settings, showTodo: !settings.showTodo })}
        />

        {/* Quote Toggle */}
        <Toggle
          label="Daily Quote"
          description="Show a daily dose of inspiration above the dock."
          value={settings.showQuote}
          onChange={() => onUpdate({ ...settings, showQuote: !settings.showQuote })}
        />

        {/* Ghost Board Toggle */}
        <Toggle
          label="Hover Board Creation"
          description="Show an Add Board container when hovering empty spaces."
          value={settings.showGhostBoard ?? true}
          onChange={() => onUpdate({ ...settings, showGhostBoard: !(settings.showGhostBoard ?? true) })}
        />

        {/* New Tab Toggle */}
        <Toggle
          label="Open Bookmarks in New Tab"
          description="Open links in a new tab instead of the current one."
          value={settings.openInNewTab ?? true}
          onChange={() => onUpdate({ ...settings, openInNewTab: !(settings.openInNewTab ?? true) })}
        />

        <div className="pt-4 mt-2 border-t border-white/10">
          <a
            href="https://github.com/Roshanbhadauriya/wallpapers.git"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-black transition-colors">
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
