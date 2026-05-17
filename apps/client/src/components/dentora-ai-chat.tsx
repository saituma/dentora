'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Check, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders, fetchCsrfToken } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Field metadata per onboarding step ──────────────────────────────────────

interface FieldMeta {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number';
  placeholder: string;
}

const STEP_FIELDS: Record<string, { fields: FieldMeta[]; nextStep: string }> = {
  'clinic-profile': {
    nextStep: 'knowledge-base',
    fields: [
      { key: 'clinicName', label: 'Clinic Name', type: 'text', placeholder: 'Smile Dental' },
      { key: 'address', label: 'Address', type: 'text', placeholder: '123 Main St' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555-0100' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'office@clinic.com' },
      { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'Europe/London' },
    ],
  },
  schedule: {
    nextStep: 'clinic-history',
    fields: [
      { key: 'defaultDuration', label: 'Appt Duration (min)', type: 'number', placeholder: '30' },
      { key: 'cancellationHours', label: 'Cancel Notice (hrs)', type: 'number', placeholder: '24' },
      { key: 'advanceBookingDays', label: 'Max Booking (days)', type: 'number', placeholder: '30' },
    ],
  },
  voice: {
    nextStep: 'phone-number',
    fields: [
      {
        key: 'greeting',
        label: 'Greeting Message',
        type: 'text',
        placeholder: 'Hi, welcome to our clinic...',
      },
    ],
  },
};

// ── Message types ───────────────────────────────────────────────────────────

interface TextMessage {
  id: string;
  kind: 'text';
  role: 'user' | 'assistant';
  content: string;
}

interface FieldCardMessage {
  id: string;
  kind: 'field-card';
  fields: Record<string, string | number>;
  confirmed: boolean;
}

type ChatMessage = TextMessage | FieldCardMessage;

// ── Animations ──────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300, staggerChildren: 0.05 },
  },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } },
};

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 10, x: -10 },
  visible: { opacity: 1, y: 0, x: 0, transition: { type: 'spring', stiffness: 500, damping: 30 } },
};

// ── Component ───────────────────────────────────────────────────────────────

function getScreenContext(pathname: string): {
  isOnboarding: boolean;
  screenName: string;
  subtitle: string;
} {
  if (pathname?.startsWith('/onboarding')) {
    const step = pathname.split('/').filter(Boolean).at(-1) ?? '';
    return {
      isOnboarding: true,
      screenName: step ? `onboarding / ${step.replace(/-/g, ' ')}` : 'onboarding',
      subtitle: 'Setup Assistant',
    };
  }

  const segments = pathname?.split('/').filter(Boolean) ?? [];
  const page = segments.at(-1) ?? 'overview';
  const screenName = page.replace(/-/g, ' ');

  return {
    isOnboarding: false,
    screenName: `dashboard / ${screenName}`,
    subtitle: 'AI Assistant',
  };
}

const WELCOME_ONBOARDING: TextMessage = {
  id: 'welcome',
  kind: 'text',
  role: 'assistant',
  content:
    'Hi! I\'m Dentora AI — your setup assistant. Tell me your clinic details and I\'ll fill in the forms for you. For example: "My clinic is Bright Smile Dental at 42 Oak Ave, phone 555-1234"',
};

const WELCOME_DASHBOARD: TextMessage = {
  id: 'welcome',
  kind: 'text',
  role: 'assistant',
  content:
    "Hey! I'm Dentora AI — your smart assistant. Ask me anything — platform help, call analytics, dental advice, appointment tips, or literally whatever's on your mind. I'm here for it all.",
};

interface AiAction {
  type: 'updateFields' | 'save' | 'navigate' | 'showToast';
  fields?: Record<string, string | number>;
  path?: string;
  message?: string;
  toastType?: 'success' | 'error' | 'info';
}

export function DentoraAiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const screenCtx = getScreenContext(pathname ?? '');
  const currentStep = pathname?.split('/').filter(Boolean).at(-1) ?? '';
  const stepConfig = STEP_FIELDS[currentStep];

  const [messages, setMessages] = useState<ChatMessage[]>([
    screenCtx.isOnboarding ? WELCOME_ONBOARDING : WELCOME_DASHBOARD,
  ]);

  const executeActions = useCallback(
    (actions: AiAction[]) => {
      for (const action of actions) {
        switch (action.type) {
          case 'updateFields':
            if (action.fields && Object.keys(action.fields).length > 0) {
              window.dispatchEvent(new CustomEvent('dentora-ai-fields', { detail: action.fields }));
            }
            break;
          case 'save':
            window.dispatchEvent(new CustomEvent('dentora-ai-save'));
            break;
          case 'navigate':
            if (action.path) {
              router.push(action.path);
            }
            break;
          case 'showToast':
            if (action.message) {
              const toastFn =
                action.toastType === 'error'
                  ? toast.error
                  : action.toastType === 'info'
                    ? toast.info
                    : toast.success;
              toastFn(action.message);
            }
            break;
        }
      }
    },
    [router],
  );

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const applyFields = (fields: Record<string, string | number>) => {
    const typed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string' && v.trim()) typed[k] = v.trim();
      if (typeof v === 'number') typed[k] = v;
    }
    if (Object.keys(typed).length > 0) {
      window.dispatchEvent(new CustomEvent('dentora-ai-fields', { detail: typed }));
    }
  };

  const advanceStep = () => {
    if (stepConfig?.nextStep) {
      window.dispatchEvent(
        new CustomEvent('dentora-ai-next-step', { detail: { step: stepConfig.nextStep } }),
      );
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || isThinking) return;

    const userMsg: TextMessage = {
      id: `u-${Date.now()}`,
      kind: 'text',
      role: 'user',
      content: text,
    };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setDraft('');
    setIsThinking(true);

    try {
      const token = await ensureFreshAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
      if (auth && typeof auth === 'object') Object.assign(headers, auth as Record<string, string>);
      const csrf = await fetchCsrfToken();
      if (csrf) headers['x-csrf-token'] = csrf;

      const textMessages = allMessages.filter(
        (m): m is TextMessage => m.kind === 'text' && m.id !== 'welcome',
      );

      const res = await fetch(`${API_BASE_URL}/onboarding/ai-chat`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          messages: textMessages.map((m) => ({ role: m.role, content: m.content })),
          screenContext: screenCtx.screenName,
        }),
      });

      const payload = (await res.json()) as {
        reply?: string;
        extractedFields?: Record<string, unknown>;
        actions?: AiAction[];
        error?: string;
      };
      if (!res.ok || !payload.reply) throw new Error(payload.error || 'No response from AI');

      const newMessages: ChatMessage[] = [
        { id: `a-${Date.now()}`, kind: 'text', role: 'assistant', content: payload.reply },
      ];

      const extracted = payload.extractedFields;
      if (extracted && Object.keys(extracted).length > 0) {
        const cardFields: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(extracted)) {
          if (typeof v === 'string' || typeof v === 'number') cardFields[k] = v;
        }
        if (Object.keys(cardFields).length > 0) {
          applyFields(cardFields);
          newMessages.push({
            id: `fc-${Date.now()}`,
            kind: 'field-card',
            fields: cardFields,
            confirmed: false,
          });
        }
      }

      if (payload.actions && payload.actions.length > 0) {
        executeActions(payload.actions);
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not reach Dentora AI';
      toast.error(msg);
    } finally {
      setIsThinking(false);
    }
  };

  const updateCardField = (cardId: string, fieldKey: string, value: string | number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== 'field-card' || m.id !== cardId) return m;
        return { ...m, fields: { ...m.fields, [fieldKey]: value } };
      }),
    );
  };

  const confirmCard = (cardId: string) => {
    const card = messages.find((m) => m.id === cardId && m.kind === 'field-card') as
      | FieldCardMessage
      | undefined;
    if (!card) return;

    applyFields(card.fields);
    setMessages((prev) =>
      prev.map((m) => (m.id === cardId && m.kind === 'field-card' ? { ...m, confirmed: true } : m)),
    );

    toast.success('Fields applied to form');

    const filledKeys = new Set(Object.keys(card.fields));
    const allTextCards = messages.filter((m): m is FieldCardMessage => m.kind === 'field-card');
    for (const tc of allTextCards) {
      for (const k of Object.keys(tc.fields)) filledKeys.add(k);
    }

    if (stepConfig) {
      const requiredKeys = stepConfig.fields.map((f) => f.key);
      const allFilled = requiredKeys.every((k) => filledKeys.has(k));
      if (allFilled) {
        setTimeout(() => {
          advanceStep();
          toast.success('All fields filled — moving to next step');
        }, 600);
      }
    }
  };

  const getFieldMeta = (key: string): FieldMeta | undefined => {
    for (const cfg of Object.values(STEP_FIELDS)) {
      const found = cfg.fields.find((f) => f.key === key);
      if (found) return found;
    }
    return undefined;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 sm:right-8">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-[400px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1424]/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/10"
          >
            {/* Header */}
            <div className="relative border-b border-white/[0.06] p-4 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 opacity-50" />
              <div className="relative flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-[#0a0e1a] shadow-sm">
                      <AvatarImage src="/dentora.png" alt="Dentora AI" />
                      <AvatarFallback className="bg-blue-500/15 text-blue-400">
                        <Sparkles className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0a0e1a] bg-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Dentora AI</h3>
                    <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
                      {screenCtx.subtitle}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-gray-500 hover:bg-white/[0.06] hover:text-white"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex h-[420px] flex-col gap-3 overflow-y-auto p-4 bg-gradient-to-b from-[#0f1424]/20 to-[#0a0e1a]/40 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
              {messages.map((msg) => {
                if (msg.kind === 'field-card') {
                  return (
                    <motion.div
                      key={msg.id}
                      variants={messageVariants}
                      initial="hidden"
                      animate="visible"
                      className="flex gap-3"
                    >
                      <Avatar className="h-8 w-8 shrink-0 border border-white/[0.06] shadow-sm">
                        <AvatarFallback className="bg-blue-500/10 text-blue-400">
                          <Sparkles className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="w-full max-w-[85%] rounded-2xl rounded-tl-none border border-white/[0.08] bg-[#0f1424]/80 p-3 shadow-sm backdrop-blur-sm">
                        <p className="mb-2.5 text-xs font-medium text-gray-500">
                          {msg.confirmed ? 'Fields applied' : 'Review & confirm'}
                        </p>
                        <div className="space-y-2">
                          {Object.entries(msg.fields).map(([key, value]) => {
                            const meta = getFieldMeta(key);
                            return (
                              <div key={key}>
                                <label className="mb-0.5 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                                  {meta?.label ?? key}
                                </label>
                                <input
                                  type={meta?.type ?? 'text'}
                                  value={String(value)}
                                  disabled={msg.confirmed}
                                  onChange={(e) => {
                                    const v =
                                      meta?.type === 'number'
                                        ? Number(e.target.value) || 0
                                        : e.target.value;
                                    updateCardField(msg.id, key, v);
                                  }}
                                  className={cn(
                                    'w-full rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors',
                                    msg.confirmed
                                      ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300'
                                      : 'border-white/[0.1] bg-white/[0.04] text-white focus:border-blue-500/40',
                                  )}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {!msg.confirmed && (
                          <Button
                            size="sm"
                            className="mt-3 w-full gap-1.5 rounded-lg bg-blue-600 text-xs font-mono uppercase tracking-wider text-white hover:bg-blue-500"
                            onClick={() => confirmCard(msg.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Confirm & apply
                          </Button>
                        )}
                        {msg.confirmed && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            Applied to form
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id}
                    variants={messageVariants}
                    initial="hidden"
                    animate="visible"
                    className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse self-end')}
                  >
                    {msg.role === 'assistant' ? (
                      <Avatar className="h-8 w-8 shrink-0 border border-white/[0.06] shadow-sm">
                        <AvatarImage src="/dentora.png" />
                        <AvatarFallback className="bg-blue-500/10 text-blue-400">
                          <Sparkles className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar className="h-8 w-8 shrink-0 border border-white/[0.06] shadow-sm">
                        <AvatarFallback className="bg-blue-600 text-xs font-semibold text-white">
                          You
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'flex max-w-[85%] flex-col gap-1',
                        msg.role === 'user' && 'items-end',
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <span className="text-xs font-medium text-gray-600">Dentora AI</span>
                      )}
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                          msg.role === 'user'
                            ? 'rounded-tr-none bg-blue-600 text-white shadow-md'
                            : 'rounded-tl-none border border-white/[0.06] bg-white/[0.04] text-gray-300 backdrop-blur-sm',
                        )}
                      >
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                              strong: ({ children }) => (
                                <strong className="font-semibold text-white">{children}</strong>
                              ),
                              ul: ({ children }) => (
                                <ul className="mb-1.5 ml-4 list-disc space-y-0.5 last:mb-0">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 last:mb-0">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => <li>{children}</li>,
                              code: ({ children }) => (
                                <code className="rounded bg-white/10 px-1 py-0.5 text-xs text-blue-300">
                                  {children}
                                </code>
                              ),
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  className="text-blue-400 underline underline-offset-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {isThinking && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <Avatar className="h-8 w-8 shrink-0 border border-white/[0.06] shadow-sm">
                    <AvatarFallback className="bg-blue-500/10 text-blue-400">
                      <Sparkles className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-none border border-white/[0.06] bg-white/[0.04] px-4 py-3 shadow-sm backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60" />
                  </div>
                </motion.div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/[0.06] bg-[#0a0e1a]/60 p-3 backdrop-blur-md">
              <form
                className="relative flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    screenCtx.isOnboarding ? 'Tell me your clinic details...' : 'Ask me anything...'
                  }
                  className="flex-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-gray-600 focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/10"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-500 hover:shadow-blue-600/25 disabled:opacity-40"
                  disabled={!draft.trim() || isThinking}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className={cn(
          'group relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-2xl transition-all duration-300',
          isOpen
            ? 'rotate-90 bg-red-600 text-white'
            : 'bg-blue-600 text-white hover:shadow-blue-600/25',
        )}
      >
        <span className="absolute inset-0 -z-10 rounded-full bg-inherit opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40" />
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageSquare className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
