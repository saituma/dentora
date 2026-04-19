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

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={cn('w-full min-w-0', className)}>
      <ol className="flex min-w-0 items-start justify-between gap-0">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li
              key={step.id}
              className={cn(
                'relative flex min-w-0 flex-1 items-start',
                index !== steps.length - 1 && 'pr-0.5 sm:pr-1'
              )}
            >
              <div className="flex w-full min-w-0 flex-col items-center gap-1 sm:gap-1.5">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-colors',
                    isComplete &&
                    'border-primary bg-primary text-primary-foreground',
                    isCurrent &&
                    'border-primary bg-primary/15 text-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]',
                    !isComplete &&
                    !isCurrent &&
                    'border-muted-foreground/20 bg-background text-muted-foreground'
                  )}
                >
                  {isComplete ? (
                    <CheckIcon className="size-3.5 sm:size-4" />
                  ) : (
                    <span className="font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'max-w-full break-words text-center text-[9px] font-medium leading-tight sm:text-[10px]',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index !== steps.length - 1 && (
                <div
                  className={cn(
                    'absolute left-8 top-4 h-0.5 -translate-y-1/2',
                    isComplete ? 'bg-primary' : 'bg-border'
                  )}
                  style={{ width: 'calc(100% - 2rem)' }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
