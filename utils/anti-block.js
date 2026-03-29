/**
 * Anti-Blocking Utilities
 * Header rotation, rate limiting, and request disguising
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9',
  'en-US,en;q=0.9,es;q=0.8',
  'en,en-US;q=0.9',
  'en-US,en;q=0.8,fr;q=0.6',
];

const ACCEPT_HEADERS = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
];

/**
 * Get randomised fetch headers to avoid detection
 * @param {string} [refererUrl] - URL to use as referer
 * @returns {HeadersInit}
 */
export function getRandomHeaders(refererUrl = '') {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const lang = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
  const accept = ACCEPT_HEADERS[Math.floor(Math.random() * ACCEPT_HEADERS.length)];

  const headers = {
    'User-Agent': ua,
    'Accept': accept,
    'Accept-Language': lang,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  if (refererUrl) {
    try {
      const origin = new URL(refererUrl).origin;
      headers['Referer'] = origin + '/';
    } catch { /* ignore */ }
  }

  return headers;
}

/**
 * Calculate back-off delay based on consecutive error count
 * @param {number} errorCount - Number of consecutive errors
 * @param {number} baseInterval - Base interval in seconds
 * @returns {number} Delay in seconds
 */
export function getBackoffDelay(errorCount, baseInterval) {
  if (errorCount <= 0) return baseInterval;
  // Exponential backoff: base * 2^errors, capped at 30 minutes
  const delay = baseInterval * Math.pow(2, Math.min(errorCount, 6));
  return Math.min(delay, 1800);
}

/**
 * Add random jitter to an interval to avoid pattern detection
 * @param {number} intervalSeconds - Base interval
 * @returns {number} Interval with jitter in seconds
 */
export function addJitter(intervalSeconds) {
  const jitter = intervalSeconds * 0.2; // ±20%
  return intervalSeconds + (Math.random() * jitter * 2 - jitter);
}

/**
 * Minimum safe polling interval (seconds)
 */
export const MIN_INTERVAL = 10;

/**
 * Recommended default interval (seconds)
 */
export const DEFAULT_INTERVAL = 60;

/**
 * Fetch a page with anti-blocking headers and timeout
 * @param {string} url - URL to fetch
 * @param {number} [timeoutMs=15000] - Timeout in milliseconds
 * @returns {Promise<{ html: string, status: number }>}
 */
export async function fetchPage(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getRandomHeaders(url),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return { html, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
