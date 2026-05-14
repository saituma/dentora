import { cn } from "@/lib/utils";

type Variant =
  | "active"
  | "suspended"
  | "archived"
  | "completed"
  | "in_progress"
  | "started"
  | "failed"
  | "escalated"
  | "platform_admin"
  | "owner"
  | "admin"
  | "manager"
  | "viewer"
  | "healthy"
  | "down"
  | "starter"
  | "professional"
  | "enterprise"
  | string;

const variantClasses: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  healthy: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  completed: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  in_progress: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  started: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  suspended: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  escalated: "bg-orange-500/10 text-orange-500 dark:text-orange-400",
  failed: "bg-rose-500/10 text-rose-500 dark:text-rose-400",
  down: "bg-rose-500/10 text-rose-500 dark:text-rose-400",
  archived: "bg-zinc-500/10 text-zinc-500",
  platform_admin: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  owner: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  admin: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400",
  manager: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400",
  viewer: "bg-zinc-500/10 text-zinc-500",
  enterprise: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  professional: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  starter: "bg-zinc-500/10 text-zinc-400",
};

interface StatusBadgeProps {
  value: Variant | null | undefined;
  label?: string;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  value,
  label,
  dot = false,
  className,
}: StatusBadgeProps) {
  const safeValue = value ?? "";
  const cls = variantClasses[safeValue] ?? "bg-zinc-500/10 text-zinc-400";
  const text = label ?? safeValue.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
        cls,
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            safeValue === "in_progress" || safeValue === "started"
              ? "animate-pulse"
              : "",
            cls
              .replace(/text-\S+/, "")
              .replace("bg-", "bg-")
              .split(" ")[0]
              .replace("/10", ""),
          )}
          style={{ backgroundColor: "currentColor" }}
        />
      )}
      {text}
    </span>
  );
}
