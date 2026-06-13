/**
 * Security Module — Central Export
 *
 * Defense-in-depth security utilities for the Teresa MIS Inventory system.
 * These are frontend defenses; backend MUST always re-validate.
 *
 * Modules:
 * - sanitize   : Input sanitization & validation (XSS, HTML injection, SQL injection)
 * - sessionTimeout : Inactivity-based session timeout with warning modal
 */

export {
  stripHtml,
  escapeHtml,
  containsDangerousContent,
  sanitizeString,
  sanitizeEmail,
  sanitizeName,
  validatePasswordStrength,
  sanitizeOtp,
  sanitizeUrl,
  sanitizeField,
} from './sanitize';

export {
  useSessionTimeout,
  formatRemainingTime,
} from './sessionTimeout';
