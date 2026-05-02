
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors.js';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        if (req.query && typeof req.query === 'object') {
          const queryObject = req.query as Record<string, unknown>;
          for (const key of Object.keys(queryObject)) {
            delete queryObject[key];
          }
          Object.assign(queryObject, parsedQuery);
        }
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Record<string, string>;
      }
      next();
    } catch (error) {
      const zodError = error as ZodError;
      const details = zodError.issues?.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      next(new ValidationError('Request validation failed', details));
    }
  };
}
