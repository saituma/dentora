import type { Middleware } from '@reduxjs/toolkit';

export const soundMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  if (typeof window === 'undefined') return result;

  const type = (action as { type?: string }).type ?? '';
  const isQueryPending = type.includes('executeQuery') && type.endsWith('/pending');
  const isQueryDone =
    (type.includes('executeQuery') && type.endsWith('/fulfilled')) ||
    (type.includes('executeQuery') && type.endsWith('/rejected'));

  if (isQueryPending) {
    import('@/lib/sounds').then(({ startLoadingSound }) => void startLoadingSound());
  } else if (isQueryDone) {
    import('@/lib/sounds').then(({ stopLoadingSound }) => stopLoadingSound());
  }

  return result;
};
