// chrome.runtime.setUninstallURL(
//   "https://watify.io/feedback?user=" + chrome.runtime.id
// );

// // Handle extension updates (Disabled for now)
// // chrome.runtime.onInstalled.addListener((details) => {
// //   if (details.reason !== "update") return;

// //   const { version: currentVersion } = chrome.runtime.getManifest();
// //   const { previousVersion } = details;

// //   if (!previousVersion || currentVersion === previousVersion) return;

// //   chrome.tabs.create({
// //     url: `https://watify.io/whats-new?version=${currentVersion}&previousVersion=${previousVersion}`,
// //   });
// // });

// // Initialize WebSocket connection
// let ws = new WebSocket("wss://socket.digitalprominds.com");

// console.log("WebSocket initialized");

// try {
//   function toReconnectSocket() {
//     setTimeout(() => {
//       if (ws.readyState != 1) {
//         console.log("Reconnecting to WebSocket");
//         ws = new WebSocket("wss://socket.digitalprominds.com");
//       }
//     }, 2000);
//   }

//   self.addEventListener("online", (e) => {
//     toReconnectSocket();
//   });
// } catch (error) {
//   console.log("Error occurred while reconnecting WebSocket:", error);
// }

// ws.onopen = function () {
//   console.log("Connected to the server");

//   setInterval(() => {
//     ws.send(`ping`);
//   }, 50000);
// };

// let instanceToken = "";

// ws.onmessage = (event) => {
//   if (event.data == "ping" || event.data == "Welcome New Client!") {
//     return;
//   }
//   let data = JSON.parse(event.data);

//   chrome.storage.local.get("watifyToken", (result) => {
//     instanceToken = result.watifyToken;
//   });

//   // console.log(data);

//   if (
//     data.broadcast_channel === "watify-extension" &&
//     data.action === "RUN_SCRIPT" &&
//     instanceToken !== "" &&
//     data.data.INSTANCE_ID === instanceToken
//   ) {
//     console.log("Webhook triggered:", data.data);
//     chrome.tabs.query({}, (tabs) => {
//       let isSent = false;
//       tabs.forEach((tab) => {
//         if (!isSent && tab.url && tab.url.includes("web.whatsapp.com")) {
//           isSent = true;
//           chrome.tabs.sendMessage(tab.id, {
//             action: "triggerWebhookFunction",
//             body: data.data,
//           });
//         }
//       });
//     });
//   }
// };

// Set uninstall URL
chrome.runtime.setUninstallURL(
  "https://watify.io/feedback?user=" + chrome.runtime.id
);

// ---------------------------
// WebSocket Setup
// ---------------------------

let ws = null;
let reconnectTimeout = null;

function connectWebSocket() {
  console.log("Connecting WebSocket...");

  ws = new WebSocket("wss://socket.digitalprominds.com");

  ws.onopen = function () {
    console.log("✅ Connected to WebSocket");

    // Keep alive ping
    setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send("ping");
      }
    }, 50000);
  };

  ws.onmessage = function (event) {
    if (event.data === "ping" || event.data === "Welcome New Client!") {
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.log("Invalid JSON:", event.data);
      return;
    }

    // ✅ FIX: Move logic inside storage callback
    chrome.storage.local.get("watifyToken", (result) => {
      const instanceToken = result.watifyToken;

      if (
        data.broadcast_channel === "watify-extension" &&
        data.action === "RUN_SCRIPT" &&
        instanceToken &&
        data.data.INSTANCE_ID === instanceToken
      ) {
        console.log("🚀 Webhook triggered:", data.data);

        chrome.tabs.query({}, (tabs) => {
          let isSent = false;

          tabs.forEach((tab) => {
            if (
              !isSent &&
              tab.url &&
              tab.url.includes("web.whatsapp.com")
            ) {
              isSent = true;

              sendMessageWithRetry(tab.id, {
                action: "triggerWebhookFunction",
                body: data.data,
              });
            }
          });
        });
      }
    });
  };

  ws.onclose = function () {
    console.log("❌ WebSocket closed. Reconnecting...");
    scheduleReconnect();
  };

  ws.onerror = function (error) {
    console.log("⚠️ WebSocket error:", error);
    ws.close();
  };
}

// ---------------------------
// Retry Logic for Messaging
// ---------------------------

function sendMessageWithRetry(tabId, message, retries = 3) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      if (retries > 0) {
        console.log("⏳ Retrying message...", retries);

        setTimeout(() => {
          sendMessageWithRetry(tabId, message, retries - 1);
        }, 500);
      } else {
        console.log("❌ Failed to send message after retries");
      }
    }
  });
}

// ---------------------------
// Reconnect Logic
// ---------------------------

function scheduleReconnect() {
  if (reconnectTimeout) return;

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectWebSocket();
  }, 2000);
}

// ---------------------------
// Handle Online Event
// ---------------------------

self.addEventListener("online", () => {
  console.log("🌐 Back online, reconnecting WebSocket...");
  connectWebSocket();
});

// ---------------------------
// Start WebSocket
// ---------------------------

connectWebSocket();