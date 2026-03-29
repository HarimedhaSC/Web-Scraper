/**
 * Notification Manager
 * Handles Chrome Notifications API with duplicate prevention and click-to-open
 */

// Cooldown tracker: productId → last notification timestamp
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between notifications for same product

/**
 * Send a Chrome notification for a stock change
 * @param {Object} params
 * @param {string} params.productId - Product ID for dedup
 * @param {string} params.title - Product title
 * @param {string} params.url - Product URL
 * @param {string} params.message - Notification body
 * @param {boolean} params.soundEnabled - Whether to play alert sound
 */
export async function sendStockNotification({ productId, title, url, message, soundEnabled = true }) {
  // Check cooldown
  const sessionKey = `cooldown_${productId}`;
  const sessionData = await chrome.storage.local.get(sessionKey);
  const lastNotified = sessionData[sessionKey];
  
  if (lastNotified && (Date.now() - lastNotified) < COOLDOWN_MS) {
    console.log(`[Notifier] Skipping notification for ${productId} — cooldown active`);
    return false;
  }

  const notificationId = `stock-monitor-${productId}-${Date.now()}`;

  try {
    // Extract domain for subtitle
    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch { domain = ''; }

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '🟢 Back In Stock!',
      message: `${title}\n${domain}\n\n${message || 'This product is now available!'}`,
      priority: 2,
      requireInteraction: true,  // Stay visible until user dismisses
      silent: !soundEnabled,
    });

    // Store URL mapping for click handler
    await chrome.storage.local.set({ [`notif_${notificationId}`]: url });

    // Update cooldown
    await chrome.storage.local.set({ [sessionKey]: Date.now() });

    console.log(`[Notifier] Notification sent for ${title}`);

    // Play sound via offscreen document if enabled
    if (soundEnabled) {
      playAlertSound();
    }

    return true;
  } catch (err) {
    console.error('[Notifier] Failed to send notification:', err);
    return false;
  }
}

/**
 * Handle notification click — open product page
 */
export function setupNotificationListeners() {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    try {
      const key = `notif_${notificationId}`;
      const data = await chrome.storage.local.get(key);
      const url = data[key];

      if (url) {
        await chrome.tabs.create({ url, active: true });
        await chrome.storage.local.remove(key);
      }

      chrome.notifications.clear(notificationId);
    } catch (err) {
      console.error('[Notifier] Click handler error:', err);
    }
  });

  chrome.notifications.onClosed.addListener(async (notificationId) => {
    const key = `notif_${notificationId}`;
    await chrome.storage.local.remove(key);
  });
}

/**
 * Attempt to play alert sound using offscreen document
 */
async function playAlertSound() {
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Playing stock alert notification sound',
      });
    }

    // Send message to offscreen document to play sound
    chrome.runtime.sendMessage({ action: 'playSound' });
  } catch (err) {
    console.warn('[Notifier] Could not play alert sound:', err.message);
  }
}

/**
 * Clear cooldown for a specific product (useful when re-enabling monitoring)
 */
export async function clearCooldown(productId) {
  const sessionKey = `cooldown_${productId}`;
  await chrome.storage.local.remove(sessionKey);
}
