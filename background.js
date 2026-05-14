import { fetchPage, addJitter, getBackoffDelay } from './utils/anti-block.js';
import { detectStockStatus } from './utils/detector.js';
import { sendStockNotification, setupNotificationListeners, clearCooldown } from './utils/notifier.js';
import { 
  getProducts, 
  getProductById, 
  updateProductStatus, 
  getSettings 
} from './utils/storage.js';

// Setup click listeners for Chrome notifications
setupNotificationListeners();

// ─── Concurrency Queue ─────────────────────────────────────────
let activeChecks = 0;
const checkQueue = [];

/**
 * Wrap a productId check in the concurrency queue.
 * Resolves when the check eventually runs and completes.
 * @param {string} productId
 * @returns {Promise<void>}
 */
function enqueueCheck(productId) {
  return new Promise((resolve, reject) => {
    checkQueue.push({ productId, resolve, reject });
    processQueue();
  });
}

/**
 * Drain the queue up to maxConcurrentChecks slots.
 */
async function processQueue() {
  const settings = await getSettings();
  const maxConcurrent = settings.maxConcurrentChecks ?? 3;

  while (checkQueue.length > 0 && activeChecks < maxConcurrent) {
    const { productId, resolve, reject } = checkQueue.shift();
    activeChecks++;
    checkProductStatus(productId)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeChecks--;
        processQueue();
      });
  }
}

/**
 * Handle extension installation / update
 */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Initialise default settings (handled in storage.js on first get)
    await getSettings();
    console.log('[Background] Extension installed and initialized');
  }
  
  // Re-register alarms on update/install
  await registerAllAlarms();
});

/**
 * Handle startup -> make sure alarms are set
 */
chrome.runtime.onStartup.addListener(async () => {
  await registerAllAlarms();
});

/**
 * Register alarms for all currently enabled products
 */
async function registerAllAlarms() {
  const products = await getProducts();
  
  // Clear existing to avoid duplicates/orphans
  await chrome.alarms.clearAll();
  
  let activeCount = 0;
  for (const product of products) {
    if (product.enabled) {
      createAlarm(product);
      activeCount++;
    }
  }
  console.log(`[Background] Registered alarms for ${activeCount} active products`);
}

/**
 * Create an alarm for a specific product
 * @param {Object} product
 */
function createAlarm(product) {
  // Convert seconds to minutes for Chrome alarms API
  // Minimum period for Chrome alarms is 1 minute in production, 
  // but we can use delayInMinutes for initial offset
  const intervalMinutes = product.interval / 60;
  
  // Add some jitter to the initial delay to avoid thundering herd
  const initialDelayMintues = Math.max((addJitter(product.interval) / 60), 1);

  chrome.alarms.create(`check-${product.id}`, {
    delayInMinutes: initialDelayMintues,
    periodInMinutes: intervalMinutes
  });
}

/**
 * Handle alarm triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('check-')) {
    const productId = alarm.name.replace('check-', '');
    await enqueueCheck(productId);
  }
});

/**
 * Core Logic: Fetch, Detect, Notify
 * @param {string} productId 
 */
async function checkProductStatus(productId) {
  const product = await getProductById(productId);
  
  if (!product || !product.enabled) {
    // Clean up dead alarms
    chrome.alarms.clear(`check-${productId}`);
    return;
  }

  try {
    console.log(`[Background] Checking status for: ${product.title}`);
    
    // Check backoff
    const settings = await getSettings();
    const backoffDelay = getBackoffDelay(product.errorCount || 0, product.interval);
    
    // If we've recorded a recent error, we might need to skip this run 
    // depending on the backoff delay vs when we last checked
    if (product.errorCount > 0 && product.lastChecked) {
      const msSinceLastCheck = Date.now() - product.lastChecked;
      if (msSinceLastCheck < (backoffDelay * 1000)) {
        console.log(`[Background] Skipping check due to backoff (${Math.round(backoffDelay)}s)`);
        return;
      }
    }

    // 1. Fetch page
    const { html } = await fetchPage(product.url);
    
    // 2. Detect stock status
    const result = detectStockStatus(html, product.selector);
    const newStatus = result.inStock ? 'in-stock' : 'out-of-stock';
    
    console.log(`[Background] Status: ${newStatus} (Confidence: ${result.confidence.toFixed(2)}, Match: "${result.matchedText}")`);

    // 3. Update storage and check for transitions
    const updatedProduct = await updateProductStatus(productId, newStatus, '');
    
    if (!updatedProduct) return;

    // 4. Trigger Notification logic
    // ONLY notify if: transitioned from out-of-stock to in-stock
    // Also notify if previous was unknown and it's suddenly in-stock (first run)
    const wasUnavailable = updatedProduct.previousStatus === 'out-of-stock' || updatedProduct.previousStatus === 'error';
    const isNowAvailable = newStatus === 'in-stock';

    if (wasUnavailable && isNowAvailable) {
      if (settings.notificationsEnabled) {
        await sendStockNotification({
          productId: product.id,
          title: product.title,
          url: product.url,
          soundEnabled: settings.soundEnabled
        });
      }
    }

  } catch (err) {
    console.error(`[Background] Error checking ${productId}:`, err);
    await updateProductStatus(productId, 'error', err.message);
  }
}

/**
 * Message routing from Popup / Content Scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'forceCheck') {
    // Triggered manually from popup
    enqueueCheck(request.productId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'productAdded' || request.action === 'productUpdated') {
    // Re-register alarms when products change
    registerAllAlarms();
    // If new product added, do an immediate check
    if (request.action === 'productAdded' && request.product && request.product.id) {
       enqueueCheck(request.product.id);
    }
    sendResponse({ success: true });
    return false;
  }
  
  if (request.action === 'productRemoved') {
    chrome.alarms.clear(`check-${request.productId}`);
    clearCooldown(request.productId);
    sendResponse({ success: true });
    return false;
  }
  
  if (request.action === 'closeOffscreen') {
    chrome.offscreen.closeDocument().catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'playSound') {
    // Message normally routed to offscreen document
    // If background gets it, return true to let others handle
    sendResponse({ success: true });
    return false;
  }

});