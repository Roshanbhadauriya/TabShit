import React, { useState, useRef } from 'react';
import { X, Upload, Palette, Image as ImageIcon, RotateCcw, Wand2 } from 'lucide-react';

const WALLPAPERS = [
  { file: '10037.jpg', name: 'Mountain Sunset', type: 'dark' },
  { file: '10038.jpg', name: 'Ocean Aerial', type: 'light' },
  { file: '10039.jpg', name: 'Forest Path', type: 'dark' },
  { file: '10040.jpg', name: 'City Skyline', type: 'dark' },
  { file: '10042.jpg', name: 'Desert Dune', type: 'light' },
  { file: '10043.jpg', name: 'Aurora Borealis', type: 'dark' },
  { file: '10044.jpg', name: 'Snowy Peak', type: 'light' },
  { file: '10046.jpg', name: 'Autumn Leaves', type: 'dark' },
  { file: '10048.jpg', name: 'Abstract Waves', type: 'dark' },
  { file: '10049.jpg', name: 'Minimalist Sand', type: 'light' },
  { file: '10050.jpg', name: 'Space Nebula', type: 'dark' },
  { file: '10051.jpg', name: 'Tropical Beach', type: 'light' },
  { file: '10052.jpg', name: 'Misty Mountains', type: 'light' },
  { file: '10053.jpg', name: 'Night City', type: 'dark' },
  { file: '10055.jpg', name: 'Raindrops', type: 'dark' },
  { file: '10056.jpg', name: 'Geometric Shapes', type: 'light' },
  { file: '10057.jpg', name: 'Neon Lights', type: 'dark' },
  { file: '10064.jpg', name: 'Deep Space', type: 'dark' },
  { file: '10065.jpg', name: 'Cloudy Sky', type: 'light' },
  { file: '10066.jpg', name: 'Green Valley', type: 'light' },
  { file: '10069.jpg', name: 'Abstract Dark', type: 'dark' },
  { file: '10070.jpg', name: 'Abstract Light', type: 'light' },
  { file: 'default.jpg', name: 'Default Dark Flow', type: 'dark' }
];

const ACCENT_PRESETS = ['#00d2ff', '#ff2a5f', '#00e676', '#9d50bb', '#fbc531', '#ff9ff3', '#ffffff'];

const FancyColorPicker = ({ label, value, onChange, presets = ACCENT_PRESETS, allowAlpha = false }) => {
  return (
    <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-white/80">{label}</span>
        <input 
          type="text" 
          value={value || ""} 
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent border-b border-white/20 text-xs text-white/50 w-32 px-1 focus:outline-none focus:border-[var(--color-accent)] focus:text-white transition-all text-right font-mono"
        />
      </div>
      <div className="flex gap-2 flex-wrap mt-1">
        {presets.map(color => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 active:scale-95 ${value === color ? 'border-white scale-110' : 'border-transparent hover:border-white/50'}`}
            style={{ 
              backgroundColor: color, 
              boxShadow: value === color ? `0 0 12px ${color === 'transparent' ? 'rgba(255,255,255,0.2)' : color}` : 'none',
              backgroundImage: color === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
              backgroundSize: color === 'transparent' ? '8px 8px' : 'auto',
              backgroundPosition: color === 'transparent' ? '0 0, 0 4px, 4px -4px, -4px 0px' : 'auto'
            }}
            title={color}
          />
        ))}
        {!allowAlpha && (
          <div className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-dashed border-white/30 cursor-pointer hover:border-white hover:scale-110 transition-all flex items-center justify-center bg-white/5" title="Custom Color">
             <Palette size={12} className="text-white/50" />
             <input 
               type="color"
               value={(value || "").length === 7 ? value : ((value || "").length > 7 ? (value||"").substring(0,7) : "#ffffff")}
               onChange={(e) => onChange(e.target.value)}
               className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer opacity-0"
             />
          </div>
        )}
      </div>
    </div>
  );
};

/** Longest edge of an uploaded wallpaper after downscaling (fits 1440p screens, keeps storage small). */
const MAX_UPLOAD_EDGE = 2560;
const UPLOAD_QUALITY = 0.85;

/**
 * Downscale an image file and return it as a JPEG data URL, so it fits in
 * chrome.storage.local (10MB quota) instead of silently failing to save.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function fileToWallpaperDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', UPLOAD_QUALITY);
  } finally {
    bitmap.close();
  }
}

export function WallpaperPanel({ isOpen, onClose, current, onSelect, theme, effectiveAccent, onThemeUpdate }) {
  // Functional updates so a write from the auto-accent picker is never overwritten.
  const setTheme = (patch) => onThemeUpdate((prev) => ({ ...(prev || {}), ...patch }));
  const [activeTab, setActiveTab] = useState('backgrounds');
  const [uploadState, setUploadState] = useState({ busy: false, error: '' });
  const fileInputRef = useRef(null);

  const filtered = WALLPAPERS;

  const handleFileUpload = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadState({ busy: false, error: 'Please choose an image file.' });
      return;
    }
    setUploadState({ busy: true, error: '' });
    try {
      const dataUrl = await fileToWallpaperDataUrl(file);
      onSelect(dataUrl);
      setUploadState({ busy: false, error: '' });
    } catch (err) {
      console.error('[wallpaper] Upload failed', err);
      setUploadState({ busy: false, error: 'Could not read that image. Try a JPG or PNG.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="side-panel" role="dialog" aria-label="Appearance">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h3 className="text-xl font-bold">Appearance</h3>
        <button onClick={onClose} aria-label="Close appearance" className="text-white/50 hover:text-white"><X size={24} /></button>
      </div>

      <div className="flex bg-white/5 p-1 rounded-xl mb-6 flex-shrink-0">
        <button
          onClick={() => setActiveTab('backgrounds')}
          className={`flex-1 py-2 flex items-center justify-center gap-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'backgrounds' ? 'bg-[var(--color-tab-bg)] text-white' : 'text-white/40 hover:text-white'}`}
        >
          <ImageIcon size={14} /> Backgrounds
        </button>
        <button
          onClick={() => setActiveTab('theme')}
          className={`flex-1 py-2 flex items-center justify-center gap-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'theme' ? 'bg-[var(--color-tab-bg)] text-white' : 'text-white/40 hover:text-white'}`}
        >
          <Palette size={14} /> Theme
        </button>
      </div>

      {activeTab === 'backgrounds' && (
        <>
          <div className="grid grid-cols-2 gap-4 overflow-y-auto pr-2 mb-6 custom-scroll flex-1">
            {filtered.map(wp => {
              const path = `wallpapers/${wp.file}`;
              const isActive = current === path;
              return (
                <button
                  key={wp.file}
                  onClick={() => onSelect(path)}
                  aria-pressed={isActive}
                  aria-label={wp.name}
                  style={{ backgroundImage: `url(${path})` }}
                  className={`aspect-video bg-cover bg-center rounded-xl border-2 transition-all hover:scale-105 active:scale-95 ${isActive ? 'border-[var(--color-accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]' : 'border-transparent'}`}
                  title={wp.name}
                />
              );
            })}
          </div>
          {uploadState.error && (
            <p className="text-xs text-red-400 mb-2 flex-shrink-0" role="alert">{uploadState.error}</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState.busy}
            className="group flex items-center justify-center gap-2 w-full py-3 tall:py-4 disabled:opacity-50 disabled:pointer-events-none border-2 border-dashed border-white/10 rounded-2xl text-white/40 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 hover:border-[var(--color-accent)]/50 transition-all duration-300 font-bold text-sm flex-shrink-0"
          >
            <Upload size={18} className="group-hover:-translate-y-1 transition-transform duration-300" />
            {uploadState.busy ? 'Processing…' : 'Upload Image'}
          </button>
        </>
      )}

      {activeTab === 'theme' && theme && (
        <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scroll flex-1 min-h-0">
          <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-7 h-7 rounded-full border-2 border-white/20 shrink-0 transition-colors duration-500"
                  style={{ backgroundColor: effectiveAccent }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                    <Wand2 size={12} /> Match Wallpaper
                  </span>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Pick the accent colour from the current wallpaper automatically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!theme.autoAccent}
                aria-label="Match accent colour to wallpaper"
                onClick={() => setTheme({ autoAccent: !theme.autoAccent })}
                className={`w-12 h-6 shrink-0 rounded-full p-1 cursor-pointer transition-all ${theme.autoAccent ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-tab-bg)]'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${theme.autoAccent ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
          <div className={theme.autoAccent ? 'opacity-40 pointer-events-none' : ''} aria-disabled={!!theme.autoAccent}>
            <FancyColorPicker
              label={theme.autoAccent ? 'Accent Color (turn off Match Wallpaper to edit)' : 'Accent Color'}
              value={theme.accent}
              onChange={(v) => setTheme({ accent: v })}
            />
          </div>
          <FancyColorPicker 
            label="Board Text Color" 
            value={theme.boardText} 
            onChange={(v) => setTheme({ boardText: v })} 
            presets={['#ffffff', '#f1f2f6', '#a4b0be', '#2f3542', '#00d2ff', '#ff2a5f']}
          />
          <FancyColorPicker 
            label="Tab Background Color" 
            value={theme.tabBg} 
            onChange={(v) => setTheme({ tabBg: v })} 
            presets={['rgba(255, 255, 255, 0.1)', 'rgba(0, 0, 0, 0.3)', 'transparent', '#0f0a1e', '#ffffff']}
            allowAlpha={true}
          />
          <FancyColorPicker 
            label="Tab Text Color" 
            value={theme.tabText} 
            onChange={(v) => setTheme({ tabText: v })} 
            presets={['rgba(255, 255, 255, 0.6)', '#ffffff', '#a4b0be', '#2f3542', '#00d2ff']}
            allowAlpha={true}
          />
          
          <div className="mt-4 tall:mt-8">
            <button
              onClick={() => setTheme({
                accent: "#00d2ff",
                boardText: "#ffffff",
                tabBg: "rgba(255, 255, 255, 0.1)",
                tabText: "rgba(255, 255, 255, 0.6)",
                autoAccent: false,
              })}
              className="flex items-center justify-center gap-2 w-full py-3 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all font-bold text-sm"
            >
              <RotateCcw size={16} /> Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
