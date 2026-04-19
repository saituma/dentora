'use client';

import { cn } from '@/lib/utils';

const DENTORA_SRC = '/dentora.png';

type DentoraProgressLogoProps = {
  progressPercent: number;
  className?: string;
};

/**
 * Dentora mark beside onboarding progress: fully blurred at 0%, with a clockwise
 * pie-slice revealing the sharp logo as progress approaches 100%.
 */
export function DentoraProgressLogo({ progressPercent, className }: DentoraProgressLogoProps) {
  const p = Math.min(100, Math.max(0, progressPercent));
  const revealDeg = (p / 100) * 360;
  const mask = `conic-gradient(from -90deg, #000 0deg, #000 ${revealDeg}deg, transparent 0)`;

  return (
    <div
      className={cn('relative size-11 shrink-0 overflow-hidden rounded-full ring-1 ring-primary/25', className)}
      aria-hidden
    >
      <img
        src={DENTORA_SRC}
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover blur-md"
        draggable={false}
      />
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
        }}
      >
        <img src={DENTORA_SRC} alt="" className="size-full object-cover" draggable={false} />
      </div>
    </div>
  );
}
