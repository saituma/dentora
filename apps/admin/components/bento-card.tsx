"use client";

import { motion } from "framer-motion";
import type React from "react";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * High-End "Double-Bezel" Bento Card
 * Implements Section 4.A of High-End Visual Design
 */
export const BentoCard = ({
  children,
  className,
  title,
  description,
  icon,
}: BentoCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "group relative flex flex-col p-2 rounded-[2rem] bg-zinc-900/50 dark:bg-zinc-900/20 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm overflow-hidden",
        className,
      )}
    >
      {/* Outer Shell Highlight */}
      <div className="absolute inset-0 pointer-events-none rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" />

      {/* Inner Core */}
      <div className="relative flex flex-col flex-1 bg-white dark:bg-[#09090b] rounded-[calc(2rem-0.5rem)] border border-zinc-200/50 dark:border-zinc-800/80 p-6 shadow-sm overflow-hidden">
        {/* Subtle Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-zinc-500/5 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          {(title || icon) && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {icon && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {icon}
                  </div>
                )}
                <div>
                  {title && (
                    <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {title}
                    </h3>
                  )}
                  {description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </motion.div>
  );
};
