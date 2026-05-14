/**
 * Content Script for on-demand extraction
 * Injected when the user clicks "Add Current Page" in the popup
 */

(function() {
  // Prevent multiple injections
  if (window.stockMonitorInjected) {
    sendPageData();
    return;
  }
  
  window.stockMonitorInjected = true;

  function sendPageData() {
    // Extract basic page info
    const pageData = {
      action: 'pageDataExtracted',
      url: window.location.href,
      title: document.title.split(' - ')[0].split(' | ')[0].trim(), // Clean up title slightly
    };
    
    try {
      // Send back to popup
      chrome.runtime.sendMessage(pageData, (response) => {
         // handle if needed but popup might be closed
         console.log('[Stock Monitor] Data sent to extension');
      });
    } catch (err) {
      console.warn('[Stock Monitor] Extension context invalid or closed', err);
    }
  }

  // Execute immediately
  sendPageData();
})();