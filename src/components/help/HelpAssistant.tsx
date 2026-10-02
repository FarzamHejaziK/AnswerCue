import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, HelpCircle, MessageCircle, Send, Trash2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import helpGuideMarkdown from '../../content/answercue-help-guide.md?raw';
import { useStreamBuffer } from '../../hooks/useStreamBuffer';
import { genMessageId } from '../../utils/messageId';

type HelpMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: number;
    isStreaming?: boolean;
};

type HelpState = 'idle' | 'waiting' | 'streaming' | 'error';
type HelpView = 'chat' | 'guide';

const STORAGE_KEY = 'answercue_help_assistant_messages_v1';
const DISMISSED_STORAGE_KEY = 'answercue_help_assistant_dismissed_v1';
const SHOW_HELP_ASSISTANT_EVENT = 'answercue-help-assistant-show';
const MAX_STORED_MESSAGES = 80;

const HELP_ASSISTANT_SYSTEM_PROMPT = `You are the AnswerCue Help Assistant.

You provide product support for the AnswerCue desktop app.

Use the supplied AnswerCue Help Guide as your primary source of truth. Also use the recent help chat history for continuity.

Rules:
- Be concise, practical, and step-by-step.
- Do not act as the live interview assistant.
- Do not write into interview transcript or prep chat.
- If the user's issue depends on platform, provider, audio device, or meeting app, ask for the missing detail.
- If the guide does not contain the answer, say what you can infer and what should be checked manually.
- Never invent hidden settings or unsupported features.
- Prefer the fastest path that helps the user test or unblock the app.`;

const markdownComponents: any = {
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc pl-5 space-y-1">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal pl-5 space-y-1">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-text-primary">{children}</strong>,
    code: ({ children }: { children?: React.ReactNode }) => (
        <code className="rounded bg-bg-input px-1 py-0.5 text-[0.9em] text-text-primary">{children}</code>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="my-3 overflow-x-auto rounded-lg border border-border-subtle bg-bg-input p-3 text-[11px] leading-relaxed text-text-primary">
            {children}
        </pre>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-3 text-lg font-bold text-text-primary">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-4 text-sm font-bold text-text-primary">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-2 mt-3 text-xs font-bold text-text-primary">{children}</h3>,
};

const readStoredMessages = (): HelpMessage[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((message) =>
                message &&
                (message.role === 'user' || message.role === 'assistant') &&
                typeof message.content === 'string' &&
                message.content.trim().length > 0
            )
            .slice(-MAX_STORED_MESSAGES)
            .map((message) => ({
                id: typeof message.id === 'string' ? message.id : genMessageId(),
                role: message.role,
                content: message.content,
                createdAt: Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
                isStreaming: false,
            }));
    } catch {
        return [];
    }
};

const saveStoredMessages = (messages: HelpMessage[]) => {
    try {
        const clean = messages
            .filter((message) => message.content.trim())
            .slice(-MAX_STORED_MESSAGES)
            .map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
        /* localStorage can fail in private or constrained environments */
    }
};

const readDismissed = () => {
    try {
        return localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const buildHelpContext = (history: HelpMessage[]) => {
    const recentHistory = history
        .filter((message) => message.content.trim())
        .slice(-16)
        .map((message) => `${message.role === 'user' ? 'User' : 'Help Assistant'}: ${message.content.trim()}`)
        .join('\n\n');

    return [
        '<answercue_help_guide>',
        helpGuideMarkdown,
        '</answercue_help_guide>',
        recentHistory ? '<recent_help_chat>' : '',
        recentHistory,
        recentHistory ? '</recent_help_chat>' : '',
    ].filter(Boolean).join('\n\n');
};

const formatModelLabel = (config: { provider?: string; model?: string } | null) => {
    if (!config?.model) return 'Using your selected model';
    return `Using ${config.model}`;
};

export const HelpAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isDismissed, setIsDismissed] = useState(() => readDismissed());
    const [view, setView] = useState<HelpView>('chat');
    const [messages, setMessages] = useState<HelpMessage[]>(() => readStoredMessages());
    const [draft, setDraft] = useState('');
    const [state, setState] = useState<HelpState>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [modelLabel, setModelLabel] = useState('Using your selected model');
    const [copied, setCopied] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const streamCleanupsRef = useRef<Array<() => void>>([]);
    const { appendToken, getBufferedContent, reset } = useStreamBuffer();

    useEffect(() => {
        saveStoredMessages(messages);
    }, [messages]);

    useEffect(() => {
        const restoreHelpAssistant = (event: Event) => {
            try {
                localStorage.removeItem(DISMISSED_STORAGE_KEY);
            } catch {
                /* localStorage can fail in constrained environments */
            }
            setIsDismissed(false);
            if (event instanceof CustomEvent && event.detail?.open) {
                setIsOpen(true);
                setView('chat');
            }
        };

        window.addEventListener(SHOW_HELP_ASSISTANT_EVENT, restoreHelpAssistant);
        return () => window.removeEventListener(SHOW_HELP_ASSISTANT_EVENT, restoreHelpAssistant);
    }, []);

    useEffect(() => {
        if (!isOpen || view !== 'chat') return;
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }, [isOpen, messages, state, view]);

    useEffect(() => {
        if (!isOpen) return;
        window.electronAPI?.getCurrentLlmConfig?.()
            .then((config) => setModelLabel(formatModelLabel(config)))
            .catch(() => setModelLabel('Using your selected model'));

        const cleanup = window.electronAPI?.onModelChanged?.((modelId: string) => {
            setModelLabel(`Using ${modelId}`);
        });
        return () => cleanup?.();
    }, [isOpen]);

    useEffect(() => {
        return () => {
            streamCleanupsRef.current.forEach((cleanup) => cleanup());
            streamCleanupsRef.current = [];
        };
    }, []);

    const clearStreamListeners = useCallback(() => {
        streamCleanupsRef.current.forEach((cleanup) => cleanup());
        streamCleanupsRef.current = [];
    }, []);

    const updateAssistantMessage = useCallback((messageId: string, content: string, isStreaming: boolean) => {
        setMessages((prev) => prev.map((message) =>
            message.id === messageId ? { ...message, content, isStreaming } : message
        ));
    }, []);

    const submitQuestion = useCallback(async () => {
        const question = draft.trim();
        if (!question || state === 'waiting' || state === 'streaming') return;

        const userMessage: HelpMessage = {
            id: genMessageId(),
            role: 'user',
            content: question,
            createdAt: Date.now(),
        };
        const assistantMessageId = genMessageId();
        const assistantMessage: HelpMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            isStreaming: true,
        };
        const historyBeforeTurn = messages;

        setDraft('');
        setView('chat');
        setErrorMessage('');
        setState('waiting');
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
        reset();
        clearStreamListeners();

        let tokenCleanup: (() => void) | undefined;
        let doneCleanup: (() => void) | undefined;
        let errorCleanup: (() => void) | undefined;

        try {
            tokenCleanup = window.electronAPI?.onGeminiStreamToken((token: string) => {
                setState('streaming');
                appendToken(token, (content) => updateAssistantMessage(assistantMessageId, content, true));
            });
            doneCleanup = window.electronAPI?.onGeminiStreamDone(() => {
                const finalContent = getBufferedContent() || 'I could not generate a help response. Check Settings -> AI Providers and try again.';
                updateAssistantMessage(assistantMessageId, finalContent, false);
                setState('idle');
                reset();
                clearStreamListeners();
            });
            errorCleanup = window.electronAPI?.onGeminiStreamError((error: string) => {
                console.error('[HelpAssistant] stream error:', error);
                setMessages((prev) => prev.filter((message) => message.id !== assistantMessageId));
                setErrorMessage("Couldn't answer. Check Settings -> AI Providers, then try again.");
                setState('error');
                reset();
                clearStreamListeners();
            });
            streamCleanupsRef.current = [tokenCleanup, doneCleanup, errorCleanup].filter(Boolean) as Array<() => void>;

            await window.electronAPI?.streamGeminiChat(
                question,
                undefined,
                buildHelpContext(historyBeforeTurn),
                {
                    systemPrompt: HELP_ASSISTANT_SYSTEM_PROMPT,
                    ignoreKnowledgeMode: true,
                    recordInSession: false,
                },
            );
        } catch (error) {
            console.error('[HelpAssistant] submit failed:', error);
            setMessages((prev) => prev.filter((message) => message.id !== assistantMessageId));
            setErrorMessage("Couldn't start the help chat. Check Settings -> AI Providers and try again.");
            setState('error');
            reset();
            clearStreamListeners();
        }
    }, [
        appendToken,
        clearStreamListeners,
        draft,
        getBufferedContent,
        messages,
        reset,
        state,
        updateAssistantMessage,
    ]);

    const closePanel = () => {
        if (state === 'waiting' || state === 'streaming') {
            window.electronAPI?.cancelChatStream?.();
            clearStreamListeners();
            reset();
            setState('idle');
        }
        setIsOpen(false);
    };

    const clearChat = () => {
        if (state === 'waiting' || state === 'streaming') {
            window.electronAPI?.cancelChatStream?.();
            clearStreamListeners();
            reset();
            setState('idle');
        }
        setMessages([]);
        setErrorMessage('');
        localStorage.removeItem(STORAGE_KEY);
    };

    const copyGuide = async () => {
        try {
            await navigator.clipboard.writeText(helpGuideMarkdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            setCopied(false);
        }
    };

    const canSubmit = draft.trim().length > 0 && state !== 'waiting' && state !== 'streaming';

    const dismissFloatingButton = () => {
        if (state === 'waiting' || state === 'streaming') {
            window.electronAPI?.cancelChatStream?.();
            clearStreamListeners();
            reset();
            setState('idle');
        }
        setIsOpen(false);
        setIsDismissed(true);
        try {
            localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
        } catch {
            /* localStorage can fail in constrained environments */
        }
    };

    const emptyState = useMemo(() => (
        <div className="flex min-h-[260px] flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-secondary text-accent-primary">
                <HelpCircle size={24} />
            </div>
            <h3 className="mb-2 text-base font-semibold text-text-primary">Ask about AnswerCue</h3>
            <p className="max-w-[300px] text-xs leading-relaxed text-text-secondary">
                Setup, audio, permissions, models, live interview actions, shortcuts, transcripts, documents, and troubleshooting.
            </p>
        </div>
    ), []);

    if (isDismissed) return null;

    return (
        <div data-open={isOpen} className="workspace-help-widget fixed bottom-5 right-5 z-[2200] no-drag">
            {isOpen && (
                <div className="workspace-help-panel mb-3 flex h-[min(680px,calc(100vh-64px))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-[0_28px_90px_rgba(0,0,0,0.50),0_0_0_1px_rgba(255,255,255,0.04),0_0_42px_rgba(249,115,22,0.10)]">
                    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-secondary px-4 py-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-secondary text-accent-primary">
                                    <MessageCircle size={15} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="truncate text-sm font-semibold text-text-primary">Help Assistant</h2>
                                    <p className="truncate text-[10px] text-text-tertiary">{modelLabel}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setView('chat')}
                                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${view === 'chat' ? 'bg-bg-item-active text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-item-hover'}`}
                            >
                                Chat
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('guide')}
                                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${view === 'guide' ? 'bg-bg-item-active text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-item-hover'}`}
                            >
                                Guide
                            </button>
                            <button
                                type="button"
                                onClick={closePanel}
                                className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-item-hover hover:text-text-primary"
                                aria-label="Close help"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {view === 'chat' ? (
                        <>
                            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                                {messages.length === 0 ? emptyState : (
                                    <div className="space-y-4">
                                        {messages.map((message) => (
                                            <div
                                                key={message.id}
                                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                                                        message.role === 'user'
                                                            ? 'rounded-br-md bg-text-primary text-bg-primary'
                                                            : 'rounded-bl-md border border-border-subtle bg-bg-item-surface text-text-secondary'
                                                    }`}
                                                >
                                                    {message.role === 'assistant' ? (
                                                        <div className="markdown-content">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                                {message.content || (message.isStreaming ? 'Thinking...' : '')}
                                                            </ReactMarkdown>
                                                            {message.isStreaming && (
                                                                <span className="mt-1 inline-block h-3 w-1 animate-pulse rounded-sm bg-text-tertiary" />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="whitespace-pre-wrap">{message.content}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                                {errorMessage && (
                                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-400">
                                        {errorMessage}
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 border-t border-border-subtle bg-bg-secondary p-3">
                                {messages.length > 0 && (
                                    <div className="mb-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={clearChat}
                                            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-text-tertiary transition-colors hover:bg-bg-item-hover hover:text-text-primary"
                                        >
                                            <Trash2 size={12} /> Clear history
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-end gap-2 rounded-2xl border border-border-subtle bg-bg-input p-2">
                                    <textarea
                                        ref={textAreaRef}
                                        value={draft}
                                        onChange={(event) => setDraft(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault();
                                                submitQuestion();
                                            }
                                        }}
                                        placeholder="Ask about live actions, shortcuts, audio, models..."
                                        rows={2}
                                        className="max-h-28 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2 text-xs leading-relaxed text-text-primary placeholder-text-tertiary focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={submitQuestion}
                                        disabled={!canSubmit}
                                        className={`mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                                            canSubmit
                                                ? 'bg-accent-primary text-white hover:opacity-90 active:scale-95'
                                                : 'bg-bg-item-active text-text-tertiary cursor-not-allowed'
                                        }`}
                                        aria-label="Send help question"
                                    >
                                        <Send size={15} />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                                    <BookOpen size={14} />
                                    AnswerCue Guide
                                </div>
                                <button
                                    type="button"
                                    onClick={copyGuide}
                                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium text-text-tertiary transition-colors hover:bg-bg-item-hover hover:text-text-primary"
                                >
                                    {copied ? <Check size={12} /> : <BookOpen size={12} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                                <div className="markdown-content text-xs leading-relaxed text-text-secondary">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                        {helpGuideMarkdown}
                                    </ReactMarkdown>
                                </div>
                            </div>
                            <div className="shrink-0 border-t border-border-subtle p-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setView('chat');
                                        requestAnimationFrame(() => textAreaRef.current?.focus());
                                    }}
                                    className="w-full rounded-xl bg-accent-primary px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                >
                                    Ask the Help Assistant
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="relative ml-auto">
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen((open) => !open);
                        setView('chat');
                    }}
                    className="flex h-12 items-center gap-2 rounded-full border border-border-muted bg-bg-elevated px-4 text-sm font-semibold text-text-primary shadow-[0_18px_55px_rgba(0,0,0,0.32),0_8px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.10)] transition-all hover:-translate-y-0.5 hover:border-accent-primary hover:shadow-[0_22px_70px_rgba(0,0,0,0.38),0_0_34px_rgba(249,115,22,0.14),inset_0_1px_0_rgba(255,255,255,0.14)]"
                    aria-label={isOpen ? 'Close help assistant' : 'Open help assistant'}
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-secondary text-accent-primary ring-1 ring-border-subtle">
                        <HelpCircle size={16} />
                    </span>
                    Help
                </button>
                <button
                    type="button"
                    onClick={dismissFloatingButton}
                    className="absolute -right-1.5 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border-muted bg-bg-elevated text-text-secondary shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-colors hover:bg-bg-item-active hover:text-text-primary"
                    aria-label="Hide help button"
                    title="Hide help button"
                >
                    <X size={13} strokeWidth={2.4} />
                </button>
            </div>
        </div>
    );
};

export default HelpAssistant;
