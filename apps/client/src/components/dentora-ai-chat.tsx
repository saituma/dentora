'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders, fetchCsrfToken } from '@/lib/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm Dentora AI — your setup assistant. Ask me anything about configuring your AI receptionist, onboarding steps, or how Dentora works.",
};

const containerVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transformOrigin: 'bottom right',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 300,
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 10, x: -10 },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    transition: { type: 'spring', stiffness: 500, damping: 30 },
  },
};

export function DentoraAiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft('');
    setIsThinking(true);

    try {
      const token = await ensureFreshAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
      if (auth && typeof auth === 'object') Object.assign(headers, auth as Record<string, string>);
      const csrf = await fetchCsrfToken();
      if (csrf) headers['x-csrf-token'] = csrf;

      const res = await fetch(`${API_BASE_URL}/onboarding/ai-chat`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          messages: next
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const payload = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !payload.reply) throw new Error(payload.error || 'No response from AI');

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: payload.reply as string },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not reach Dentora AI';
      toast.error(msg);
    } finally {
      setIsThinking(false);
    }
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
            className="w-[380px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1424]/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/10"
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
                      Setup Assistant
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

            {/* Chat Area */}
            <div className="flex h-[380px] flex-col gap-4 overflow-y-auto p-4 bg-gradient-to-b from-[#0f1424]/20 to-[#0a0e1a]/40 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
              {messages.map((msg) => (
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
                  <div className={cn('flex max-w-[85%] flex-col gap-1', msg.role === 'user' && 'items-end')}>
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
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))}

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
                  <div className="flex flex-col gap-1">
                    <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-none border border-white/[0.06] bg-white/[0.04] px-4 py-3 shadow-sm backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400/60" />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input Area */}
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
                  placeholder="Ask Dentora AI anything..."
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
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageSquare className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
