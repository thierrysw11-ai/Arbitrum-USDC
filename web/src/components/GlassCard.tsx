'use client';

import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export default function GlassCard({ children, title, className = "" }: GlassCardProps) {
  return (
    <div className={`group relative bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-[2rem] overflow-hidden transition-all duration-500 hover:border-purple-500/40 hover:shadow-[0_0_40px_-15px_rgba(168,85,247,0.2)] ${className}`}>
      {/* Decorative Glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/5 blur-[100px] rounded-full pointer-events-none group-hover:bg-purple-600/10 transition-colors duration-500" />
      
      {title && (
        <div className="px-8 pt-8 pb-4">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">{title}</h3>
        </div>
      )}
      
      <div className="p-8 relative z-10">
        {children}
      </div>
    </div>
  );
}