// ✅ tryGetUserInfo with retry logic
async function tryGetUserInfo(tabId, retries = 0, maxRetries = 5) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "getUserInfo" }, (response) => {
      if (!chrome.runtime.lastError && response?.userInfo) {
        console.log("Got userInfo on attempt", retries + 1);
        resolve(response.userInfo);
        return;
      }
      if (retries < maxRetries) {
        console.log(`Retry ${retries + 1}/${maxRetries} waiting for userInfo...`);
        setTimeout(() => {
          tryGetUserInfo(tabId, retries + 1, maxRetries).then(resolve);
        }, 2000);
      } else {
        resolve(null);
      }
    });
  });
}

async function notify(runtime, message) {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const response = await chrome.tabs.sendMessage(tab.id, { message });
  console.log("Script Tab notify-->", response);
}

function sendUserInfo() {
  chrome.runtime.sendMessage({
    type: "initPopup",
    data: {
      userInfo: JSON.parse(localStorage.getItem("userInfo")),
      watiToken: localStorage.getItem("watifyToken"),
    },
  });
}

async function loginUser(phone, name, extensionId) {
  console.log("User name ->", name);
  console.log("User phone ->", phone);
  console.log("extension id ->", extensionId);
  const response = await fetch(
    `https://watify.io/checkPlan?loginUser=1&phone=${phone}&name=${name}&extensionId=${extensionId}`,
    { method: "GET" }
  );
  const data = await response.text();
  console.log("Script Tab-->", JSON.parse(data));
  return JSON.parse(data);
}

function initBlur(status) {
  console.log("Theme status-->", status);
  if (!status) return;
  if (status.theme === "dark") {
    document.getElementById("darkMode").checked = true;
  }
  if (status.blurUserNames) {
    document.getElementById("blurUserNames").checked = true;
  }
  if (status.blurMessages) {
    document.getElementById("blurMessages").checked = true;
  }
  if (status.blurProfile) {
    document.getElementById("blurProfile").checked = true;
  }
  if (status.blurConversation) {
    document.getElementById("blurConversation").checked = true;
  }
}

async function checkUserLogin(phone, name) {
  // ✅ Strip quotes and :8 device suffix defensively
  phone = (phone || "").replace(/"/g, "").split(":")[0].trim();
  name = (name || "").replace(/"/g, "").trim();

  console.log("checkUserLogin cleaned phone -->", phone);
  console.log("checkUserLogin cleaned name -->", name);

  if (!phone) {
    console.warn("checkUserLogin: phone is empty, aborting");
    return false;
  }

  const userLogin = await loginUser(phone, name, chrome.runtime.id);
  console.log("Script userLogin", userLogin);

  if (userLogin.status == 200) return userLogin.instanceId;

  document.getElementById("home-tab")?.remove();
  document.getElementById("myTab")?.remove();
  document.getElementById("invalid-user-tab")?.classList.remove("d-none");
  document.querySelector("body").style.height = "200px";
  document.querySelector("html").style.height = "200px";
  return false;
}

function showTools() {
  document.querySelector("body").style.height = "550px";
  document.querySelector("html").style.height = "550px";
  document.getElementById("home-tab")?.remove();
  document.getElementById("invalid-user-tab")?.remove();
  document.getElementById("myTab")?.classList.remove("disabled");
  document.querySelector(".tab-content")?.classList.remove("d-none");
  document.getElementById("bulkSendForm-tab")?.classList.add("active");
}

// ✅ single initPopup with null check
async function initPopup(data) {
  if (!data?.userInfo) {
    console.log("initPopup: userInfo is null, skipping");
    return;
  }

  const userInfo = data.userInfo;
  console.log("init userINFO popup", userInfo);

  const userDetails = document.getElementById("userDetails");
  userDetails.querySelector(".userName").textContent = userInfo.userName;
  userDetails.querySelector(".userPhone").textContent = userInfo.userPhone.phone;

  document.getElementById("whatsappConnectionError")?.remove();

  const status = userInfo.status;
  initBlur(status);

  const isLoggedIn = await checkUserLogin(
    userInfo.userPhone.phone,
    userInfo.userName
  );
  if (!isLoggedIn) return;

  console.log("✅ Token received from server:", isLoggedIn);

  // ✅ Save to both storages so both tabs can read it
  localStorage.setItem("watifyToken", isLoggedIn);
  chrome.storage.local.set({ watifyToken: isLoggedIn }, () => {
    console.log("✅ Token saved to chrome.storage.local");
  });

  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (!tab) {
    console.warn("No WhatsApp tab found to send token to");
    return;
  }
  console.log("Sending saveToken to WhatsApp tab:", tab.id);
  await chrome.tabs.sendMessage(tab.id, { message: { saveToken: isLoggedIn } });
  showTools();
}

// ✅ DOMContentLoaded with retry logic
document.addEventListener("DOMContentLoaded", () => {
  console.log("chrome runtime -->", chrome.runtime.id);

  chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, async (tabs) => {
    if (!tabs.length) {
      console.log("No WhatsApp tab found");
      document.getElementById("whatsappConnectionError").style.display = "flex";
      return;
    }

    const tab = tabs[0];
    console.log("WhatsApp tab found:", tab.id);

    const userInfo = await tryGetUserInfo(tab.id);
    console.log("userInfo from WhatsApp tab:", userInfo);

    if (userInfo) {
      initPopup({ userInfo });
      return;
    }

    console.log("Falling back to executeScript...");
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, func: sendUserInfo },
      () => {
        if (chrome.runtime.lastError) {
          console.log("executeScript failed:", chrome.runtime.lastError.message);
          document.getElementById("whatsappConnectionError").style.display = "flex";
        }
      }
    );
  });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("message on popup", request);
  if (request.type === "initPopup") {
    initPopup(request.data);
  }
  if (request.type === "updateBulkCamp") {
    const data = request.data;
    alert(`Bulk Camp Sent Successfully, Sent-> ${data.send}, Failed-> ${data.failed}`);
    const form = document.getElementById("bulkSendForm");
    form.reset();
    const btn = form.querySelector("#submitBtn");
    btn.textContent = "Send";
    btn.disabled = false;
  }
  if (request.type === "updateShootMsg") {
    console.log("update shoot msg", request.data);
    const data = request.data;
    if (data.failed == 0) {
      alert(`Message Sent Successfully`);
    } else {
      alert("Please recheck your data and try again");
    }
    const form = document.getElementById("shootMsgForm");
    const btn = form.querySelector("#shootMsgBtn");
    setTimeout(() => { btn.textContent = "Send"; }, 100);
    btn.disabled = false;
    form.reset();
  }
});