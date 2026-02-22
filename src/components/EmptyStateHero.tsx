import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Feature {
    icon: React.ReactNode;
    title: string;
    desc: string;
}

interface EmptyStateHeroProps {
    icon: LucideIcon;
    title: string;
    description: string;
    primaryAction?: {
        label: string;
        icon: LucideIcon;
        onClick?: () => void;
        href?: string;
    };
    features?: Feature[];
}

export const EmptyStateHero: React.FC<EmptyStateHeroProps> = ({
    icon: Icon,
    title,
    description,
    primaryAction,
    features
}) => {
    const navigate = useNavigate();

    const handleActionClick = () => {
        if (primaryAction?.onClick) {
            primaryAction.onClick();
        }
        if (primaryAction?.href) {
            navigate(primaryAction.href);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center py-32 px-6 w-full max-w-7xl mx-auto">
            <div className="text-center mb-20 max-w-3xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="space-y-6"
                >
                    <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 flex items-center justify-center mx-auto mb-10 border border-indigo-500/20 shadow-2xl shadow-indigo-500/10 group">
                        <Icon className="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <h2 className="atlas-h1 !text-6xl md:text-7xl !font-black tracking-tighter">{title}</h2>
                    <p className="text-xl text-[var(--text-muted)] font-medium leading-relaxed max-w-2xl mx-auto opacity-70">{description}</p>
                </motion.div>
            </div>

            {primaryAction && (
                <div className="flex flex-col items-center gap-4 w-full">
                    <motion.button
                        onClick={handleActionClick}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full max-w-xl group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-indigo-600 transition-all duration-700 group-hover:scale-105" />
                        <div className="relative px-12 py-8 flex flex-col items-center gap-2 border border-white/10 rounded-[3rem] shadow-2xl shadow-indigo-600/30">
                            <primaryAction.icon className="w-8 h-8 text-white mb-2 group-hover:rotate-12 transition-transform duration-500" />
                            <div className="text-2xl font-black text-white tracking-tight">{primaryAction.label}</div>
                            <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em]">Initialize Instrument</p>
                        </div>
                    </motion.button>
                </div>
            )}

            {features && features.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-16 max-w-5xl pt-32 border-t border-[var(--border)] mt-32 w-full">
                    {features.map((f, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + i * 0.1 }}
                            className="text-center group border border-transparent hover:border-[var(--border)] p-8 rounded-[2rem] transition-all duration-500 hover:bg-[var(--item-bg)]/30 hover:shadow-tactile"
                        >
                            <div className="text-indigo-500 w-10 h-10 mx-auto mb-6 flex items-center justify-center bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform duration-500">{f.icon}</div>
                            <div className="text-lg font-black text-[var(--fg)] mb-3 tracking-tight">{f.title}</div>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed font-medium opacity-70">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};
