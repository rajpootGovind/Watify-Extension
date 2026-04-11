import { fetchUserPlan } from "../dist/js/userInfo";
import { saveCampaign } from "../dist/js/saveForm";
console.log("Index file sctarted....");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getUserInfo") {
    const userInfoStr = localStorage.getItem("userInfo");
    // const userInfoStr = chrome.storage.local.get(["userInfo"], (result) => {
    //   console.log("Popup userInfo:", result.userInfo);
    // });
    sendResponse({ 
      userInfo: userInfoStr ? JSON.parse(userInfoStr) : null 
    });
    window.postMessage({ message }, "*");
    return true;
  }
});

// function getToken() {
//   return new Promise((resolve) => {
//     chrome.storage.local.get("watifyToken", (result) => {
//       resolve(result.watifyToken);
//     });
//   });
// }

async function getToken() {
  // Try localStorage first (WhatsApp tab context)
  const lsToken = localStorage.getItem("watifyToken");
  if (lsToken) return lsToken;

  // Fallback: try chrome.storage.local (extension tab context)
  return new Promise((resolve) => {
    chrome.storage.local.get("watifyToken", (result) => {
      resolve(result.watifyToken || null);
    });
  });
}

async function waitForToken() {
  let token = null;
  while (!token) {
    token = await getToken();
    if (!token) {
      console.log("⏳ Waiting for token...");
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  return token; // ✅ add this
}

console.log("SEcond log in index");
window.postMessage({ greeting: "Hello from index.js" }, "*");

async function loginUser(phone, name) {
  console.log("index login0-->", phone, name);
  const response = await fetch(
    `https://watify.io/checkPlan?loginUser=1&phone=${phone}&name=${name}`,
    { method: "GET" }
  );
  const data = await response.text();
  const userLogin = JSON.parse(data);
  console.log("index login-->", JSON.parse(data));
  
  // ✅ Save to BOTH storages so both tabs can read it
  localStorage.setItem("watifyToken", userLogin.instanceId);
  chrome.storage.local.set({ watifyToken: userLogin.instanceId }); // ADD THIS LINE

  window.postMessage({ message: { saveToken: userLogin.instanceId } }, "*");
  const userPlan = await fetchUserPlan(userLogin.instanceId);
  window.postMessage({ message: { setUserPlan: userPlan } }, "*");
}

async function saveAnalytics(data) {
  console.log("Index analytics-->", data);
  const res = await fetch("https://watify.io/fun/extFun/manageBulk", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
  console.log("Index analytics-->", res.text());
  return await res.text();
}

async function fetchChatBots(token) {
  console.log("Index chatbots-->", token);
  let chatBotsRes = await fetch(
    `https://watify.io/fun/watifyExtApi?getChatbots=1&token=${token}&activeBots=1`
  );
  let chatBots = await chatBotsRes.text();
  chatBots = JSON.parse(chatBots);
  console.log("Index chatbots-->", chatBots);
  if (chatBots.status == 200) {
    for (let i = 0; i < chatBots.data.length; i++) {
      const bot = chatBots.data[i];
      bot.msg_media = await convertUrlToFile(bot.msg_media);
      chatBots.data[i] = bot;
    }
    console.log("Index chatbots-->", chatBots.data);
    return chatBots.data;
  } else return false;
}

async function fetchFlowCharts(token) {
  let flowChartsRes = await fetch(
    `https://watify.io/fun/watifyExtApi?getFlowcharts=1&token=${token}&activeBots=1`
  );
  let flowCharts = await flowChartsRes.text();
  flowCharts = JSON.parse(flowCharts);
  if (flowCharts.status == 200) {
    console.log("Index flowcharts-->", flowCharts.data);
    return flowCharts.data;
  } else return false;
}

async function fetchMessageTemplate(token) {
  console.log("temp token-->", token);
  let messageTempRes = await fetch(
    `https://watify.io/fun/watifyExtApi?getMessageTemplate=1&token=${token}`
  );
  let messageTemp = await messageTempRes.text();
  messageTemp = JSON.parse(messageTemp);
  console.log("message temp-->", messageTemp);
  if (messageTemp.status == 200) {
    for (let i = 0; i < messageTemp.data.length; i++) {
      const temp = messageTemp.data[i];
      temp.media = await convertUrlToFile(temp.media);
      messageTemp.data[i] = temp;
    }
    updateTemplateSelector(messageTemp.data);
    console.log("Index Templates-->", messageTemp.data);
    return messageTemp.data;
  } else return false;
}

function updateTemplateSelector(templates) {
  const templateSelector = document.querySelectorAll(".messageTemplates");
  if (templateSelector.length == 0) return;
  templateSelector.forEach((selector) => {
    selector.innerHTML = "";
    if (templates.length == 0) {
      const option = document.createElement("option");
      option.value = "";
      option.disabled = true;
      option.selected = true;
      option.innerText = "No templates found, Add new template";
      selector.appendChild(option);
    }
    templates.forEach((temp) => {
      const option = document.createElement("option");
      option.value = temp.temp_slug;
      option.innerText = temp.name;
      selector.appendChild(option);
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("File is undefined")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        file: reader.result,
        ext: file.name.split(".").pop().toLowerCase(),
        fileType: file.type,
        filename: file.name,
      });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

async function convertUrlToFile(mediaUrl) {
  try {
    if (mediaUrl == "") return "";
    const response = await fetch(`https://watify.io/mediaFiles/${mediaUrl}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
    });
    if (!response.ok) throw new Error(`Failed to fetch: ${response}`);
    const blob = await response.blob();
    const urlParts = mediaUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const file = new File([blob], filename, { type: blob.type });
    return await fileToBase64(file);
  } catch (error) {
    console.error("Error creating file object:", error);
    return "";
  }
}

window.addEventListener("message", async (event) => {
  // ✅ CHANGE 1: Reply to token requests from inject.js (MAIN world can't use chrome.*)
  if (event.data?._getToken) {
    const token = await getToken();
    window.postMessage({ _tokenReply: event.data._getToken, token }, "*");
    return;
  }

  if (event.data.manageUiForward) {
  // handled by bundle.js — ignore in index.js
  return;
}

  await waitForToken();
  if (!location.href.includes("web.whatsapp.com")) return;
  console.log("EVENT DATA1 ________________________________________________________=>", event.data);

  if (event.data.updateBulkCamp) {
    const token = await getToken();
    await waitForToken();
    const res = await saveAnalytics(event.data.updateBulkCamp);
    const data = JSON.parse(res);
    const campData = event.data.updateBulkCamp;
    if (data.status == 200) {
      try { chrome.runtime.sendMessage({ type: "updateBulkCamp", data: campData }); } catch (e) {}
      saveAnalytics({
        saveAnalytics: 1, slug: campData.slug, total: campData.total,
        send: campData.send, failed: campData.failed, sender: "bulk_messenger", token,
      });
    }
  } else if (event.data.updateShootMsg) {
    const res = await saveAnalytics(event.data.updateShootMsg);
    const token = await getToken();
    const data = JSON.parse(res);
    const campData = event.data.updateShootMsg;
    if (data.status == 200) {
      try { chrome.runtime.sendMessage({ type: "updateShootMsg", data: campData }); } catch (e) {}
      saveAnalytics({
        saveAnalytics: 1, slug: campData.slug, total: campData.total,
        send: campData.send, failed: campData.failed, sender: "shoot_msg", token,
      });
    }
  } else if (event.data.loginUser) {
    loginUser(event.data.loginUser.phone, event.data.loginUser.name);
  } else if (event.data.fetchChatBots) {
    let chatBots = await fetchChatBots(event.data.fetchChatBots);
    window.postMessage({ message: { chatBots } }, "*");
  } else if (event.data.fetchFlowCharts) {
    let flowCharts = await fetchFlowCharts(event.data.fetchFlowCharts);
    window.postMessage({ message: { flowCharts } }, "*");
  } else if (event?.data?.messageTemplates) {
    console.log("EVENT DATA2 ________________________________________________________=>", event.data);
    await waitForToken();
    const token = await getToken();
    let templates = await fetchMessageTemplate(token);
    window.postMessage({ message: { templates } }, "*");
  } else if (event.data.updateChatBot) {
    await saveAnalytics(event.data.updateChatBot);
  } else if (event.data.updateFlowChart) {
    await saveAnalytics(event.data.updateFlowChart);
  } else if (event.data.sendSingleMsgTemplate) {
    let formData = event.data.sendSingleMsgTemplate.formData;
    let template = event.data.sendSingleMsgTemplate.template;
    let newFormData = new FormData();
    for (const key in formData) { newFormData.append(key, formData[key]); }
    let saveShootMsg = await saveCampaign(newFormData);
    saveShootMsg = JSON.parse(saveShootMsg);
    if (saveShootMsg.status != 200) return;
    const sendMsgData = {
      contacts: formData.shootMsgPhone,
      caption: template["caption"],
      media: event.data.sendSingleMsgTemplate.media,
      slug: saveShootMsg.slug,
    };
    window.postMessage({ message: { shootSingleMsg: sendMsgData } }, "*");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await waitForToken();
  let reloadTemplateBtn = document.querySelectorAll(".refreshTemplates");
  if (reloadTemplateBtn.length == 0) return;
  reloadTemplateBtn.forEach((btn) => {
    let reloadTemplateSVG = btn.querySelector("svg");
    let reloadTempText = btn.querySelector(".templatesRefreshText");
    btn.addEventListener("click", async () => {
      if (!reloadTempText) return;
      reloadTempText.classList.remove("d-none");
      reloadTempText.innerText = "Refreshing...";
      reloadTemplateSVG.classList.add("spin", "disabled");
      const token = await getToken();
      await waitForToken();
      console.log("token --->", token);
      await fetchMessageTemplate(token);
      reloadTemplateSVG.classList.remove("spin", "disabled");
      reloadTempText.innerText = "Refreshed";
      setTimeout(() => { reloadTempText.classList.add("d-none"); }, 1000);
      notifyForTemplate();
    });
    btn.click();
  });
});

async function notifyForTemplate() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (!tabs.length) return;
    await chrome.tabs.sendMessage(tabs[0].id, { message: { messageTemplates: 1 } });
  } catch (e) {}
}

// Inject inject.js first
const injectScript = document.createElement("script");
injectScript.src = chrome.runtime.getURL("inject.js");
injectScript.onload = () => {
  injectScript.remove();
  
  // Then inject bundle.js after
  const bundleScript = document.createElement("script");
  bundleScript.src = chrome.runtime.getURL("bundle.js");
  bundleScript.onload = () => bundleScript.remove();
  document.documentElement.appendChild(bundleScript);
};
document.documentElement.appendChild(injectScript);

// ✅ CHANGE 2: Load the built bundle.js directly. 
// Since bundle.js already has `@wppconnect/wa-js` bundled via Webpack, 
// we don't need to load wppconnect-wa.js separately anymore.
// if (location.href.includes("web.whatsapp.com")) {
//   const bundleScript = document.createElement("script");
//   bundleScript.src = chrome.runtime.getURL("bundle.js");
//   bundleScript.onload = () => bundleScript.remove();
//   document.documentElement.appendChild(bundleScript);
// }
