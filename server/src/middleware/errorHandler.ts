import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../types'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data:    null,
      error:   { code: err.code, message: err.message },
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      data:    null,
      error: {
        code:    'VALIDATION_ERROR',
        message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      },
    })
    return
  }

  console.error('[Error]', err)
  res.status(500).json({
    success: false,
    data:    null,
    error:   { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' },
  })
}
