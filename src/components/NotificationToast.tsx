import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { useNotificationStore, ToastType } from '../hooks/useNotification';

const ICON_MAP: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-indigo-500" />
};

const BG_MAP: Record<ToastType, string> = {
    success: 'border-emerald-500/20 bg-emerald-500/5',
    error: 'border-red-500/20 bg-red-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    info: 'border-indigo-500/20 bg-indigo-500/5'
};

export const NotificationToast: React.FC = () => {
    const { toasts, removeToast } = useNotificationStore();

    return (
        <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={`pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl border backdrop-blur-md shadow-2xl min-w-[320px] max-w-[420px] ${BG_MAP[toast.type]}`}
                    >
                        <div className="flex-shrink-0">
                            {ICON_MAP[toast.type]}
                        </div>
                        <div className="flex-1 text-sm font-medium text-[var(--fg)]">
                            {toast.message}
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-[var(--text-muted)]" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
