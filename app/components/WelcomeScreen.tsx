'use client';

import React from 'react';

interface WelcomeScreenProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  { text: 'Create a new idea about bike lanes', color: 'text-emerald-500' },
  { text: 'Search for ideas about climate change', color: 'text-blue-500' },
  { text: 'Help me navigate subjects and problems', color: 'text-violet-500' },
  { text: 'Summarize the current page', color: 'text-amber-500' },
];

export default function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-1">Hi, I&apos;m Lotte</h2>
      <p className="text-sm text-zinc-500 mb-6 max-w-xs">
        Your AI librarian. Ask me anything, or try one of these:
      </p>
      <div className="grid gap-2 w-full max-w-sm">
        {suggestions.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onSuggestionClick?.(s.text)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 hover:shadow-sm transition-all duration-150"
          >
            <svg className={`w-4 h-4 ${s.color} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}
