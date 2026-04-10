// Bridge between page ↔ extension

// Listen from page (bundle.js)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data.type === "SAVE_USER_INFO") {
    chrome.runtime.sendMessage({
      type: "SAVE_USER_INFO",
      data: event.data.data,
    });
  }

  if (event.data.type === "GET_USER_INFO") {
    chrome.storage.local.get(["userInfo"], (result) => {
      window.postMessage(
        {
          type: "RETURN_USER_INFO",
          data: result.userInfo || null,
        },
        "*"
      );
    });
  }

   // ✅ NEW: handle token save request from bundle.js (MAIN world can't call chrome.storage)
  if (event.data._saveToken) {
    chrome.storage.local.set({ watifyToken: event.data._saveToken });
  }
});

// Listen from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle getUserInfo from popup
  if (request.type === "getUserInfo") {
    chrome.storage.local.get(["userInfo"], (result) => {
      sendResponse({ userInfo: result.userInfo || null });
    });
    return true; // keep channel open for async sendResponse
  }

  // ✅ THE MISSING BRIDGE: forward { message } payloads from popup into the page
  // popup calls chrome.tabs.sendMessage(tabId, { message: { manageUi/saveToken/sendMsg/... } })
  // inject.js and bundle.js listen for window.postMessage({ message: ... }) in the page
  if (request.message) {
    window.postMessage({ message: request.message }, "*");
  }
});