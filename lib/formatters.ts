// lib/formatters.ts

/**
 * Escape a string for safe inclusion in HTML element/attribute content.
 * Use this for ANY value derived from user input or the database before
 * interpolating it into an HTML template.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a single CSV cell value.
 * - Coerces to string
 * - Escapes embedded double quotes by doubling them
 * - Wraps in double quotes
 * - Prefixes leading =, +, -, @ with a single quote to prevent
 *   spreadsheet formula injection (CSV injection)
 */
export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Formats a Unix timestamp, Date object, or date string into a standardized UTC format.
 * Handles null or invalid inputs gracefully.
 * @param timestamp The date value to format (Unix timestamp in seconds, Date, or string).
 * @param placeholder The string to return for invalid or null inputs.
 * @returns A formatted date string (e.g., "YYYY-MM-DD HH:mm:ss UTC") or the placeholder.
 */
export function formatTimestamp(timestamp: number | Date | string | null | undefined, placeholder: string = 'N/A'): string {
  if (timestamp === null || timestamp === undefined || timestamp === 0) {
    return placeholder;
  }

  let date;
  if (typeof timestamp === 'number') {
    // Assuming the number is a Unix timestamp in seconds
    date = new Date(timestamp * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) {
    return placeholder;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Converts a timestamp into a human-readable relative time string (e.g., "5 minutes ago").
 * @param timestamp The date value to format (Unix timestamp in seconds, Date, or string).
 * @param placeholder The string to return for invalid or null inputs.
 * @returns A relative time string or the placeholder.
 */
export function timeAgo(timestamp: number | Date | string | null | undefined, placeholder: string = 'N/A'): string {
  if (timestamp === null || timestamp === undefined || timestamp === 0) {
    return placeholder;
  }

  let date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) {
    return placeholder;
  }

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000; // years
  if (interval > 1) {
    return Math.floor(interval) + " years ago";
  }
  interval = seconds / 2592000; // months
  if (interval > 1) {
    return Math.floor(interval) + " months ago";
  }
  interval = seconds / 86400; // days
  if (interval > 1) {
    return Math.floor(interval) + " days ago";
  }
  interval = seconds / 3600; // hours
  if (interval > 1) {
    return Math.floor(interval) + " hours ago";
  }
  interval = seconds / 60; // minutes
  if (interval > 1) {
    return Math.floor(interval) + " minutes ago";
  }
  if (seconds < 10) {
    return "just now";
  }
  return Math.floor(seconds) + " seconds ago";
}
