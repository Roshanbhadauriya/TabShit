import React, { useState, useRef } from 'react';
import { X, Upload, Palette, Image as ImageIcon, RotateCcw } from 'lucide-react';

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
    <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white-[0.07] transition-colors">
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

export function WallpaperPanel({ isOpen, onClose, current, onSelect, theme, onThemeUpdate }) {
  const [activeTab, setActiveTab] = useState('backgrounds');
  const fileInputRef = useRef(null);

  const filtered = WALLPAPERS;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      onSelect(event.target.result); // data URL
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed top-10 bottom-32 right-10 w-[380px] bg-[#0f0f0f] border border-white/10 rounded-[24px] p-8 z-[200] flex flex-col shadow-2xl transition-all duration-500 transform ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h3 className="text-xl font-bold">Appearance</h3>
        <button onClick={onClose} className="text-white/50 hover:text-white"><X size={24} /></button>
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
                  style={{ backgroundImage: `url(${path})` }}
                  className={`aspect-video bg-cover bg-center rounded-xl border-2 transition-all hover:scale-105 active:scale-95 ${isActive ? 'border-[var(--color-accent)] shadow-[0_0_15px_rgba(0,210,255,0.4)]' : 'border-transparent'}`}
                  title={wp.name}
                />
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="group flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-white/10 rounded-2xl text-white/40 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 hover:border-[var(--color-accent)]/50 transition-all duration-300 font-bold text-sm flex-shrink-0"
          >
            <Upload size={18} className="group-hover:-translate-y-1 transition-transform duration-300" />
            Upload Image
          </button>
        </>
      )}

      {activeTab === 'theme' && theme && (
        <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scroll flex-1">
          <FancyColorPicker 
            label="Accent Color" 
            value={theme.accent} 
            onChange={(v) => onThemeUpdate({...theme, accent: v})} 
          />
          <FancyColorPicker 
            label="Board Text Color" 
            value={theme.boardText} 
            onChange={(v) => onThemeUpdate({...theme, boardText: v})} 
            presets={['#ffffff', '#f1f2f6', '#a4b0be', '#2f3542', '#00d2ff', '#ff2a5f']}
          />
          <FancyColorPicker 
            label="Tab Background Color" 
            value={theme.tabBg} 
            onChange={(v) => onThemeUpdate({...theme, tabBg: v})} 
            presets={['rgba(255, 255, 255, 0.1)', 'rgba(0, 0, 0, 0.3)', 'transparent', '#0f0a1e', '#ffffff']}
            allowAlpha={true}
          />
          <FancyColorPicker 
            label="Tab Text Color" 
            value={theme.tabText} 
            onChange={(v) => onThemeUpdate({...theme, tabText: v})} 
            presets={['rgba(255, 255, 255, 0.6)', '#ffffff', '#a4b0be', '#2f3542', '#00d2ff']}
            allowAlpha={true}
          />
          
          <div className="mt-8">
            <button 
              onClick={() => onThemeUpdate({
                accent: "#00d2ff",
                boardText: "#ffffff",
                tabBg: "rgba(255, 255, 255, 0.1)",
                tabText: "rgba(255, 255, 255, 0.6)",
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
