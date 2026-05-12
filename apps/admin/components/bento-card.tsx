"use client";

import { motion } from "framer-motion";
import type React from "react";
import { cn } from "@/lib/utils";

export type BentoColor =
  | "default"
  | "blue"
  | "yellow"
  | "pink"
  | "purple"
  | "green"
  | "dark";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  color?: BentoColor;
}

const bgMap: Record<BentoColor, string> = {
  default: "bg-white border-black/[0.07]",
  blue: "border-blue-200/60 [background:linear-gradient(135deg,#BDE9FF_0%,#E9F5FF_100%)]",
  yellow:
    "border-amber-200/60 [background:linear-gradient(135deg,#FFE495_0%,#FFF8DF_100%)]",
  pink: "border-rose-200/60 [background:linear-gradient(135deg,#FCCECE_0%,#FFF0F0_100%)]",
  purple:
    "border-purple-200/60 [background:linear-gradient(135deg,#E4A6FC_0%,#F5E5FF_100%)]",
  green:
    "border-emerald-200/60 [background:linear-gradient(135deg,#A7F3D0_0%,#F0FDF4_100%)]",
  dark: "bg-[#0D0D0D] border-white/[0.07]",
};

const titleMap: Record<BentoColor, string> = {
  default: "text-zinc-900",
  blue: "text-blue-950",
  yellow: "text-amber-950",
  pink: "text-rose-950",
  purple: "text-purple-950",
  green: "text-emerald-950",
  dark: "text-white",
};

const descMap: Record<BentoColor, string> = {
  default: "text-zinc-500",
  blue: "text-blue-800/70",
  yellow: "text-amber-800/70",
  pink: "text-rose-800/70",
  purple: "text-purple-800/70",
  green: "text-emerald-800/70",
  dark: "text-white/50",
};

const iconBgMap: Record<BentoColor, string> = {
  default: "bg-black/5 text-zinc-600",
  blue: "bg-blue-800/10 text-blue-800",
  yellow: "bg-amber-800/10 text-amber-800",
  pink: "bg-rose-800/10 text-rose-800",
  purple: "bg-purple-800/10 text-purple-800",
  green: "bg-emerald-800/10 text-emerald-800",
  dark: "bg-white/10 text-white",
};

export const BentoCard = ({
  children,
  className,
  title,
  description,
  icon,
  color = "default",
}: BentoCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-2xl border overflow-hidden p-6",
        "shadow-[0px_1px_2px_rgba(0,0,0,0.04),0px_2px_8px_rgba(0,0,0,0.03)]",
        bgMap[color],
        className,
      )}
    >
      {(title || icon) && (
        <div className="flex items-center gap-2.5 mb-4">
          {icon && (
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
                iconBgMap[color],
              )}
            >
              {icon}
            </div>
          )}
          <div>
            {title && (
              <h3
                className={cn(
                  "text-sm font-semibold tracking-tight",
                  titleMap[color],
                )}
              >
                {title}
              </h3>
            )}
            {description && (
              <p className={cn("text-xs mt-0.5", descMap[color])}>
                {description}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="flex-1">{children}</div>
    </motion.div>
  );
};
