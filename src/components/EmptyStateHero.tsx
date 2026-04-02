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
    secondaryAction?: {
        label: string;
        icon: LucideIcon;
        onClick?: () => void;
    };
    features?: Feature[];
}

export const EmptyStateHero: React.FC<EmptyStateHeroProps> = ({
    icon: Icon,
    title,
    description,
    primaryAction,
    secondaryAction,
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

    const handleSecondaryClick = () => {
        if (secondaryAction?.onClick) {
            secondaryAction.onClick();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 w-full max-w-3xl mx-auto">
            <div className="text-center mb-10">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-4"
                >
                    <div className="w-14 h-14 rounded-xl bg-[var(--item-bg)] flex items-center justify-center mx-auto mb-6 border border-[var(--border)]">
                        <Icon className="w-6 h-6 text-[var(--text-muted)]" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-md mx-auto">{description}</p>
                </motion.div>
            </div>

            {(primaryAction || secondaryAction) && (
                <div className="flex items-center gap-3 mb-12">
                    {primaryAction && (
                        <button
                            onClick={handleActionClick}
                            className="btn-primary px-5 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-sm"
                        >
                            <primaryAction.icon className="w-4 h-4" />
                            {primaryAction.label}
                        </button>
                    )}

                    {secondaryAction && (
                        <button
                            onClick={handleSecondaryClick}
                            className="btn-secondary px-5 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-sm"
                        >
                            <secondaryAction.icon className="w-4 h-4" />
                            {secondaryAction.label}
                        </button>
                    )}
                </div>
            )}

            {features && features.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-8 border-t border-[var(--border)]">
                    {features.map((f, i) => (
                        <div
                            key={i}
                            className="text-center p-4"
                        >
                            <div className="text-[var(--text-muted)] w-8 h-8 mx-auto mb-3 flex items-center justify-center">{f.icon}</div>
                            <div className="text-sm font-semibold text-[var(--fg)] mb-1">{f.title}</div>
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
