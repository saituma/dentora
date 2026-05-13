"use client";

import { useCallback, useEffect, useState } from "react";

export type ColorTheme = "default" | "emerald" | "rose" | "ocean";

const STORAGE_KEY = "dentora-admin-color-theme";

function applyTheme(theme: ColorTheme) {
  const html = document.documentElement;
  if (theme === "default") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", theme);
  }
}

export function useColorTheme() {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>("default");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
    const initial: ColorTheme =
      stored && ["default", "emerald", "rose", "ocean"].includes(stored)
        ? stored
        : "default";
    setColorThemeState(initial);
    applyTheme(initial);
  }, []);

  const setColorTheme = useCallback((theme: ColorTheme) => {
    setColorThemeState(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }, []);

  return { colorTheme, setColorTheme };
}
