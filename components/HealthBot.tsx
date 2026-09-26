'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Minimize2, Maximize2, Sparkles, Bot, Minus } from 'lucide-react';
import { chatWithHealthBot, getPatientContext } from '@/app/actions/healthBot';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

interface Message {
    role: 'user' | 'bot';
    content: string;
}

export default function HealthBot() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [context, setContext] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && session?.user?.id && !context) {
            loadContext();
        }
    }, [isOpen, session]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadContext = async () => {
        if (!session?.user?.id) return;
        try {
            const result = await getPatientContext(session.user.id);
            if (result.context) {
                setContext(result.context);
                if (messages.length === 0) {
                    setMessages([
                        {
                            role: 'bot',
                            content: `Hello! I'm your Massha Health Assistant. I have access to your health profile and recent reports. How can I help you regarding your health today?`
                        }
                    ]);
                }
            }
        } catch (error) {
            console.error("Failed to load context", error);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !context) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const response = await chatWithHealthBot(userMsg, context);

            if (response.reply) {
                setMessages(prev => [...prev, { role: 'bot', content: response.reply! }]);
            } else {
                setMessages(prev => [...prev, { role: 'bot', content: "I'm having trouble connecting right now. Please try again later." }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'bot', content: "Something went wrong. Please check your connection." }]);
        } finally {
            setLoading(false);
        }
    };

    // Hide chatbot if not logged in, not on dashboard, or on health parameters page
    if (!session || !pathname?.startsWith('/dashboard') || pathname?.includes('/health')) return null;

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="absolute bottom-48 sm:bottom-28 right-4 sm:right-6 z-[9999] p-4 bg-teal-600 text-white rounded-full shadow-xl hover:bg-teal-700 transition-all duration-300 hover:scale-110 flex items-center justify-center group"
                >
                    <Bot className="w-7 h-7" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap group-hover:pl-2 text-sm font-semibold">
                        Health Assistant
                    </span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div
                    className={`absolute z-[9999] bg-white shadow-2xl transition-all duration-300 flex flex-col overflow-hidden border border-slate-200 max-h-[calc(100vh-10rem)] mr-0 sm:mr-0
            ${isMaximized
                            ? 'bottom-48 sm:bottom-28 right-4 sm:right-6 w-[90vw] h-[70vh] sm:w-[500px] sm:h-[600px] rounded-2xl'
                            : 'bottom-48 sm:bottom-28 right-4 sm:right-6 w-[90vw] h-[50vh] sm:w-[380px] sm:h-[450px] rounded-2xl'
                        }`}
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-4 flex items-center justify-between text-white shrink-0 cursor-pointer" onClick={() => setIsMaximized(!isMaximized)}>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Bot className="w-5 h-5 text-teal-50" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">Massha Assistant</h3>
                                <p className="text-[10px] text-teal-100 opacity-90 hidden sm:block">Private & Secure • Health Insights</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title={isMaximized ? "Restore Size" : "Maximize"}
                            >
                                {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-red-500/20 hover:text-red-100 rounded-lg transition-colors"
                                title="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-thin scrollbar-thumb-slate-200">
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                            ? 'bg-teal-600 text-white rounded-tr-none'
                                            : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                                            }`}
                                        dangerouslySetInnerHTML={{ __html: msg.content }}
                                    />
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex gap-1 items-center">
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"></span>
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-3 sm:p-4 bg-white border-t border-slate-100 shrink-0">
                            <form
                                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                className="flex gap-2"
                            >
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Type your health question..."
                                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-slate-400"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || loading || !context}
                                    className="p-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-teal-200"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </form>
                            <div className="mt-2 text-center">
                                <p className="text-[10px] text-slate-400">
                                    AI can make mistakes. Always consult a doctor for serious symptoms.
                                </p>
                            </div>
                        </div>
                    </>
                </div>
            )}
        </>
    );
}
