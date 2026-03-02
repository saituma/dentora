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
    <nav aria-label="Progress" className={cn('w-full', className)}>
      <ol className="flex items-start justify-between">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li
              key={step.id}
              className={cn(
                'relative flex flex-1 items-start',
                index !== steps.length - 1 && 'pr-8 sm:pr-12'
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2 text-sm transition-colors',
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
                    <CheckIcon className="size-4" />
                  ) : (
                    <span className="font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-center text-[11px] font-medium leading-tight',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index !== steps.length - 1 && (
                <div
                  className={cn(
                    'absolute left-9 top-[18px] h-0.5 w-full -translate-y-1/2',
                    isComplete ? 'bg-primary' : 'bg-border'
                  )}
                  style={{ width: 'calc(100% - 2.25rem)' }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
