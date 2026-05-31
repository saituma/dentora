import type { Middleware } from '@reduxjs/toolkit';

// No global query sounds — too noisy on page load/background refetches.
// Typing sound is only played in specific tool call handlers (voice agent page).
export const soundMiddleware: Middleware = () => (next) => (action) => next(action);
