import type React from "react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start justify-between gap-4",
        className,
      )}
    >
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((item, i) => (
              <span key={item.label} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-zinc-300 dark:text-zinc-700">/</span>
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-500">
                    {item.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
