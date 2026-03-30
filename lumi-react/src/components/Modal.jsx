import React from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, title, children, onSubmit, hideButtons }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md" 
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        aria-label="Close modal"
      />
      <div className="bg-[#151515] border border-white/10 rounded-[24px] p-8 w-full max-w-[400px] relative z-10 shadow-2xl scale-in duration-300">
        <h3 className="text-xl font-bold mb-6 text-white">{title}</h3>
        
        <div className="mb-8">
          {children}
        </div>

        {!hideButtons && (
          <div className="flex justify-end gap-4">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-white/50 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={onSubmit}
              className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-bold hover:scale-105 active:scale-95 transition-all"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
