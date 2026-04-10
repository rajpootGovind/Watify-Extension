(() => {
  chrome.runtime.onMessage.addListener(
    async (message, sender, sendResponse) => {
      
      if (message.type === "initPopup") {
        return;
      }

      // ✅ ADD THIS
      if (message.type === "getUserInfo") {
        const userInfo = JSON.parse(localStorage.getItem("userInfo"));
        sendResponse({ userInfo });
        return true;
      }

      if (message.manageUi) {
        const ui = message.manageUi.ui;
      }
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
            sendResponse(response);
          });
        });
      } catch (error) {}

      return true;
    }
  );
})();