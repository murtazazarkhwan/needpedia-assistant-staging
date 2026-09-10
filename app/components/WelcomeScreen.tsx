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
        <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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
