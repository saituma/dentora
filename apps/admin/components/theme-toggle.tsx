"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themes = [
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-8 w-[104px]" />;
  }

  return (
    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-0.5 gap-0.5">
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          title={label}
          className={`flex items-center justify-center h-7 w-8 rounded-md transition-all ${
            theme === value
              ? "bg-white dark:bg-white/15 text-zinc-900 dark:text-white shadow-sm"
              : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
