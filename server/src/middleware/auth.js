import { forbidden, unauthorized } from '../lib/httpError.js';
import { verifySessionToken } from '../lib/sessionToken.js';

const getBearerToken = (request) => {
  const value = request.headers.authorization;
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

export const requireAuth = (request, _response, next) => {
  try {
    request.user = verifySessionToken(getBearerToken(request));
    next();
  } catch (error) {
    next(error instanceof Error ? error : unauthorized());
  }
};

export const requireAdmin = (request, _response, next) => {
  try {
    request.user = verifySessionToken(getBearerToken(request));
    if (request.user.role !== 'admin') {
      throw forbidden('Admin access required');
    }
    next();
  } catch (error) {
    next(error instanceof Error ? error : unauthorized());
  }
};
