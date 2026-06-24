import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from '@/app/prompts/system';

const URL_REGEX = /https?:\/\/[^\s,;)\]}'"]+/g;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const html = await res.text();
    const text = stripHtml(html);
    return text ? `\nContent from ${url}:\n${text}` : '';
  } catch {
    return '';
  }
}

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = process.env.AI_KNOWLEDGE_BASE_TOKEN;

  if (!baseUrl || !token) {
    cachedSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    return cachedSystemPrompt;
  }

  const url = `${baseUrl}/api/v1/ai_prompt?ai_type=Lotte&token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Knowledge base API returned ${response.status}`);
    }
    const data = await response.json();
    let prompt = data.content ?? data.prompt ?? data.system_prompt ?? JSON.stringify(data);
    if (typeof prompt !== 'string' || !prompt) {
      throw new Error('No valid prompt string in response');
    }

    const urls = [...new Set<string>((prompt.match(URL_REGEX) || []).map(u => u.replace(/[.,;:!?]+$/, '')))];
    if (urls.length > 0) {
      const results = await Promise.allSettled(urls.map(fetchUrlContent));
      const context = results.map(r => r.status === 'fulfilled' ? r.value : '').filter(Boolean).join('\n');
      if (context) {
        prompt += '\n\n## Referenced Content\n' + context;
      }
    }

    cachedSystemPrompt = prompt;
  } catch {
    cachedSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  }
  return cachedSystemPrompt;
}

export async function GET() {
  try {
    const prompt = await getSystemPrompt();
    return NextResponse.json({ prompt });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch system prompt' },
      { status: 500 }
    );
  }
}
