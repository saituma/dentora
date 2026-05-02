'use client';

import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

interface Step {
  id: string;
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

/** Circle size in px (size-8) — keep in sync with connector math below */
const NODE_PX = 32;
const NODE_RADIUS = NODE_PX / 2;

/** Minimum column width so labels + nodes fit; total min width triggers horizontal scroll on narrow viewports */
const MIN_COL_PX = 64;

export function Stepper({ steps, currentStep, className }: StepperProps) {
  const minTrackPx = steps.length * MIN_COL_PX;

  return (
    <div className={cn('w-full min-w-0 max-w-full', className)}>
      <nav
        aria-label="Progress"
        className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] pb-0.5"
      >
        <ol
          className="grid min-w-0 gap-x-0"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            width: `max(100%, ${minTrackPx}px)`,
          }}
        >
          {steps.map((step, index) => {
            const isComplete = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <li key={step.id} className="relative flex min-w-0 flex-col items-center">
                <div className="flex w-full min-w-0 flex-col items-center gap-0.5 sm:gap-1">
                  <div
                    className={cn(
                      'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-medium leading-none transition-colors',
                      isComplete &&
                        'border-primary bg-primary text-primary-foreground',
                      isCurrent &&
                        'border-primary bg-primary/15 text-primary shadow-[0_0_0_6px_hsl(var(--primary)/0.12)]',
                      !isComplete &&
                        !isCurrent &&
                        'border-muted-foreground/20 bg-background text-muted-foreground'
                    )}
                  >
                    {isComplete ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'min-w-0 w-full px-0.5 text-center text-[8px] font-medium leading-tight sm:text-[9px]',
                      isCurrent ? 'text-foreground' : 'text-muted-foreground'
                    )}
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  >
                    {step.label}
                  </span>
                </div>
                {index !== steps.length - 1 && (
                  <div
                    className={cn(
                      'pointer-events-none absolute top-4 z-0 h-px -translate-y-1/2',
                      isComplete ? 'bg-primary' : 'bg-border'
                    )}
                    style={{
                      left: `calc(50% + ${NODE_RADIUS}px)`,
                      width: `calc(50% - ${NODE_RADIUS}px)`,
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
