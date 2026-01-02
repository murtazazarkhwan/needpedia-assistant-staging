'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '@/types/chat';

interface ChatProps {
  conversationId?: string;
  onConversationChange?: (conversationId: string, title: string, lastMessage: string) => void;
  noBorder?: boolean;
  userId?: string | null;
}

// Helper function to filter out reasoning/thinking content
const filterReasoning = (content: string): string => {
  if (!content) return content;

  // If there's a stray closing </think>, drop everything before it (inclusive)
  // This ensures we only keep the visible answer after hidden reasoning
  const closingThinkIdx = content.toLowerCase().indexOf('</think>');
  if (closingThinkIdx !== -1) {
    content = content.slice(closingThinkIdx + '</think>'.length);
  }

  // Remove content within <think>...</think> blocks (case-insensitive, multiline)
  let filtered = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove other common reasoning patterns
  filtered = filtered.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  filtered = filtered.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');

  // Remove content between <!-- think --> and <!-- /think --> (comment-based thinking)
  filtered = filtered.replace(/<!--\s*think\s*-->[\s\S]*?<!--\s*\/think\s*-->/gi, '');

  // Remove lines that are entirely reasoning content (common in some models)
  filtered = filtered.split('\n').filter(line => {
    const lowerLine = line.toLowerCase().trim();
    return !lowerLine.startsWith('thinking:') &&
      !lowerLine.startsWith('[reasoning') &&
      !lowerLine.startsWith('internal:') &&
      !lowerLine.includes('[thinking]');
  }).join('\n');

  // Clean up multiple consecutive newlines (max 2)
  filtered = filtered.replace(/\n{3,}/g, '\n\n');

  // Clean up any extra whitespace at start/end
  return filtered.trim();
};

// Remove OpenRouter tool-call scaffolding and other autop-run noise
const stripToolCallArtifacts = (content: string): string => {
  if (!content) return content;
  let cleaned = content;

  const fancyToolBlock = /<\uFF5Ctool[^>\uFF5C]*?(?:begin|start)\uFF5C>[\s\S]*?<\uFF5Ctool[^>\uFF5C]*?end\uFF5C>/gi;
  const asciiToolBlock = /<\|tool[^>|]*?(?:begin|start)\|>[\s\S]*?<\|tool[^>|]*?end\|>/gi;
  cleaned = cleaned.replace(fancyToolBlock, '');
  cleaned = cleaned.replace(asciiToolBlock, '');

  const genericToolTags = /<[|\uFF5C][^>]+[|\uFF5C]>/g;
  cleaned = cleaned.replace(genericToolTags, '');

  // Remove stray "json" blocks that are just tool arguments
  cleaned = cleaned.replace(/\bjson\b\s*(?:\n|\r\n)\s*\{[\s\S]*?\}\s*(?=(\n|\r\n|$))/gi, '');

  // Collapse consecutive blank lines to keep spacing tidy
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
};

// Helper function to convert URLs in text to clickable links
const linkify = (content: string): React.ReactNode => {
  if (!content) return content;

  // URL regex pattern - matches http, https, and other URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(content)) !== null) {
    // Add text before URL
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    // Add clickable link
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );

    lastIndex = urlRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts.length > 0 ? parts : content;
};

// Ensure we always have some visible assistant content
const ensureVisibleContent = (raw: string): string => {
  const initial = stripToolCallArtifacts(raw || '');
  const filtered = filterReasoning(initial);
  if (filtered && filtered.trim().length > 0) return filtered;
  // Fallback: strip any XML-like tags and return text
  const stripped = initial.replace(/<[^>]+>/g, '').trim();
  return stripped;
};

const getReasoningContent = (message: Message): string => {
  const extendedMessage = message as Message & { reasoning?: string };
  return typeof extendedMessage.reasoning === 'string' ? extendedMessage.reasoning : '';
};

const applyBasicInlineFormatting = (text: string, keyPrefix: string): React.ReactNode[] => {
  if (!text) return [];
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  const nodes: React.ReactNode[] = [];
  tokens.forEach((token, idx) => {
    if (!token) return;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      const linked = linkify(inner);
      nodes.push(
        <strong key={`${keyPrefix}-b-${idx}`}>{linked}</strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      const inner = token.slice(1, -1);
      const linked = linkify(inner);
      nodes.push(
        <em key={`${keyPrefix}-i-${idx}`}>{linked}</em>
      );
    } else {
      const linked = linkify(token);
      if (Array.isArray(linked)) {
        linked.forEach((n, i) => nodes.push(<React.Fragment key={`${keyPrefix}-t-${idx}-${i}`}>{n}</React.Fragment>));
      } else {
        nodes.push(<React.Fragment key={`${keyPrefix}-t-${idx}`}>{linked}</React.Fragment>);
      }
    }
  });
  return nodes;
};

// Apply inline markdown formatting (bold, italic, links) and linkify bare URLs
const applyInlineFormatting = (text: string): React.ReactNode[] => {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let linkIndex = 0;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const segment = text.slice(lastIndex, match.index);
      nodes.push(...applyBasicInlineFormatting(segment, `seg-${lastIndex}`));
    }

    const label = match[1];
    const url = match[2];
    nodes.push(
      <a
        key={`md-link-${linkIndex++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {applyBasicInlineFormatting(label, `link-label-${linkIndex}`)}
      </a>
    );

    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(...applyBasicInlineFormatting(text.slice(lastIndex), `tail-${lastIndex}`));
  }

  return nodes;
};

// Render basic Markdown blocks: headings, lists, and paragraphs
const renderMessageContent = (raw: string): React.ReactNode => {
  const content = raw || '';
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul className="list-disc pl-5 my-2" key={`ul-${elements.length}`}>
          {listBuffer.map((item, i) => (
            <li key={`li-${elements.length}-${i}`} className="my-1">{applyInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trimEnd();
    if (/^\s*$/.test(trimmed)) {
      flushList();
      return;
    }

    // Headings
    const h3 = /^###\s+(.+)/.exec(trimmed);
    if (h3) { flushList(); elements.push(<h3 key={`h3-${elements.length}`} className="text-base font-semibold mt-3">{applyInlineFormatting(h3[1])}</h3>); return; }
    const h2 = /^##\s+(.+)/.exec(trimmed);
    if (h2) { flushList(); elements.push(<h2 key={`h2-${elements.length}`} className="text-lg font-semibold mt-4">{applyInlineFormatting(h2[1])}</h2>); return; }
    const h1 = /^#\s+(.+)/.exec(trimmed);
    if (h1) { flushList(); elements.push(<h1 key={`h1-${elements.length}`} className="text-xl font-bold mt-5">{applyInlineFormatting(h1[1])}</h1>); return; }

    // Unordered list item
    const li = /^[-*]\s+(.+)/.exec(trimmed);
    if (li) {
      listBuffer.push(li[1]);
      return;
    }

    // Paragraph
    flushList();
    elements.push(<p key={`p-${elements.length}`} className="my-2">{applyInlineFormatting(trimmed)}</p>);
  });

  flushList();
  return elements.length > 0 ? elements : applyInlineFormatting(content);
};

interface PersistedMessagePayload {
  role: Message['role'];
  content: string;
  metadata?: Record<string, unknown>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// AI mode display names are configured via env so they can be tweaked
// without code changes.
const DEFAULT_AI_MODE_NAME =
  process.env.NEXT_PUBLIC_AI_MODE_DEFAULT_NAME || 'Full Lotte';
const ECO_AI_MODE_NAME =
  process.env.NEXT_PUBLIC_AI_MODE_ECO_NAME || 'Eco (Open Source)';

const buildPreviewText = (text: string, maxLength: number): string => {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const persistChatThread = async (
  threadId: string,
  token: string,
  title?: string,
  lastMessage?: string
) => {
  if (!threadId || !token) return;

  const chatThreadPayload: Record<string, string> = {
    thread_id: threadId,
  };

  if (title) {
    chatThreadPayload.title = title;
  }

  if (lastMessage) {
    chatThreadPayload.last_message = lastMessage;
  }

  const body: Record<string, unknown> = {
    chat_thread: chatThreadPayload,
    thread_id: threadId,
  };

  try {
    await fetch(`${API_BASE_URL}/api/v1/chat_threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Ignore persistence failures
  }
};

const persistChatMessages = async (
  threadId: string,
  token: string,
  messages: PersistedMessagePayload[],
  title?: string,
  lastMessage?: string
) => {
  if (!threadId || !token || messages.length === 0) return;

  const body: Record<string, unknown> = {
    thread_id: threadId,
    messages,
  };

  if (title) {
    body.title = title;
  }

  if (lastMessage) {
    body.last_message = lastMessage;
  }

  try {
    await fetch(`${API_BASE_URL}/api/v1/chat_messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Ignore persistence failures
  }
};

export default function Chat({ conversationId, onConversationChange, noBorder = false, userId }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiMode, setAiMode] = useState<'default' | 'eco'>('default');
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Set a maximum height to prevent the textarea from becoming too large
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const loadConversationHistory = useCallback(async (id: string) => {
    try {
      const response = await fetch('/api/chat/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId: id, userToken: userId || undefined }),
      });

      if (response.ok) {
        const data = (await response.json()) as { messages?: Message[] };
        // Filter out thinking/reasoning content from all assistant messages
        const filteredMessages = (data.messages ?? []).map((msg: Message) => {
          if (msg.role !== 'assistant') return msg;
          const rawContent = msg.content || getReasoningContent(msg);
          return { ...msg, content: ensureVisibleContent(rawContent) };
        });

        setMessages(filteredMessages);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [userId]);

  // Reset messages when conversation changes
  useEffect(() => {
    if (conversationId !== currentConversationId) {
      if (conversationId) {
        // Load conversation history from server
        loadConversationHistory(conversationId);
      } else {
        // New conversation - clear messages
        setMessages([]);
      }
      setCurrentConversationId(conversationId);
    }
  }, [conversationId, currentConversationId, loadConversationHistory]);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    try {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch {
      // No-op if scrolling fails
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (userMessage: Message) => {
    setError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [userMessage],
          conversationId: currentConversationId,
          userToken: userId || undefined,
          aiMode,
        }),
      });

      const data = (await response.json()) as {
        choices: Array<{ message: Message & { reasoning?: string } }>;
        conversationId?: string;
        usedTokens?: number;
        error?: string | { message?: string };
      };

      if (!response.ok) {
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : data.error?.message || JSON.stringify(data.error) || 'Failed to send message';
        throw new Error(errorMessage);
      }

      let assistantMessage = data.choices[0].message as Message & { reasoning?: string };

      // Normalize assistant content: fall back to reasoning if content is empty
      if (assistantMessage?.role === 'assistant') {
        const rawContent = assistantMessage.content || getReasoningContent(assistantMessage);
        assistantMessage = {
          ...assistantMessage,
          content: ensureVisibleContent(rawContent)
        };
      }

      const assistantVisibleContent = assistantMessage?.content || '';
      const sidebarTitle = buildPreviewText(userMessage.content, 50);
      const sidebarLastMessage = buildPreviewText(assistantVisibleContent, 100);
      const threadTitle = buildPreviewText(userMessage.content, 80);
      const threadLastMessage = buildPreviewText(assistantVisibleContent, 160);
      const persistedMessages: PersistedMessagePayload[] = [
        { role: userMessage.role, content: userMessage.content }
      ];

      if (assistantMessage) {
        const assistantPayload: PersistedMessagePayload = {
          role: assistantMessage.role,
          content: assistantVisibleContent
        };

        if (data?.choices?.[0]?.message) {
          assistantPayload.metadata = { raw: data.choices[0].message };
        }

        persistedMessages.push(assistantPayload);
      }

      // Append only the assistant message because the user message was optimistically added
      if (assistantMessage) {
        // Extract only the standard message properties to avoid type conflicts
        const cleanAssistantMessage: Message = {
          role: assistantMessage.role,
          content: assistantMessage.content,
          function_call: assistantMessage.function_call,
          tool_calls: assistantMessage.tool_calls,
          tool_call_id: assistantMessage.tool_call_id,
          name: assistantMessage.name
        };
        setMessages(prev => [...prev, cleanAssistantMessage]);
      }

      // Notify sidebar about token usage to update HP bar immediately
      try {
        const used = Number(data.usedTokens || 0);
        if (!isNaN(used) && used > 0) {
          window.dispatchEvent(new CustomEvent('np_tokens_used', { detail: { used } }));
        }
      } catch { }

      // Update conversation ID if it's new
      if (data.conversationId && data.conversationId !== currentConversationId) {
        setCurrentConversationId(data.conversationId);
      }

      if (data.conversationId && userId) {
        void persistChatThread(data.conversationId, userId, threadTitle, threadLastMessage);
        void persistChatMessages(data.conversationId, userId, persistedMessages, threadTitle, threadLastMessage);
      }

      // Always notify parent component about conversation update
      if (onConversationChange && data.conversationId) {
        const title = sidebarTitle || userMessage.content;
        const filteredContent = assistantVisibleContent;
        const lastMessage = sidebarLastMessage || filteredContent;
        onConversationChange(data.conversationId, title, lastMessage);
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setError(message);
    }
  }, [currentConversationId, onConversationChange, userId, aiMode]);

  const handleSubmit = useCallback(async (e?: React.FormEvent | KeyboardEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
    };

    setInput('');
    setIsLoading(true);
    try {
      // Optimistically render the user's message immediately
      setMessages(prev => [...prev, userMessage]);
      await sendMessage(userMessage);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sendMessage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to send message
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(e);
      }
      // Escape to clear input
      if (e.key === 'Escape') {
        setInput('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${noBorder ? '' : 'rounded-lg shadow-xl border border-gray-200'}`}>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 max-w-md mx-auto py-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            </div>
            <p className="text-xl font-semibold text-gray-800 mb-2 flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Welcome to Needpedia!
            </p>
            <p className="text-gray-600 mb-6">I&apos;m Lotte, your AI librarian. I can help you create ideas, browse content, and navigate Needpedia.</p>
            <p className="text-sm font-medium text-gray-700 mb-4 flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Try asking me to:
            </p>
            <ul className="space-y-3">
              <li className="flex items-start justify-start gap-3 text-left">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-gray-700">Create a new idea about bike lanes</span>
              </li>
              <li className="flex items-start justify-start gap-3 text-left">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-gray-700">Search for existing ideas about climate change</span>
              </li>
              <li className="flex items-start justify-start gap-3 text-left">
                <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-gray-700">Help you navigate subjects and problems</span>
              </li>
            </ul>
          </div>
        )}
        <div className="space-y-4 pb-16">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 fade-in duration-300`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div
                className={`relative p-3 sm:p-4 rounded-2xl shadow-sm max-w-[90%] sm:max-w-[85%] break-words transition-all duration-200 hover:shadow-md ${message.role === 'user'
                  ? 'bg-black text-white hover:bg-gray-900'
                  : 'bg-white text-gray-800 border border-gray-200 hover:border-gray-300'
                  }`}
                style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                <div className="text-xs sm:text-sm opacity-75 mb-1 sm:mb-2 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {message.role === 'user' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      // Robot icon for assistant/system
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4V2m-6 9H4m16 0h-2M7 10h10a2 2 0 012 2v4a4 4 0 01-4 4H9a4 4 0 01-4-4v-4a2 2 0 012-2zm2 4h6m-7 3h8M9 7a3 3 0 106 0 3 3 0 00-6 0z" />
                      </svg>
                    )}
                    <span>{message.role === 'user' ? 'You' : 'Lotte'}</span>
                  </div>
                  <span className="text-xs opacity-50 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span suppressHydrationWarning>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>
                <div className={`prose prose-sm max-w-none break-words overflow-wrap-anywhere whitespace-pre-wrap leading-relaxed text-sm sm:text-base ${message.role === 'user' ? 'prose-invert' : ''}`}>
                  {renderMessageContent(message.content)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {isLoading && (
          <div className="flex justify-start animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="relative p-3 sm:p-4 rounded-2xl shadow-sm bg-white border border-gray-200 max-w-[90%] sm:max-w-[85%] text-gray-800">
              <div className="text-xs sm:text-sm opacity-75 mb-2 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>Lotte</span>
                <span className="text-xs opacity-50 flex items-center gap-1" aria-live="polite" aria-label="Assistant is typing">
                  <svg className="w-3 h-3 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-gray-700 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-gray-700 animate-bounce delay-100"></div>
                <div className="w-2 h-2 rounded-full bg-gray-700 animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-white p-3 sm:p-4 rounded-b-lg">
        {error && (
          <div className="mb-3 p-3 text-sm text-red-700 bg-red-50 rounded-lg flex items-center gap-2 border border-red-100">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 sm:gap-3 bg-gray-50 border border-gray-200 rounded-xl p-2 sm:p-3 shadow-sm hover:shadow-md transition-shadow">
            {/* Center input field */}
            <div className="flex-1 relative min-w-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="How can I help you today?"
                className="w-full pl-3 pr-10 py-2.5 bg-transparent border-none focus:outline-none resize-none text-gray-800 placeholder-gray-500 text-sm sm:text-base overflow-y-auto"
                disabled={isLoading}
                autoComplete="off"
                spellCheck="true"
                rows={1}
                style={{ maxHeight: '120px', minHeight: '40px' }}
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput('')}
                  className="absolute right-6 top-2 p-1.5 bg-gray-200/80 hover:bg-gray-300 rounded-full transition-all duration-200 hover:scale-110 group"
                  title="Clear input"
                >
                  <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Divider - hidden on mobile */}
            <div className="hidden sm:block h-8 w-px bg-gray-300 flex-shrink-0"></div>

            {/* Right side: AI mode selector - custom dropdown (now responsive for all screens) */}
            <div className="relative flex-shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="appearance-none bg-white border border-gray-300 rounded-lg py-2 pl-3 pr-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:bg-gray-50 whitespace-nowrap flex items-center gap-1 sm:gap-2 h-10"
                title="Select AI mode"
              >
                <span className="hidden sm:inline">{aiMode === 'default' ? DEFAULT_AI_MODE_NAME : ECO_AI_MODE_NAME}</span>
                <span className="sm:hidden">
                  {aiMode === 'default' ? 'Full' : 'Eco'}
                </span>
                <svg
                  className={`h-3 w-3 sm:h-4 sm:w-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown menu - opens upward to avoid being cut off */}
              {isDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-56 sm:w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2 max-h-[60vh] overflow-y-auto">
                  {/* Default AI Mode Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setAiMode('default');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-gray-50 transition-colors flex items-start justify-between group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-xs sm:text-sm mb-0.5 truncate">{DEFAULT_AI_MODE_NAME}</div>
                      <div className="text-xs text-gray-500">Best for everyday tasks</div>
                    </div>
                    {aiMode === 'default' && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0 mt-0.5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Eco AI Mode Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setAiMode('eco');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-gray-50 transition-colors flex items-start justify-between group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-xs sm:text-sm mb-0.5 truncate">{ECO_AI_MODE_NAME}</div>
                      <div className="text-xs text-gray-500">Fastest for quick answers</div>
                    </div>
                    {aiMode === 'eco' && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0 mt-0.5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0 h-10 w-10"
              title="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}