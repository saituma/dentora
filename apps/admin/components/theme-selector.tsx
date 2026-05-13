"use client";

import { Check } from "lucide-react";
import { type ColorTheme, useColorTheme } from "@/hooks/use-color-theme";
import { cn } from "@/lib/utils";

const themes: { value: ColorTheme; label: string; color: string }[] = [
  { value: "default", label: "Default", color: "bg-zinc-500" },
  { value: "emerald", label: "Emerald", color: "bg-emerald-500" },
  { value: "rose", label: "Rose", color: "bg-rose-500" },
  { value: "ocean", label: "Ocean", color: "bg-blue-500" },
];

export function ThemeSelector() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {themes.map((t) => (
        <button
          key={t.value}
          type="button"
          title={t.label}
          onClick={() => setColorTheme(t.value)}
          className={cn(
            "relative flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110",
            t.color,
          )}
        >
          {colorTheme === t.value && (
            <Check className="size-3 text-white stroke-[3]" />
          )}
          <span className="sr-only">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
