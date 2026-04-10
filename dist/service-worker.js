// const user = {
//   username: "demo-user",
// };

// chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
//   // console.log("inside worker ");
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
//       sendResponse(response);
//     });
//   });

//   return true; // Indicate that the response will be sent asynchronously
// });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Content script not ready, retrying...");

        // Retry after small delay
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
            sendResponse(retryResponse);
          });
        }, 500);
      } else {
        sendResponse(response);
      }
    });
  });

  return true;
});