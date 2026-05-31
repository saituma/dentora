import type { Middleware } from '@reduxjs/toolkit';

export const soundMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  if (typeof window === 'undefined') return result;

  const type = (action as { type?: string }).type ?? '';
  const isMutationFulfilled = type.includes('executeMutation') && type.endsWith('/fulfilled');
  const isMutationRejected = type.includes('executeMutation') && type.endsWith('/rejected');

  if (isMutationFulfilled) {
    import('@/lib/sounds').then(({ playSound }) => void playSound('success', 0.5));
  } else if (isMutationRejected) {
    import('@/lib/sounds').then(({ playSound }) => void playSound('tool-call', 0.4));
  }

  return result;
};
