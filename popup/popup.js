import { 
  getProducts, addProduct, removeProduct, toggleProduct, 
  getSettings, saveSettings 
} from '../utils/storage.js';

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const addForm = document.getElementById('addForm');
const productList = document.getElementById('productList');
const productCount = document.getElementById('productCount');

const btnAddCurrent = document.getElementById('addCurrentPageBtn');
const btnShowForm = document.getElementById('showFormBtn');
const btnCancelAdd = document.getElementById('cancelAddBtn');
const btnSettings = document.getElementById('settingsBtn');
const btnBack = document.getElementById('backBtn');

const formNewProduct = document.getElementById('newProductForm');
const inputUrl = document.getElementById('url');
const inputTitle = document.getElementById('title');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  await loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  // Navigation
  btnSettings.addEventListener('click', () => {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  btnBack.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  // Add Product Form Toggles
  btnShowForm.addEventListener('click', () => {
    addForm.classList.remove('hidden');
    inputUrl.focus();
  });

  btnCancelAdd.addEventListener('click', () => {
    addForm.classList.add('hidden');
    formNewProduct.reset();
  });

  // "Add Current Page" Action
  btnAddCurrent.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Disable button to prevent double clicks while waiting
      btnAddCurrent.disabled = true;
      btnAddCurrent.textContent = 'Loading...';

      // Set a fallback in case content script never responds
      let settled = false;

      const fallback = setTimeout(() => {
        if (settled) return;
        settled = true;

        // Content script didn't respond in time — use tab info directly
        inputUrl.value = tab.url;
        inputTitle.value = tab.title || '';
        addForm.classList.remove('hidden');
        inputUrl.focus();

        resetAddButton();
      }, 1500);

      // Listen for content script response BEFORE injecting
      const messageListener = (msg) => {
        if (msg.action !== 'pageDataExtracted') return;
        if (settled) return;
        settled = true;

        clearTimeout(fallback);
        chrome.runtime.onMessage.removeListener(messageListener); // clean up

        inputUrl.value = msg.url;
        inputTitle.value = msg.title || '';
        addForm.classList.remove('hidden');
        inputUrl.focus();

        resetAddButton();
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Now inject the content script
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(err => {
        // Injection failed (e.g. chrome:// pages) — trigger fallback immediately
        if (settled) return;
        settled = true;

        clearTimeout(fallback);
        chrome.runtime.onMessage.removeListener(messageListener);

        inputUrl.value = tab.url;
        inputTitle.value = tab.title || '';
        addForm.classList.remove('hidden');
        inputUrl.focus();

        resetAddButton();
      });

    } catch (err) {
      console.error(err);
      alert('Cannot add this page (might be a restricted Chrome page).');
      resetAddButton();
    }
  });

  // Form Submit (Save Product)
  formNewProduct.addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = inputUrl.value.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      if (url.startsWith('https://localhost') || url.startsWith('https://127.0.0.1')) {
        url = url.replace('https://', 'http://');
      }
    }
    const title = inputTitle.value;
    const selector = document.getElementById('selector').value;
    const interval = parseInt(document.getElementById('interval').value, 10);

    const submitBtn = formNewProduct.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
      const product = await addProduct({ url, title, selector, interval });
      chrome.runtime.sendMessage({ action: 'productAdded', product });
      formNewProduct.reset();
      addForm.classList.add('hidden');
      await loadProducts();
    } catch (err) {
      alert('Error saving product');
      console.error(err);
    } finally {
      submitBtn.textContent = 'Save';
      submitBtn.disabled = false;
    }
  });

  // Settings Toggles
  document.getElementById('settingNotif').addEventListener('change', async (e) => {
    await saveSettings({ notificationsEnabled: e.target.checked });
  });

  document.getElementById('settingSound').addEventListener('change', async (e) => {
    await saveSettings({ soundEnabled: e.target.checked });
  });
}

/**
 * Reset the Add Current Page button back to its original state
 */
function resetAddButton() {
  btnAddCurrent.disabled = false;
  btnAddCurrent.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
    Add Current Page
  `;
}

/**
 * Load and render products
 */
async function loadProducts() {
  const products = await getProducts();
  productCount.textContent = `(${products.length})`;
  
  if (products.length === 0) {
    productList.innerHTML = `
      <div class="empty-state">
        <p>No products added yet.</p>
        <p class="sub-text">Click 'Add Current Page' on any product page.</p>
      </div>`;
    return;
  }

  productList.innerHTML = '';
  const template = document.getElementById('productTemplate');

  products.forEach(p => {
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.product-item');
    item.dataset.id = p.id;

    clone.querySelector('.product-title').textContent = p.title || 'Unknown Product';
    
    try {
      clone.querySelector('.product-domain').textContent = new URL(p.url).hostname.replace('www.', '');
    } catch {
      clone.querySelector('.product-domain').textContent = 'Invalid URL';
    }

    const badge = clone.querySelector('.status-badge');
    const statusText = clone.querySelector('.status-text');
    
    if (!p.enabled) {
      badge.className = 'status-badge paused';
      statusText.textContent = 'Paused';
    } else if (p.status === 'in-stock') {
      badge.className = 'status-badge in-stock';
      statusText.textContent = 'In Stock';
    } else if (p.status === 'out-of-stock') {
      badge.className = 'status-badge out-of-stock';
      statusText.textContent = 'Out of Stock';
    } else if (p.status === 'error') {
      badge.className = 'status-badge error';
      statusText.textContent = 'Error';
      badge.title = p.errorMessage || 'Check failed';
    } else {
      badge.className = 'status-badge unknown';
      statusText.textContent = 'Pending';
    }

    const timeText = p.lastChecked 
      ? new Date(p.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Never';
    clone.querySelector('.last-checked').textContent = `Checked: ${timeText}`;

    const toggleInput = clone.querySelector('.product-toggle');
    toggleInput.checked = p.enabled;
    toggleInput.addEventListener('change', async () => {
      const updatedP = await toggleProduct(p.id);
      chrome.runtime.sendMessage({ 
        action: p.enabled ? 'productRemoved' : 'productAdded', 
        productId: p.id,
        product: updatedP
      });
      chrome.runtime.sendMessage({ action: 'productUpdated' });
      await loadProducts();
    });

    clone.querySelector('.btn-test').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.classList.add('spin');
      chrome.runtime.sendMessage({ action: 'forceCheck', productId: p.id }, async (res) => {
        btn.classList.remove('spin');
        await loadProducts();
      });
    });

    clone.querySelector('.btn-link').addEventListener('click', () => {
      chrome.tabs.create({ url: p.url });
    });

    clone.querySelector('.btn-delete').addEventListener('click', async () => {
      if (confirm('Remove this product from monitoring?')) {
        await removeProduct(p.id);
        chrome.runtime.sendMessage({ action: 'productRemoved', productId: p.id });
        await loadProducts();
      }
    });

    productList.appendChild(clone);
  });
}

/**
 * Load Settings
 */
async function loadSettings() {
  const settings = await getSettings();
  document.getElementById('settingNotif').checked = settings.notificationsEnabled;
  document.getElementById('settingSound').checked = settings.soundEnabled;
}

// Refresh UI periodically to show updated statuses while popup is open
setInterval(loadProducts, 5000);