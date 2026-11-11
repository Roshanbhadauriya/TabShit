import React, { useEffect } from 'react';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  hideButtons,
  confirmLabel = 'Confirm',
  danger = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="bg-[#151515] border border-white/10 rounded-[24px] p-6 md:p-8 w-full max-w-[400px] max-h-[calc(100vh-2rem)] overflow-y-auto custom-scroll relative z-10 shadow-2xl scale-in duration-300">
        <h3 className="text-xl font-bold mb-6 text-white">{title}</h3>

        <div className={hideButtons ? '' : 'mb-8'}>{children}</div>

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
              className={`px-6 py-2.5 rounded-xl text-sm font-bold hover:scale-105 active:scale-95 transition-all ${
                danger ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-white text-black'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
