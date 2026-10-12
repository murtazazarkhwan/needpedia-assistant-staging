import { NextResponse } from 'next/server';

let cachedMessage: string | null = null;
let cachedExpiry = 0;
const CACHE_TTL_MS = 60 * 1000;

async function fetchFirstMessage(): Promise<string | null> {
  if (cachedMessage !== null && Date.now() < cachedExpiry) return cachedMessage;

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = process.env.AI_KNOWLEDGE_BASE_TOKEN;

  if (!baseUrl || !token) {
    cachedExpiry = Date.now() + CACHE_TTL_MS;
    return null;
  }

  const url = `${baseUrl}/api/v1/ai_prompt?ai_type=LotteFirstTime&token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`ai_prompt returned ${response.status}`);
    const data = await response.json();
    const message = data.prompt ?? null;
    if (typeof message !== 'string' || !message.trim()) throw new Error('empty message');
    cachedMessage = message;
    cachedExpiry = Date.now() + CACHE_TTL_MS;
    return cachedMessage;
  } catch {
    cachedMessage = null;
    cachedExpiry = Date.now() + CACHE_TTL_MS;
    return null;
  }
}

export async function GET() {
  const message = await fetchFirstMessage();
  if (!message) {
    return NextResponse.json({ message: null }, { status: 200 });
  }
  return NextResponse.json({ message });
}
