# Stock Monitor Chrome Extension

A lightweight, automated Chrome extension that monitors product pages for stock availability changes and gives you instant notifications when an item comes back in stock. Never miss out on a restock again!

## ✨ Features

- **Automated Background Tracking:** Continuously monitors your selected product URLs at user-defined intervals without needing keeping the page open.
- **Instant Notifications:** Get instant, native Chrome push notifications combined with optional audio alerts the second an out-of-stock item becomes available.
- **Smart Status Detection:** Uses HTML parsing and confidence scoring to accurately differentiate between "in-stock" and "out-of-stock" states.
- **Customizable Checks:** Set a custom CSS selector to target specific checkout/add-to-cart buttons for edge-case websites, and adjust the check interval (e.g., every 5 minutes) per product.
- **Anti-Blocking System:** Built-in network jitter and exponential backoff mechanisms to prevent IP bans or throttling from the target merchant's servers.
- **Offscreen Audio Handling:** Uses Chrome's Offscreen API under the hood to reliably play alert notification sounds, even when the browser is minimized.

## 🚀 Installation 

Since this extension is not currently on the Chrome Web Store, you can easily install it by loading it as an "Unpacked Extension".

1. Download or clone this repository to your computer:
   ```bash
   git clone https://github.com/your-username/stock-monitor-extension.git
   ```
2. Open Google Chrome and type `chrome://extensions/` into the URL bar.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder where you cloned/downloaded this repository.
6. The extension is now installed! You should see the Stock Monitor icon in your browser's extension toolbar.

## 🛠️ Usage

1. Click on the Stock Monitor extension icon in your toolbar to open the popup.
2. Click **"Add Product"** and paste the URL of the product you want to track.
3. (Optional) Provide a specific CSS block selector if the default detection heuristics don't catch the stock status (e.g., `#add-to-cart-button`).
4. Set your desired **Check Interval** (how often the extension will check the page).
5. Ensure the item is toggled "On". You can now close the popup and let it run in the background.

## 📁 Project Structure

- `manifest.json`: Configuration and permissions for the Chrome Extension (Manifest V3).
- `background.js`: Main service worker handling the alarms, fetch requests, and background logic.
- `content.js`: Scripts injected into web pages if needed for deeper scraping contexts.
- `popup/`: Contains the HTML/CSS/JS for the user interface you see when clicking the extension icon.
- `utils/`: Modules orchestrating core functionalities:
  - `anti-block.js`: Fetch logic handling request jitter and backoffs.
  - `detector.js`: Heuristics and confidence scoring mapping for "in stock" and "out of stock" text detection.
  - `notifier.js`: Manages sending visual Chrome notifications and creating an offscreen document for audio.
  - `storage.js`: Wrappers on `chrome.storage.local` to securely persist the product lists and settings.
- `sounds/`: Contains the audio alerts triggered upon stock refills.
- `offscreen.html`: Hidden document used exclusively for playing audio seamlessly with MV3 specifications.

## ⚠️ Important Note About Scraping

This extension performs direct HTTP requests (GET) to merchants' product pages from your computer's IP address. While anti-blocking mechanisms (like jitter and backoffs) are included, aggressive checking intervals (e.g., fetching a page every 1 minute) might get your IP temporarily throttled or blocked by some websites. Please use reasonable intervals (5-15+ minutes) based on how strict the target website's rate limits are.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
