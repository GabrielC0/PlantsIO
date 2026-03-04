/**
 * Gestionnaire de services multiples sur le même port
 *
 * Inspiré du pattern SoWeCode / GalerieSX :
 * - Toutes les routes API nécessitent le préfixe  /plantsio
 * - Le middleware supprime le préfixe AVANT que les routers Express ne voient la requête
 * - Routes publiques accessibles sans préfixe : /health, /
 *
 * Exemples :
 *   /plantsio/api/v1/system/state  → /api/v1/system/state
 *   /plantsio/health               → /health
 *   /health                        → autorisé sans préfixe
 */

import { Request, Response, NextFunction } from 'express'

export const SERVICE_PREFIX_PLANTSIO = 'plantsio'

// Routes minimales accessibles SANS préfixe (health-check brut)
const PUBLIC_ROUTES_NO_PREFIX = ['/', '/health']

// Activation du préfixe obligatoire via variable d'env
// SERVICE_PREFIX_ENABLED=true  → toutes les routes API nécessitent /plantsio
// SERVICE_PREFIX_ENABLED=false → préfixe optionnel, compatibilité backward (défaut)
export const SERVICE_PREFIX_ENABLED =
  (process.env.SERVICE_PREFIX_ENABLED ?? 'false').toLowerCase() === 'true'

/**
 * Extrait le préfixe de service du chemin de la requête.
 */
export function extractServicePrefix(rawPath: string): {
  hasPrefix: boolean
  cleanPath: string
} {
  const cleanPath = rawPath.split('?')[0]
  const segments  = cleanPath.split('/').filter(Boolean)

  if (segments[0] === SERVICE_PREFIX_PLANTSIO) {
    const pathWithoutPrefix = '/' + segments.slice(1).join('/')
    return { hasPrefix: true, cleanPath: pathWithoutPrefix || '/' }
  }

  return { hasPrefix: false, cleanPath }
}

/**
 * Middleware de routage par préfixe de service.
 * Réécrit req.url en supprimant le préfixe /plantsio avant de passer la main.
 */
export function serviceRouterMiddleware(
  req:  Request,
  res:  Response,
  next: NextFunction,
): void {
  const originalPath = req.path
  const { hasPrefix, cleanPath } = extractServicePrefix(originalPath)

  // Préfixes désactivés → on passe directement
  if (!SERVICE_PREFIX_ENABLED) {
    ;(req as any).serviceInfo = {
      prefix: null,
      originalPath,
      routedPath: originalPath,
    }
    return next()
  }

  // Requête AVEC le bon préfixe → réécrire l'URL et passer la main
  if (hasPrefix) {
    const qs   = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    req.url    = cleanPath + qs
    ;(req as any).serviceInfo = {
      prefix: SERVICE_PREFIX_PLANTSIO,
      originalPath,
      routedPath: cleanPath,
    }
    return next()
  }

  // Routes publiques minimales autorisées sans préfixe
  if (PUBLIC_ROUTES_NO_PREFIX.includes(cleanPath)) {
    ;(req as any).serviceInfo = {
      prefix: null,
      originalPath,
      routedPath: originalPath,
    }
    return next()
  }

  // Toutes les autres routes sans préfixe → 403
  res.status(403).json({
    success: false,
    error:   'Préfixe de service requis',
    message: `La route "${originalPath}" nécessite le préfixe /${SERVICE_PREFIX_PLANTSIO}`,
    hint:    `Utilisez /${SERVICE_PREFIX_PLANTSIO}${originalPath}`,
    code:    'PREFIX_REQUIRED',
  })
}
