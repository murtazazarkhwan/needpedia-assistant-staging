'use client';

import React, { useState, useRef, useEffect } from 'react';

interface InputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  aiMode: 'default' | 'eco';
  onModeChange: (mode: 'default' | 'eco') => void;
  defaultModeName?: string;
  ecoModeName?: string;
}

export default function InputArea({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  aiMode,
  onModeChange,
  defaultModeName = 'Full Lotte',
  ecoModeName = 'Eco',
}: InputAreaProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Close dropdown on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isDropdownOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape') {
      onInputChange('');
    }
  };

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLoading && input.trim()) onSubmit();
        }}
      >
        <div className="flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-2 focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-200 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Lotte anything..."
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-zinc-800 placeholder-zinc-400 leading-relaxed py-1"
            disabled={isLoading}
            autoComplete="off"
            spellCheck
            rows={1}
            style={{ maxHeight: '160px', minHeight: '36px' }}
          />

          {/* AI mode selector */}
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap"
              title="Select AI mode"
            >
              {aiMode === 'default' ? defaultModeName : ecoModeName}
              <svg
                className={`inline-block w-3 h-3 ml-1 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-52 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 py-1">
                {[
                  { mode: 'default' as const, label: defaultModeName, desc: 'Best for everyday tasks' },
                  { mode: 'eco' as const, label: ecoModeName, desc: 'Fastest for quick answers' },
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => { onModeChange(opt.mode); setIsDropdownOpen(false); }}
                    className="w-full px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-800">{opt.label}</div>
                      <div className="text-xs text-zinc-500">{opt.desc}</div>
                    </div>
                    {aiMode === opt.mode && (
                      <svg className="w-4 h-4 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear input */}
          {input && (
            <button
              type="button"
              onClick={() => onInputChange('')}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors flex-shrink-0"
              title="Clear input"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Send button */}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </form>
      <p className="text-center text-[11px] text-zinc-400 mt-2">
        Ctrl+Enter to send · Esc to clear
      </p>
    </div>
  );
}
