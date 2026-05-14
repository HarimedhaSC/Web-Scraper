/**
 * Storage Manager — Chrome Storage CRUD for products & settings
 */

const DEFAULT_SETTINGS = {
  defaultInterval: 60,       // seconds
  soundEnabled: true,
  notificationsEnabled: true,
  maxConcurrentChecks: 3,
  minInterval: 60,           // minimum allowed interval in seconds (Chrome alarms API enforces 1 min minimum)
};

/**
 * Generate a unique ID for a product
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Create a new product entry with defaults
 */
export function createProduct({ url, title = '', selector = '', interval = 60 }) {
  return {
    id: generateId(),
    url: url.trim(),
    title: title || extractDomain(url),
    selector: selector.trim(),
    interval: Math.max(interval, DEFAULT_SETTINGS.minInterval),
    status: 'unknown',       // 'in-stock' | 'out-of-stock' | 'unknown' | 'error'
    previousStatus: 'unknown',
    lastChecked: null,
    lastStatusChange: null,
    enabled: true,
    errorCount: 0,
    errorMessage: '',
    createdAt: Date.now(),
  };
}

/**
 * Extract domain name from URL for display
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ─── Product CRUD ──────────────────────────────────────────────

export async function getProducts() {
  const { products = [] } = await chrome.storage.local.get('products');
  return products;
}

export async function saveProducts(products) {
  await chrome.storage.local.set({ products });
}

export async function addProduct(productData) {
  const products = await getProducts();
  const product = createProduct(productData);
  products.push(product);
  await saveProducts(products);
  return product;
}

export async function removeProduct(id) {
  let products = await getProducts();
  products = products.filter(p => p.id !== id);
  await saveProducts(products);
  return products;
}

export async function updateProduct(id, updates) {
  const products = await getProducts();
  const index = products.findIndex(p => p.id === id);
  if (index === -1) return null;
  products[index] = { ...products[index], ...updates };
  await saveProducts(products);
  return products[index];
}

export async function getProductById(id) {
  const products = await getProducts();
  return products.find(p => p.id === id) || null;
}

export async function toggleProduct(id) {
  const product = await getProductById(id);
  if (!product) return null;
  return updateProduct(id, { enabled: !product.enabled });
}

// ─── Settings ──────────────────────────────────────────────────

export async function getSettings() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

// ─── Bulk Status Update ────────────────────────────────────────

export async function updateProductStatus(id, status, errorMessage = '') {
  const updates = {
    previousStatus: undefined,  // will be set below
    status,
    lastChecked: Date.now(),
    errorMessage,
  };

  const product = await getProductById(id);
  if (!product) return null;

  updates.previousStatus = product.status;

  if (status !== product.status) {
    updates.lastStatusChange = Date.now();
  }

  if (status === 'error') {
    updates.errorCount = (product.errorCount || 0) + 1;
  } else {
    updates.errorCount = 0;
  }

  return updateProduct(id, updates);
}