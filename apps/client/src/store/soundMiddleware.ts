import type { Middleware } from '@reduxjs/toolkit';

export const soundMiddleware: Middleware = () => (next) => (action) => next(action);
