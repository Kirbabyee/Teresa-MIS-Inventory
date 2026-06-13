/**
 * Input Sanitization Utilities
 * Defense Layer #1: Prevent XSS, HTML injection, and SQL injection at the frontend level.
 * NOTE: Frontend sanitization is a convenience layer — backend MUST always re-validate.
 */

// Characters/patterns that indicate injection attempts
const DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,           // onclick=, onerror=, onload=, etc.
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<svg[\s>]/i,
  /<img[^>]+onerror/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
  /url\s*\(\s*['"]?\s*javascript/i,
  /data\s*:\s*text\/html/i,
  /--\s/,                  // SQL comment
  /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|UNION)\b/i,
];

/**
 * Strips all HTML tags from a string.
 */
export const stripHtml = (input) => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
};

/**
 * Escapes HTML entities to prevent XSS when rendering user content.
 */
export const escapeHtml = (input) => {
  if (!input || typeof input !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
  };
  return input.replace(/[&<>"'`/]/g, (char) => map[char] || char);
};

/**
 * Detects potentially dangerous patterns in input.
 * Returns true if input contains suspicious content.
 */
export const containsDangerousContent = (input) => {
  if (!input || typeof input !== 'string') return false;
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(input));
};

/**
 * Sanitizes a string for safe use.
 * - Trims whitespace
 * - Strips HTML tags
 * - Collapses multiple spaces
 * - Enforces max length
 */
export const sanitizeString = (input, { maxLength = 500 } = {}) => {
  if (!input || typeof input !== 'string') return '';
  let cleaned = input.trim();
  cleaned = stripHtml(cleaned);
  cleaned = cleaned.replace(/\s+/g, ' ');
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
};

/**
 * Sanitizes an email address.
 * Only allows standard email characters.
 */
export const sanitizeEmail = (input) => {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim().toLowerCase();
  // RFC 5322 simplified pattern
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailPattern.test(trimmed)) return '';
  if (containsDangerousContent(trimmed)) return '';
  return trimmed;
};

/**
 * Sanitizes a name field (first name, last name).
 * Only allows letters, spaces, hyphens, and apostrophes.
 */
export const sanitizeName = (input) => {
  if (!input || typeof input !== 'string') return '';
  let cleaned = input.trim();
  cleaned = stripHtml(cleaned);
  // Remove anything that isn't a letter, space, hyphen, or apostrophe
  cleaned = cleaned.replace(/[^a-zA-Z\s\-'\.]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  if (containsDangerousContent(cleaned)) return '';
  return cleaned.slice(0, 100);
};

/**
 * Validates password strength.
 * Returns an object with validation results.
 */
export const validatePasswordStrength = (password) => {
  const value = String(password || '');
  return {
    minLength: value.length >= 8,
    hasLowercase: /[a-z]/.test(value),
    hasUppercase: /[A-Z]/.test(value),
    hasNumber: /\d/.test(value),
    hasSymbol: /[^A-Za-z0-9]/.test(value),
    score: [
      value.length >= 8,
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ].filter(Boolean).length,
    isStrong: value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
  };
};

/**
 * Sanitizes an OTP input (digits only).
 */
export const sanitizeOtp = (input, length = 8) => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/\D/g, '').slice(0, length);
};

/**
 * Validates a URL to prevent open redirect attacks.
 * Only allows http/https protocols.
 */
export const sanitizeUrl = (input) => {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  if (containsDangerousContent(trimmed)) return '';
  return trimmed;
};

/**
 * Generic form field sanitizer.
 * Applies the appropriate sanitization based on field type.
 */
export const sanitizeField = (value, fieldType) => {
  switch (fieldType) {
    case 'email':
      return sanitizeEmail(value);
    case 'name':
      return sanitizeName(value);
    case 'password':
      return String(value || '').slice(0, 128); // Don't modify passwords, just limit length
    case 'otp':
      return sanitizeOtp(value);
    case 'url':
      return sanitizeUrl(value);
    default:
      return sanitizeString(value);
  }
};
