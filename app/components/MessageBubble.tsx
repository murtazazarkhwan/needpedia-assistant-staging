'use client';

import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export default function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start gap-2.5 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div
          className={`rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed ${
            isUser
              ? 'bg-zinc-900 text-white rounded-br-md'
              : 'bg-white text-zinc-800 border border-zinc-200 rounded-bl-md shadow-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-zinc">
              <MarkdownRenderer content={content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-zinc-400 ml-0.5 animate-pulse" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
