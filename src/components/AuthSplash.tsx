import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Fingerprint, Command, Shield } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';

interface AuthSplashProps {
    moduleName?: string;
    description?: string;
}

export const AuthSplash: React.FC<AuthSplashProps> = ({ moduleName = 'Platform' }) => {
    const { login } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();
    const [isHovering, setIsHovering] = useState(false);

    const handleLogin = () => {
        login();
        if (location.pathname === '/login') {
            navigate('/');
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050505] text-white overflow-hidden">
            {/* Cinematic Background Elements */}
            <div className="absolute inset-0 pointer-events-none select-none z-0">
                {/* Core ambient burst */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-indigo-500/10 blur-[150px] rounded-full opacity-40 animate-[pulse_10s_ease-in-out_infinite]" />
                <div className="absolute top-[40%] left-[40%] w-[800px] h-[800px] bg-cyan-600/5 blur-[120px] rounded-full opacity-30" />

                {/* Radial dark vignette */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)]" />

                {/* Subtle digital rain/grid texture overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex flex-col items-center w-full max-w-sm mx-auto"
            >
                {/* Holographic Icon Container */}
                <div className="relative mb-8">
                    <motion.div
                        animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute -inset-10 bg-indigo-500/20 rounded-full blur-2xl"
                    />
                    <div className="relative w-24 h-24 rounded-[28px] bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-3xl shadow-[0_0_80px_rgba(99,102,241,0.15)] group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                        {/* Shimmer line */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent -translate-y-full hover:animate-[shimmer_2s_infinite]" />

                        <Shield strokeWidth={1} stroke="white" className="w-12 h-12 text-white relative z-10" />
                    </div>
                </div>

                {/* Minimalist Text Stack */}
                <div className="text-center mb-10 w-full px-6">
                    <h2 className="text-[32px] font-[900] tracking-[-0.04em] text-white leading-tight mb-3">
                        Civic Minds
                        <br />
                        <span className="text-white/40 font-medium tracking-tight">Enterprise</span>
                    </h2>

                    <p className="text-[14px] font-medium text-white/50 leading-relaxed max-w-[280px] mx-auto">
                        High-fidelity intelligence for mass transit. Unrestricted access requires a verified session.
                    </p>
                </div>

                {/* Elegant Button */}
                <div className="w-full px-4">
                    <button
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        onClick={handleLogin}
                        className="group relative w-full h-[60px] bg-white text-black rounded-full overflow-hidden flex items-center justify-center gap-3 transition-transform active:scale-95"
                    >
                        <div className="absolute inset-0 bg-indigo-50 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />

                        <div className="relative z-10 flex items-center gap-2">
                            <span className="text-[14px] font-bold tracking-[0.05em]">
                                Authenticate
                            </span>
                            <motion.div animate={{ x: isHovering ? 4 : 0 }} transition={{ duration: 0.2 }}>
                                <ArrowRight className="w-4 h-4" />
                            </motion.div>
                        </div>
                    </button>

                    {/* Security Microcopy */}
                    <div className="mt-8 flex items-center justify-center gap-2 opacity-40">
                        <Fingerprint className="w-3 h-3" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.1em]">
                            End-to-End Encrypted Tunnel
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Tactical Grid Overlay Decoration */}
            <div className="absolute top-8 left-8 hidden lg:flex items-center gap-4 text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">
                <Command className="w-3 h-3" />
                <span>Node: US-EAST-1</span>
                <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                <span className="text-emerald-500/50">Online</span>
            </div>

            <div className="absolute bottom-8 right-8 hidden lg:block text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] text-right">
                <span className="block opacity-50 mb-1">Target Engine</span>
                <span className="block text-white">ATLAS {moduleName.toUpperCase()} PROTOCOL</span>
            </div>
        </div>
    );
};
