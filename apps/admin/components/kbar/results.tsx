"use client";

import {
  type ActionId,
  type ActionImpl,
  KBarResults as KBarResultsPrimitive,
  useMatches,
} from "kbar";
import { cn } from "@/lib/utils";

function ResultItem({
  action,
  active,
  currentRootActionId,
}: {
  action: ActionImpl;
  active: boolean;
  currentRootActionId: ActionId | null | undefined;
}) {
  const ancestors = currentRootActionId
    ? (function collectAncestors(
        actionId: ActionId | null | undefined,
        acc: ActionImpl[] = [],
      ): ActionImpl[] {
        if (!actionId) return acc;
        const parent = action.ancestors.find((a) => a.id === actionId);
        if (!parent) return acc;
        return collectAncestors(parent.id, [parent, ...acc]);
      })(currentRootActionId)
    : [];

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
    >
      <div className="flex items-center gap-3 text-sm">
        {action.icon && (
          <span className="text-muted-foreground">{action.icon}</span>
        )}
        <span className="flex flex-col">
          <span>
            {ancestors.length > 0 && (
              <span className="mr-2 text-muted-foreground">
                {ancestors.map((a) => a.name).join(" › ")} ›
              </span>
            )}
            {action.name}
          </span>
          {action.subtitle && (
            <span className="text-xs text-muted-foreground">
              {action.subtitle}
            </span>
          )}
        </span>
      </div>
      {(action.shortcut?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1">
          {action.shortcut?.map((key) => (
            <kbd
              key={key}
              className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}

export function KBarResults() {
  const { results, rootActionId } = useMatches();

  return (
    <KBarResultsPrimitive
      items={results}
      onRender={({ item, active }) =>
        typeof item === "string" ? (
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {item}
          </div>
        ) : (
          <ResultItem
            action={item}
            active={active}
            currentRootActionId={rootActionId}
          />
        )
      }
    />
  );
}
