import { NextResponse } from 'next/server';

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
  clinicContext?: string;
};

const DEFAULT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1-mini';

function sanitizeAssistantReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && /^(noted|note|summary|observation)\s*:/i.test(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }

  return trimmed;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY in environment.' },
        { status: 500 },
      );
    }

    const body = (await request.json()) as ChatRequestBody;
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const clinicContext = typeof body.clinicContext === 'string' ? body.clinicContext : '';

    const messages = incomingMessages
      .filter((message) => message && (message.role === 'assistant' || message.role === 'user'))
      .map((message) => ({
        role: message.role,
        content: String(message.content ?? '').trim(),
      }))
      .filter((message) => message.content.length > 0)
      .slice(-20);

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No chat messages provided.' }, { status: 400 });
    }

    const systemPrompt = [
      'You are helping a dental clinic configure an AI receptionist.',
      'Respond in a natural conversational style.',
      'Do not include meta commentary, labels, or analysis prefixes.',
      'Never start with phrases like "Noted:", "Summary:", "Observation:", or "User said:".',
      'Ask for missing operational details when useful.',
      'Keep responses practical and short (2-5 sentences).',
      clinicContext ? `Clinic context snapshot:\n${clinicContext}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        `OpenAI request failed with status ${response.status}.`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const reply = sanitizeAssistantReply(String(payload?.choices?.[0]?.message?.content ?? ''));
    if (!reply) {
      return NextResponse.json(
        { error: 'The AI returned an empty response. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach AI service right now. Please try again.' },
      { status: 500 },
    );
  }
}
