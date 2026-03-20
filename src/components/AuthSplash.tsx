import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Command, Mail, Lock, Eye, EyeOff, AlertCircle, RotateCcw } from 'lucide-react';
import {
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    sendMagicLink,
    getAuthErrorMessage,
} from '../services/authService';
import { AuthError } from 'firebase/auth';

type Mode = 'login' | 'signup' | 'reset' | 'magic';

export const AuthSplash: React.FC = () => {
    const [mode, setMode] = useState<Mode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resetSent, setResetSent] = useState(false);

    const clearError = () => setError('');

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        clearError();
        try {
            if (mode === 'login') {
                await signInWithEmail(email, password);
            } else if (mode === 'signup') {
                await signUpWithEmail(email, password);
            } else if (mode === 'magic') {
                await sendMagicLink(email);
                setResetSent(true);
            } else {
                await resetPassword(email);
                setResetSent(true);
            }
            // Auth state change propagates via useAuthStore → app re-renders
        } catch (err) {
            setError(getAuthErrorMessage(err as AuthError));
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        clearError();
        setResetSent(false);
        setPassword('');
    };

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050505] text-white overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 pointer-events-none select-none z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-indigo-500/10 blur-[150px] rounded-full opacity-40 animate-[pulse_10s_ease-in-out_infinite]" />
                <div className="absolute top-[40%] left-[40%] w-[800px] h-[800px] bg-cyan-600/5 blur-[120px] rounded-full opacity-30" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)]" />
                <div
                    className="absolute inset-0 opacity-[0.025]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 32, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-sm mx-auto px-4"
            >
                {/* Logo */}
                <div className="text-center mb-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 mb-3">Civic Minds</p>
                    <h1 className="text-[36px] font-black tracking-[-0.04em] text-white leading-none">Atlas</h1>
                    <p className="text-[13px] text-white/40 font-medium mt-2">Intelligence for Mobility</p>
                </div>

                <AnimatePresence mode="wait">
                    {resetSent ? (
                        <motion.div
                            key="reset-sent"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-8"
                        >
                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                <RotateCcw className="w-5 h-5 text-emerald-400" />
                            </div>
                            <p className="text-white font-bold mb-1">
                                {mode === 'magic' ? 'Check your email' : 'Check your inbox'}
                            </p>
                            <p className="text-white/40 text-sm">
                                {mode === 'magic'
                                    ? `Sign-in link sent to ${email}`
                                    : `Reset link sent to ${email}`
                                }
                            </p>
                            <button
                                onClick={() => { switchMode('login'); setResetSent(false); }}
                                className="mt-6 text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors font-bold"
                            >
                                Back to sign in
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => { setEmail(e.target.value); clearError(); }}
                                        placeholder="Email address"
                                        required
                                        autoComplete="email"
                                        className="w-full h-12 bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl pl-11 pr-4 text-[13px] text-white placeholder-white/25 outline-none transition-all duration-200"
                                    />
                                </div>

                                {mode !== 'reset' && mode !== 'magic' && (
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => { setPassword(e.target.value); clearError(); }}
                                            placeholder="Password"
                                            required
                                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                            className="w-full h-12 bg-white/5 border border-white/10 focus:border-indigo-500/50 rounded-2xl pl-11 pr-12 text-[13px] text-white placeholder-white/25 outline-none transition-all duration-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(p => !p)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                )}

                                {/* Error */}
                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5"
                                        >
                                            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                                            <span className="text-[12px] text-red-300 font-medium">{error}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="group relative w-full h-12 bg-white text-black rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 overflow-hidden transition-transform active:scale-[0.98] disabled:opacity-50 mt-1"
                                >
                                    <div className="absolute inset-0 bg-indigo-50 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="relative z-10">
                                        {loading
                                            ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                            : mode === 'login' ? 'Sign in'
                                            : mode === 'signup' ? 'Create account'
                                            : mode === 'magic' ? 'Send magic link'
                                            : 'Send reset link'
                                        }
                                    </span>
                                    {!loading && <ArrowRight className="relative z-10 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
                                </button>
                            </form>

                            {/* Mode switchers */}
                            <div className="flex flex-col items-center gap-4 mt-6">
                                {mode === 'login' && (
                                    <>
                                        <button onClick={() => switchMode('magic')} className="text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors font-bold">
                                            Sign in with Magic Link
                                        </button>
                                        <div className="flex items-center gap-4">
                                            <button onClick={() => switchMode('signup')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors font-medium">
                                                Create account
                                            </button>
                                            <span className="text-white/20">·</span>
                                            <button onClick={() => switchMode('reset')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors font-medium">
                                                Forgot password?
                                            </button>
                                        </div>
                                    </>
                                )}
                                {mode === 'magic' && (
                                    <button onClick={() => switchMode('login')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors font-medium">
                                        Sign in with password
                                    </button>
                                )}
                                {mode === 'signup' && (
                                    <button onClick={() => switchMode('login')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors font-medium">
                                        Already have an account? Sign in
                                    </button>
                                )}
                                {mode === 'reset' && (
                                    <button onClick={() => switchMode('login')} className="text-[12px] text-white/40 hover:text-white/70 transition-colors font-medium">
                                        Back to sign in
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Corner decoration */}
            <div className="absolute top-8 left-8 hidden lg:flex items-center gap-4 text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">
                <Command className="w-3 h-3" />
                <span>Atlas Platform</span>
                <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                <span className="text-emerald-500/40">Online</span>
            </div>
        </div>
    );
};
