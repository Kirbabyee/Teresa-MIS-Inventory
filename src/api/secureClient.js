/**
 * Secure API Client
 *
 * A hardened fetch wrapper that:
 * 1. Automatically attaches auth tokens from Supabase session
 * 2. Injects CSRF protection headers
 * 3. Obfuscates sensitive error details from the UI
 * 4. Handles 401/403 responses with automatic session cleanup
 * 5. Enforces request timeouts
 * 6. Validates response content types
 *
 * NOTE: For httpOnly cookie-based auth (recommended), the token
 * is handled automatically by the browser. This client supports
 * both cookie and header-based auth patterns.
 */

import { supabase } from '@/api/supabaseClient';

// Generic safe error messages that don't leak server internals
const SAFE_ERROR_MESSAGES = {
  400: 'Invalid request. Please check your input and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  408: 'The request timed out. Please try again.',
  409: 'A conflict occurred. Please refresh and try again.',
  413: 'The submitted data is too large.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'An internal server error occurred. Please try again later.',
  502: 'The server is temporarily unavailable. Please try again later.',
  503: 'The service is currently unavailable. Please try again later.',
  504: 'The server took too long to respond. Please try again.',
  NETWORK_ERROR: 'Network connection failed. Please check your internet connection.',
  TIMEOUT: 'The request took too long. Please try again.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Get a safe, user-friendly error message.
 * Never exposes raw server error details to the UI.
 */
function getSafeErrorMessage(status, serverMessage) {
  // In development, you might want to log the real error
  if (import.meta.env.DEV && serverMessage) {
    console.error(`[API Error ${status}]:`, serverMessage);
  }
  return SAFE_ERROR_MESSAGES[status] || SAFE_ERROR_MESSAGES.UNKNOWN;
}

/**
 * Generate a CSRF token from the session.
 * In production, this should come from your backend.
 */
function generateCsrfToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create a CSRF token stored in sessionStorage.
 */
function getCsrfToken() {
  if (typeof window === 'undefined') return '';
  let token = sessionStorage.getItem('csrf_token');
  if (!token) {
    token = generateCsrfToken();
    sessionStorage.setItem('csrf_token', token);
  }
  return token;
}

/**
 * Clear all auth-related storage on security events.
 */
function clearAuthState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('app_session');
  sessionStorage.removeItem('csrf_token');
  window.dispatchEvent(new Event('app_session_change'));
}

/**
 * Main secure fetch wrapper.
 */
export async function secureFetch(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    skipAuth = false,
    skipCsrf = false,
    ...fetchOptions
  } = options;

  // Build secure headers
  const headers = new Headers(fetchOptions.headers || {});

  // Set content type if not already set and body exists
  if (fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // CSRF protection header
  if (!skipCsrf) {
    headers.set('X-CSRF-Token', getCsrfToken());
  }

  // Request ID for tracing (useful for server-side logging)
  headers.set('X-Request-ID', crypto.randomUUID());

  // Attach auth token from Supabase session
  if (!skipAuth) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
    } catch {
      // If we can't get the session, proceed without auth header
      // The server will reject with 401 if auth is required
    }
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
      credentials: 'same-origin', // Include cookies for httpOnly cookie auth
    });

    clearTimeout(timeoutId);

    // Handle security-critical status codes
    if (response.status === 401) {
      clearAuthState();
      await supabase.auth.signOut();
      throw {
        status: 401,
        message: SAFE_ERROR_MESSAGES[401],
        isSecurityError: true,
      };
    }

    if (response.status === 403) {
      throw {
        status: 403,
        message: SAFE_ERROR_MESSAGES[403],
        isSecurityError: true,
      };
    }

    if (response.status === 429) {
      throw {
        status: 429,
        message: SAFE_ERROR_MESSAGES[429],
        isSecurityError: false,
      };
    }

    // For other error statuses, parse the response but sanitize the message
    if (!response.ok) {
      let serverMessage = '';
      try {
        const errorBody = await response.json();
        serverMessage = errorBody?.error || errorBody?.message || '';
      } catch {
        // Response wasn't JSON, that's fine
      }

      throw {
        status: response.status,
        message: getSafeErrorMessage(response.status, serverMessage),
        isSecurityError: false,
      };
    }

    // Validate response content type to prevent content sniffing attacks
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json') && !contentType.includes('text/')) {
      console.warn(`[Security] Unexpected content type: ${contentType} from ${url}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error.name === 'AbortError') {
      throw {
        status: 408,
        message: SAFE_ERROR_MESSAGES.TIMEOUT,
        isSecurityError: false,
      };
    }

    // Handle network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw {
        status: 0,
        message: SAFE_ERROR_MESSAGES.NETWORK_ERROR,
        isSecurityError: false,
      };
    }

    // Re-throw already-formatted errors
    if (error.status && error.message) {
      throw error;
    }

    // Unknown error
    throw {
      status: 0,
      message: SAFE_ERROR_MESSAGES.UNKNOWN,
      isSecurityError: false,
    };
  }
}

/**
 * Convenience methods for common HTTP operations
 */
export const secureApi = {
  get: (url, options = {}) => secureFetch(url, { ...options, method: 'GET' }),

  post: (url, body, options = {}) =>
    secureFetch(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: (url, body, options = {}) =>
    secureFetch(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: (url, body, options = {}) =>
    secureFetch(url, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (url, options = {}) => secureFetch(url, { ...options, method: 'DELETE' }),
};

export default secureApi;
