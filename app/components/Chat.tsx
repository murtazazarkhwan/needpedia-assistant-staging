'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '@/types/chat';
import MessageBubble from './MessageBubble';
import WelcomeScreen from './WelcomeScreen';
import InputArea from './InputArea';

interface ChatProps {
  conversationId?: string;
  onConversationChange?: (conversationId: string, title: string, lastMessage: string) => void;
  onNewChat?: () => void;
  noBorder?: boolean;
  userId?: string | null;
  postId?: string | null;
  postTitle?: string | null;
}

// Helper: filter reasoning/thinking content from assistant responses
const filterReasoning = (content: string): string => {
  if (!content) return content;
  const closingIdx = content.toLowerCase().indexOf('</think>');
  if (closingIdx !== -1) content = content.slice(closingIdx + '</think>'.length);
  let filtered = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  filtered = filtered.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  filtered = filtered.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  filtered = filtered.replace(/<!--\s*think\s*-->[\s\S]*?<!--\s*\/think\s*-->/gi, '');
  filtered = filtered.split('\n').filter(line => {
    const l = line.toLowerCase().trim();
    return !l.startsWith('thinking:') && !l.startsWith('[reasoning') && !l.startsWith('internal:') && !l.includes('[thinking]');
  }).join('\n');
  return filtered.replace(/\n{3,}/g, '\n\n').trim();
};

const stripToolCallArtifacts = (content: string): string => {
  if (!content) return content;
  let c = content;
  c = c.replace(/<\uFF5Ctool[^>\uFF5C]*?(?:begin|start)\uFF5C>[\s\S]*?<\uFF5Ctool[^>\uFF5C]*?end\uFF5C>/gi, '');
  c = c.replace(/<\|tool[^>|]*?(?:begin|start)\|>[\s\S]*?<\|tool[^>|]*?end\|>/gi, '');
  c = c.replace(/<[|\uFF5C][^>]+[|\uFF5C]>/g, '');
  c = c.replace(/\bjson\b\s*(?:\n|\r\n)\s*\{[\s\S]*?\}\s*(?=(\n|\r\n|$))/gi, '');
  return c.replace(/\n{3,}/g, '\n\n').trim();
};

const ensureVisibleContent = (raw: string): string => {
  const initial = stripToolCallArtifacts(raw || '');
  const filtered = filterReasoning(initial);
  if (filtered && filtered.trim().length > 0) return filtered;
  return initial.replace(/<[^>]+>/g, '').trim();
};

const getReasoningContent = (message: Message): string => {
  const ext = message as Message & { reasoning?: string };
  return typeof ext.reasoning === 'string' ? ext.reasoning : '';
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
const DEFAULT_AI_MODE_NAME = process.env.NEXT_PUBLIC_AI_MODE_DEFAULT_NAME || 'Full Lotte';
const ECO_AI_MODE_NAME = process.env.NEXT_PUBLIC_AI_MODE_ECO_NAME || 'Eco (Open Source)';

const buildPreviewText = (text: string, max: number): string => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

interface PersistedPayload { role: Message['role']; content: string; metadata?: Record<string, unknown> }

const persistThread = async (threadId: string, token: string, title?: string, lastMessage?: string) => {
  if (!threadId || !token) return;
  const body: Record<string, string> = { thread_id: threadId, assistant_name: 'Needpedia Assistant' };
  if (title) body.title = title;
  if (lastMessage) body.last_message = lastMessage;
  try {
    await fetch(`${API_BASE_URL}/api/v1/chat_threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ chat_thread: body, thread_id: threadId }),
    });
  } catch { /* ignore */ }
};

const persistMessages = async (threadId: string, token: string, messages: PersistedPayload[], title?: string, lastMessage?: string) => {
  if (!threadId || !token || messages.length === 0) return;
  const body: Record<string, unknown> = { thread_id: threadId, assistant_name: 'Needpedia Assistant', messages };
  if (title) body.title = title;
  if (lastMessage) body.last_message = lastMessage;
  try {
    await fetch(`${API_BASE_URL}/api/v1/chat_messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify(body),
    });
  } catch { /* ignore */ }
};

export default function Chat({ conversationId, onConversationChange, onNewChat, noBorder = false, userId, postId, postTitle }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState('');
  const [aiMode, setAiMode] = useState<'default' | 'eco'>('default');
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId);
  const [systemPrompt, setSystemPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click (kept for future use)
  useEffect(() => {}, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, streamingContent]);

  // Load conversation history
  const loadHistory = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, userToken: userId || undefined }),
      });
      if (res.ok) {
        const data = (await res.json()) as { messages?: Message[] };
        setMessages((data.messages ?? []).map(m =>
          m.role !== 'assistant' ? m : { ...m, content: ensureVisibleContent(m.content || getReasoningContent(m)) }
        ));
      } else {
        setMessages([]);
      }
    } catch { setMessages([]); }
  }, [userId]);

  // Reset on conversation change
  useEffect(() => {
    if (conversationId !== currentConversationId) {
      if (conversationId) loadHistory(conversationId);
      else setMessages([]);
      setCurrentConversationId(conversationId);
    }
  }, [conversationId, currentConversationId, loadHistory]);

  // Fetch system prompt
  useEffect(() => {
    fetch('/api/prompt')
      .then(r => r.json())
      .then(d => { if (d.prompt) setSystemPrompt(d.prompt); })
      .catch(() => {});
  }, []);

  // Send message with streaming
  const sendMessage = useCallback(async (userMessage: Message) => {
    setError('');
    setStreamingContent('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [userMessage],
          conversationId: currentConversationId,
          userToken: userId || undefined,
          aiMode,
          systemPrompt: systemPrompt || undefined,
          pageContext: postId ? { postId, postTitle } : undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('event: ')) continue;
          const eventType = trimmed.slice(7);
          const nextLine = lines[lines.indexOf(line) + 1];
          if (!nextLine?.startsWith('data: ')) continue;
          const payload = nextLine.slice(6);

          if (eventType === 'message') {
            try {
              const chunk = JSON.parse(payload) as { content?: string };
              if (chunk.content) {
                fullContent += chunk.content;
                setStreamingContent(fullContent);
              }
            } catch { /* skip */ }
          } else if (eventType === 'done') {
            try {
              const doneData = JSON.parse(payload) as { conversationId?: string; usedTokens?: number };
              const finalContent = ensureVisibleContent(fullContent);
              const assistantMsg: Message = { role: 'assistant', content: finalContent };
              setMessages(prev => [...prev, assistantMsg]);
              setStreamingContent('');

              // Notify parent if transform
              // (transforms go through non-streaming path, but handle just in case)

              // Update conversation
              if (doneData.conversationId && doneData.conversationId !== currentConversationId) {
                setCurrentConversationId(doneData.conversationId);
                if (userId) localStorage.setItem(`lotte_last_conversation_${userId}`, doneData.conversationId);
              }

              // Notify sidebar
              if (doneData.usedTokens && doneData.usedTokens > 0) {
                window.dispatchEvent(new CustomEvent('np_tokens_used', { detail: { used: doneData.usedTokens } }));
              }

              // Persist
              if (doneData.conversationId && userId) {
                const title = buildPreviewText(userMessage.content, 80);
                const last = buildPreviewText(finalContent, 160);
                void persistThread(doneData.conversationId, userId, title, last);
                void persistMessages(doneData.conversationId, userId, [
                  { role: 'user', content: userMessage.content },
                  { role: 'assistant', content: finalContent },
                ], title, last);
              }

              // Notify parent component
              if (onConversationChange && doneData.conversationId) {
                onConversationChange(doneData.conversationId, buildPreviewText(userMessage.content, 50), buildPreviewText(finalContent, 100));
              }
            } catch { /* skip */ }
          } else if (eventType === 'error') {
            try {
              const errData = JSON.parse(payload) as { error?: string };
              setError(errData.error || 'Stream error');
            } catch { setError('Stream error'); }
          }
        }
      }

      // If stream was empty, fall back
      if (!fullContent) {
        // Retry without streaming
        const fallbackRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [userMessage],
            conversationId: currentConversationId,
            userToken: userId || undefined,
            aiMode,
            systemPrompt: systemPrompt || undefined,
            pageContext: postId ? { postId, postTitle } : undefined,
          }),
        });
        const data = await fallbackRes.json() as {
          choices: Array<{ message: Message & { reasoning?: string } }>;
          conversationId?: string;
          usedTokens?: number;
          transformApplied?: { postId: string; newContent: string; transformType: string } | null;
        };

        if (!fallbackRes.ok) throw new Error(typeof (data as Record<string, unknown>).error === 'string' ? ((data as Record<string, unknown>).error as string) : 'Failed');

        let assistant = data.choices[0]?.message;
        if (assistant?.role === 'assistant') {
          const raw = assistant.content || getReasoningContent(assistant);
          assistant = { ...assistant, content: ensureVisibleContent(raw) };
        }

        if (data.transformApplied && typeof window !== 'undefined' && window.parent) {
          window.parent.postMessage({ type: 'page-transformed', ...data.transformApplied }, '*');
        }

        if (assistant) {
          setMessages(prev => [...prev, { role: assistant!.role, content: assistant!.content || '' }]);
        }

        if (data.usedTokens && data.usedTokens > 0) {
          window.dispatchEvent(new CustomEvent('np_tokens_used', { detail: { used: data.usedTokens } }));
        }

        if (data.conversationId && data.conversationId !== currentConversationId) {
          setCurrentConversationId(data.conversationId);
          if (userId) localStorage.setItem(`lotte_last_conversation_${userId}`, data.conversationId);
        }

        if (data.conversationId && userId) {
          const title = buildPreviewText(userMessage.content, 80);
          const last = buildPreviewText(assistant?.content || '', 160);
          void persistThread(data.conversationId, userId, title, last);
          void persistMessages(data.conversationId, userId, [
            { role: 'user', content: userMessage.content },
            { role: 'assistant', content: assistant?.content || '' },
          ], title, last);
        }

        if (onConversationChange && data.conversationId) {
          onConversationChange(data.conversationId, buildPreviewText(userMessage.content, 50), buildPreviewText(assistant?.content || '', 100));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setStreamingContent('');
    }
  }, [currentConversationId, onConversationChange, userId, aiMode, systemPrompt, postId, postTitle]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { role: 'user', content: input.trim() };
    setInput('');
    setIsLoading(true);
    try {
      setMessages(prev => [...prev, userMessage]);
      await sendMessage(userMessage);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sendMessage]);

  const handleSuggestion = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  return (
    <div className={`flex flex-col h-full bg-zinc-50 ${noBorder ? '' : 'rounded-xl border border-zinc-200'}`}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* New Conversation button */}
        {onNewChat && messages.length > 0 && (
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={onNewChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 hover:border-zinc-300 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Conversation
            </button>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !streamingContent && (
          <WelcomeScreen onSuggestionClick={handleSuggestion} />
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role as 'user' | 'assistant'} content={msg.content} />
        ))}

        {/* Streaming message */}
        {streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} isStreaming />
        )}

        {/* Loading indicator (only when no streaming yet) */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Input area */}
      <InputArea
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        aiMode={aiMode}
        onModeChange={setAiMode}
        defaultModeName={DEFAULT_AI_MODE_NAME}
        ecoModeName={ECO_AI_MODE_NAME}
      />
    </div>
  );
}
