"use client";

import {
  type Action,
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider as KBarProviderPrimitive,
  KBarSearch,
} from "kbar";
import { useRouter } from "next/navigation";
import { KBarResults } from "./results";

const searchStyle = {
  padding: "12px 16px",
  fontSize: "16px",
  width: "100%",
  boxSizing: "border-box" as const,
  outline: "none",
  border: "none",
  background: "transparent",
  color: "var(--foreground)",
};

const animatorStyle = {
  maxWidth: "600px",
  width: "100%",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  borderRadius: "var(--radius-xl)",
  overflow: "hidden",
  boxShadow: "0 16px 70px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)",
};

export function KBarProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const actions: Action[] = [
    {
      id: "dashboard",
      name: "Dashboard",
      shortcut: ["g", "d"],
      keywords: "home overview",
      section: "Navigation",
      perform: () => router.push("/"),
    },
    {
      id: "clinics",
      name: "Clinics",
      shortcut: ["g", "c"],
      keywords: "tenants clinics",
      section: "Navigation",
      perform: () => router.push("/tenants"),
    },
    {
      id: "calls",
      name: "Calls",
      shortcut: ["g", "l"],
      keywords: "calls phone logs",
      section: "Navigation",
      perform: () => router.push("/calls"),
    },
    {
      id: "users",
      name: "Users",
      shortcut: ["g", "u"],
      keywords: "users accounts",
      section: "Navigation",
      perform: () => router.push("/users"),
    },
    {
      id: "audit",
      name: "Audit Log",
      shortcut: ["g", "a"],
      keywords: "audit log history",
      section: "Navigation",
      perform: () => router.push("/audit"),
    },
    {
      id: "logs",
      name: "Live Logs",
      shortcut: ["g", "v"],
      keywords: "live logs debug",
      section: "Navigation",
      perform: () => router.push("/logs"),
    },
    {
      id: "settings",
      name: "Settings",
      shortcut: ["g", "s"],
      keywords: "settings config",
      section: "Navigation",
      perform: () => router.push("/settings"),
    },
  ];

  return (
    <KBarProviderPrimitive actions={actions}>
      <KBarPortal>
        <KBarPositioner className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm">
          <KBarAnimator style={animatorStyle}>
            <KBarSearch
              style={searchStyle}
              defaultPlaceholder="Search or jump to…"
            />
            <KBarResults />
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </KBarProviderPrimitive>
  );
}
