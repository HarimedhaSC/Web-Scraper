/**
 * Stock Status Detector
 * Detects whether a product page indicates in-stock or out-of-stock
 * using keyword matching and optional CSS selector / XPath evaluation.
 */

// ─── Out-of-stock indicators (case-insensitive) ───────────────

const OUT_OF_STOCK_KEYWORDS = [
  'out of stock',
  'sold out',
  'currently unavailable',
  'not available',
  'unavailable',
  'notify me when available',
  'notify me',
  'coming soon',
  'pre-order',
  'preorder',
  'temporarily out of stock',
  'out of print',
  'no longer available',
  'not in stock',
  'stock out',
  'backorder',
  'back order',
  'waiting list',
  'waitlist',
  'register interest',
  'email when available',
  'alert me',
  'notify when in stock',
];

// ─── In-stock indicators ──────────────────────────────────────

const IN_STOCK_KEYWORDS = [
  'add to cart',
  'add to bag',
  'buy now',
  'buy it now',
  'add to basket',
  'in stock',
  'available',
  'ships from',
  'ready to ship',
  'order now',
  'shop now',
  'get it by',
  'delivery by',
  'pick up today',
  'usually ships',
  'in stock.',
  'left in stock',
  'only \\d+ left',
];

/**
 * Detect stock status from raw HTML string using keyword analysis
 * @param {string} html - Raw HTML of the product page
 * @returns {{ inStock: boolean, confidence: number, matchedText: string, method: string }}
 */
export function detectByKeywords(html) {
  const text = stripHtml(html).toLowerCase();

  // Score-based approach: check out-of-stock signals vs in-stock signals
  let outScore = 0;
  let inScore = 0;
  let matchedOut = '';
  let matchedIn = '';

  for (const keyword of OUT_OF_STOCK_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(text)) {
      outScore++;
      if (!matchedOut) matchedOut = keyword;
    }
  }

  for (const keyword of IN_STOCK_KEYWORDS) {
    const regex = new RegExp(keyword, 'i');
    if (regex.test(text)) {
      inScore++;
      if (!matchedIn) matchedIn = keyword;
    }
  }

  // Determine status based on scores
  // Out-of-stock keywords typically override in-stock keywords
  // because many pages show "Add to Cart" even when out of stock (greyed out)
  if (outScore > 0 && outScore >= inScore) {
    return {
      inStock: false,
      confidence: Math.min(outScore / 3, 1),
      matchedText: matchedOut,
      method: 'keyword',
    };
  }

  if (inScore > 0) {
    return {
      inStock: true,
      confidence: Math.min(inScore / 3, 1),
      matchedText: matchedIn,
      method: 'keyword',
    };
  }

  // Couldn't determine — default to unknown (treat as out of stock to avoid false positives)
  return {
    inStock: false,
    confidence: 0,
    matchedText: '',
    method: 'keyword',
  };
}

/**
 * Detect stock status from HTML using a user-provided CSS selector
 * Works on parsed DOM (used in content script context)
 * @param {Document} doc - Parsed document
 * @param {string} selector - CSS selector
 * @returns {{ inStock: boolean, confidence: number, matchedText: string, method: string }}
 */
export function detectBySelector(doc, selector) {
  try {
    let element;

    // Check if it looks like XPath
    if (selector.startsWith('/') || selector.startsWith('(')) {
      const result = doc.evaluate(selector, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      element = result.singleNodeValue;
    } else {
      element = doc.querySelector(selector);
    }

    if (!element) {
      return {
        inStock: false,
        confidence: 0.3,
        matchedText: 'Selector element not found',
        method: 'selector',
      };
    }

    const text = (element.textContent || '').trim().toLowerCase();
    const isHidden = element.offsetHeight === 0 || 
                     element.style.display === 'none' || 
                     element.style.visibility === 'hidden';

    // Check if the element contains out-of-stock text
    for (const keyword of OUT_OF_STOCK_KEYWORDS) {
      if (new RegExp(keyword, 'i').test(text)) {
        return {
          inStock: false,
          confidence: 0.9,
          matchedText: keyword,
          method: 'selector',
        };
      }
    }

    // Check if the element contains in-stock text
    for (const keyword of IN_STOCK_KEYWORDS) {
      if (new RegExp(keyword, 'i').test(text)) {
        return {
          inStock: true,
          confidence: 0.9,
          matchedText: keyword,
          method: 'selector',
        };
      }
    }

    // If element exists and is visible with text, consider it in-stock indicator
    if (text && !isHidden) {
      return {
        inStock: true,
        confidence: 0.5,
        matchedText: text.substring(0, 100),
        method: 'selector',
      };
    }

    return {
      inStock: false,
      confidence: 0.3,
      matchedText: 'Element empty or hidden',
      method: 'selector',
    };
  } catch (err) {
    return {
      inStock: false,
      confidence: 0,
      matchedText: `Selector error: ${err.message}`,
      method: 'selector',
    };
  }
}

/**
 * Combined detection: tries selector first (if provided), falls back to keywords
 * @param {string} html - Raw HTML string
 * @param {string} [selector] - Optional CSS selector
 * @returns {{ inStock: boolean, confidence: number, matchedText: string, method: string }}
 */
export function detectStockStatus(html, selector = '') {
  // If a selector is provided, try parsing and using it
  if (selector) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const result = detectBySelector(doc, selector);
      if (result.confidence > 0.3) {
        return result;
      }
      // Fall through to keyword detection if selector was inconclusive
    } catch {
      // Fall through to keyword detection
    }
  }

  return detectByKeywords(html);
}

/**
 * Strip HTML tags for keyword analysis
 */
function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
