(function () {
  // inject.js runs in MAIN world — chrome.* APIs are NOT available here.
  // wppconnect-wa.js is already loaded by index.js before this script runs.
  // window.WPP is already on the page. We just register hooks.

  console.log("🔥 [inject.js] running, WPP version=", window.WPP?.version);

  // if (!window.WPP) {
  //   console.error("❌ [inject.js] window.WPP not found — wppconnect-wa.js did not load");
  //   return;
  // }

  // ✅ REPLACE with a waitForWPP wrapper around the entire init logic:
  function waitForWPP(callback, attempts) {
    attempts = attempts || 0;
    if (attempts > 50) {
      console.error("❌ [inject.js] WPP never appeared after 50 attempts");
      return;
    }
    if (window.WPP && window.WPP.webpack) {
      console.log("🔥 [inject.js] WPP found on attempt", attempts, "version=", window.WPP.version);
      callback();
    } else {
      setTimeout(() => waitForWPP(callback, attempts + 1), 300);
    }
  }

  waitForWPP(function() {
    
    // ── helpers ──────────────────────────────────────────────────
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // chrome.storage is unavailable here — use postMessage to ask index.js
  let _cachedToken = null;
  function getToken() {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      function handler(e) {
        if (e.data?._tokenReply === id) {
          window.removeEventListener("message", handler);
          resolve(e.data.token || null);
        }
      }
      window.addEventListener("message", handler);
      window.postMessage({ _getToken: id }, "*");
      setTimeout(() => { window.removeEventListener("message", handler); resolve(null); }, 2000);
    });
  }

  async function waitForToken() {
    let token = null;
    while (!token) {
      token = await getToken();
      if (!token) await new Promise((r) => setTimeout(r, 300));
    }
    _cachedToken = token;
    return token;
  }

async function sendMsg(data, number) {
  try {
    let wid = String(number);
    // ✅ Only add suffix if completely missing — preserve @lid, @c.us, @s.whatsapp.net as-is
    if (!wid.includes("@")) {
      wid = wid + "@c.us";
    } else if (wid.includes("@s.whatsapp.net")) {
      wid = wid.replace("@s.whatsapp.net", "@c.us");
    }
    console.log("📤 sendMsg to:", wid);
    let msgRes;
    if (data.media && data.media !== "") {
      const { file, fileType, filename } = data.media;
      const convert = { "&#96;": "`", "&quot;": '"', "&apos;": "'" };
      const caption = (data.caption || "").replace(/&#96;|&quot;|&apos;/g, (m) => convert[m]);
      await sleep(1500);
      msgRes = await window.WPP.chat.sendFileMessage(wid, file, { type: fileType, caption, filename, createChat: false, delay: 500 });
    } else {
      msgRes = await window.WPP.chat.sendTextMessage(wid, data.caption || "", { delay: 500, createChat: false });
    }
    const res = await msgRes.sendMsgResult;
    return res?.messageSendResult === "OK";
  } catch (e) { console.log("sendMsg error", e); return false; }
}

  // ── state ─────────────────────────────────────────────────────
  let userPhone = null;
  let activeChatBots = [];
  let activeFlowCharts = [];
  let availableTemplates = [];
  let userPlan = {};

  // ── UI helpers ────────────────────────────────────────────────
  function manageBlur(type, val) {
    window.postMessage({ message: { manageUiInternal: { ui: type, value: val } } }, "*");
  }

  function changeTheme() {
    try {
      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
      let theme = userInfo?.status?.theme;

      // If no userInfo yet, read WhatsApp's own stored theme
      if (!theme) {
        try { 
          theme = JSON.parse(localStorage.getItem("theme"));
          console.log("Current Theme ->", theme)
        } catch(e) {}
        theme = theme || document.body.getAttribute("data-color-scheme") || "light";
      }

      const body = document.querySelector("body");
      if (theme === "dark") body.classList.add("dark");
      else body.classList.remove("dark");
    } catch (e) {}
  }

  function getUserInfoFromStorage() {
    try { return JSON.parse(localStorage.getItem("userInfo") || "{}"); } catch (e) { return {}; }
  }

  function _init_() {
    changeTheme();
    const userInfo = getUserInfoFromStorage();
    const status = userInfo?.status || {};
    if (status.blurUserNames) manageBlur("blurUserNames", true);
    if (status.blurProfile) manageBlur("blurProfile", true);
    if (status.blurMessages) manageBlur("blurMessages", true);
    if (userInfo?.userPhone?.phone) {
      window.postMessage({ loginUser: { phone: userInfo.userPhone.phone, name: userInfo.userName } }, "*");
      console.log("🔥 [inject.js] loginUser posted", userInfo.userPhone.phone);
    }
  }

  // ── bulk / shoot ──────────────────────────────────────────────
  async function shootBulkCamp(message) {
    const token = await waitForToken();
    let send = 0, failed = 0;
    const numbers = message.contacts.split(",");
    for (const number of numbers) {
      const ok = await sendMsg(message, number.trim());
      if (ok) send++; else failed++;
      await sleep(2500);
    }
    window.postMessage({ updateBulkCamp: { saveBulkAnalytics: 1, slug: message.slug, total: numbers.length, send, failed, token } }, "*");
  }

  async function shootMsg(message) {
    const token = await waitForToken();
    let send = 0, failed = 0;
    const ok = await sendMsg(message, message.contacts + "@c.us");
    if (ok) send++; else failed++;
    window.postMessage({ updateShootMsg: { saveShootMsgAnalytics: 1, slug: message.slug, total: 1, send, failed, token } }, "*");
  }

  // ── chatbot ───────────────────────────────────────────────────
  async function checkMsgInChatBot(message, from) {
    try {
      const token = await getToken();
       console.log("🤖 checkMsgInChatBot token:", token, "bots:", activeChatBots.length);
      if (!token || !activeChatBots.length) return;
      if (Number(userPlan.totalSend) >= Number(userPlan.msg_limit) || userPlan.msg === "Plan Expired") return;
      const msg = message?.toLowerCase().trim();
      console.log("Msg in inject file ->", msg);
      for (const data of activeChatBots) {
        for (const key of data.keyword.split(",")) {
          const kw = key?.toLowerCase().trim();
          console.log("Keyword in inject file ->", kw);
          if (!kw) continue;
          if ((data.keyword_type === "keyword" && msg === kw) || (data.keyword_type === "string" && msg.includes(kw))) {
            const ok = await sendMsg({ caption: data.msg_caption, media: data.msg_media }, from);
            if (ok) {
              userPlan.totalSend = Number(userPlan.totalSend) + 1;
              const token2 = await getToken();
              window.postMessage({ updateChatBot: { slug: data.bot_id, total: 1, send: 1, failed: 0, sender: "chatbot_data", token: token2, saveAnalytics: 1 } }, "*");
            }
          }
        }
      }
    } catch (e) {}
  }

  // ── flowcharts ────────────────────────────────────────────────
  function findNode(nodes, type = "starting") {
    for (const key in nodes) if (nodes[key].type === type) return nodes[key];
    return null;
  }

  async function sendNodeMessage(from, slug, node, allNodes, flowData, isStarting = false) {
    const token = await waitForToken();
    let caption = node.message;
    const options = node.options || {};
    if (Object.keys(options).length) {
      caption += "\n";
      if (isStarting) caption += "\nChoose an option:";
      Object.keys(options).sort((a, b) => b.length - a.length).forEach((o) => (caption += `\n- ${o}`));
    }
    const ok = await sendMsg({ caption: caption.trim(), media: "" }, from);
    if (ok) {
      userPlan.totalSend = Number(userPlan.totalSend) + 1;
      window.postMessage({ updateFlowChart: { slug, total: 1, send: 1, failed: 0, sender: "flowcharts", token, saveAnalytics: 1 } }, "*");
      if (!flowData[from]) flowData[from] = {};
      flowData[from][slug] = { current_node: node.id, message: node.message, type: node.type, options: node.options };
    }
  }

  async function checkMsgInFlowcharts(message, from) {
    try {
      if (!activeFlowCharts.length || Number(userPlan.totalSend) >= Number(userPlan.msg_limit) || userPlan.msg === "Plan Expired") return;
      const msg = message?.toLowerCase().trim();
      const onGoing = JSON.parse(localStorage.getItem("onGoingFlowchart") || "{}");
      for (const data of activeFlowCharts) {
        const triggerKeys = data.trigger_key?.split(",")?.map((k) => k?.toLowerCase().trim());
        const allNodes = JSON.parse(data.all_nodes);
        const flowState = onGoing[from]?.[data.slug];
        if (triggerKeys?.includes(msg)) {
          const startNode = findNode(allNodes, "starting");
          if (startNode) await sendNodeMessage(from, data.slug, startNode, allNodes, onGoing, true);
          continue;
        }
        if (flowState?.options) {
          const matched = Object.keys(flowState.options).find((k) => k?.toLowerCase().trim() === msg);
          if (matched) {
            const nextId = flowState.options[matched]?.[0];
            if (!nextId) delete onGoing[from][data.slug];
            else if (allNodes[nextId]) await sendNodeMessage(from, data.slug, allNodes[nextId], allNodes, onGoing);
          }
        }
      }
      localStorage.setItem("onGoingFlowchart", JSON.stringify(onGoing));
    } catch (e) { console.error("checkMsgInFlowcharts error", e); }
  }

  // ── single msg template ───────────────────────────────────────
  async function sendSingleMsgTemplate(msgData, from) {
    const token = await waitForToken();
    const template = availableTemplates.find((d) => d.temp_slug == msgData.template_id);
    window.postMessage({ sendSingleMsgTemplate: { sendSingleMsgTemplate: 1, formData: { token, shootMsgPhone: from, shootMsgCaption: msgData.caption, template_id: msgData.template_id }, template, media: msgData.media, token } }, "*");
  }

  function manageActiveChat() {
    const status = getUserInfoFromStorage()?.status || {};
    if (status.blurUserNames) manageBlur("blurUserNames", true);
    if (status.blurProfile) manageBlur("blurProfile", true);
    if (status.blurConversation) manageBlur("blurConversation", true);
  }

  function handleBulkCamp(payload) {
    const t = availableTemplates.find((d) => d.temp_slug == payload.value["messageTemplates"]);
    if (!t) return;
    shootBulkCamp({ contacts: payload.value["contacts"], caption: t.caption, media: t.media || "", slug: payload.value["bulkSlug"] });
  }

  function handleShootMsg(payload) {
    const t = availableTemplates.find((d) => d.temp_slug == payload.value["messageTemplates"]);
    if (!t) return;
    shootMsg({ contacts: payload.value["shootMsgPhone"], caption: t.caption, media: t.media || "", slug: payload.value["slug"] });
  }

  // ── userInfo polling ──────────────────────────────────────────
  function waitAndSaveUserInfo(attempts) {
    attempts = attempts || 0;
    if (attempts > 120) return;
    try {
      let phone = null, name = null;
      try {
        const me = window.WPP?.whatsapp?.MeUser?.get();
        if (me?.id?._serialized) { phone = me.id.user; name = me.pushname || phone; }
      } catch (e) {}
      if (!phone) {
        try {
          const waId = localStorage.getItem("last-wid-md") || localStorage.getItem("last-wid");
          if (waId) { phone = waId.replace(/@c\.us|@s\.whatsapp\.net/g, ""); name = phone; }
        } catch (e) {}
      }
      if (!phone) { setTimeout(() => waitAndSaveUserInfo(attempts + 1), 1000); return; }
      const existing = localStorage.getItem("userInfo");
      let userInfo = existing ? JSON.parse(existing) : {};
      if (!userInfo.userPhone?.phone || userInfo.userPhone.phone !== phone) {
        userInfo.userName = name;
        userInfo.userPhone = { phone, _serialized: phone + "@c.us" };
        if (!userInfo.status) {
          userInfo.status = { 
            theme: (() => {
              try {
                const waTheme = localStorage.getItem("theme");
                if (waTheme) return JSON.parse(waTheme); // stored as '"dark"' or '"light"'
              } catch(e) {}
              return document.body.getAttribute("data-color-scheme") || 
                      document.body.getAttribute("data-theme") || 
                      (document.body.classList.contains("dark") ? "dark" : "light");
            })(),
            blurUserNames: false,
            blurMessages: false,
            blurProfile: false,
            blurConversation: false 
          };
        }
        localStorage.setItem("userInfo", JSON.stringify(userInfo));
        console.log("✅ [inject.js] userInfo saved:", userInfo);
        window.postMessage({ userInfoUpdated: userInfo }, "*");
      }
    } catch (e) { setTimeout(() => waitAndSaveUserInfo(attempts + 1), 1000); }
  }

  // ── message listener ──────────────────────────────────────────
  window.addEventListener("message", async (event) => {
      if (event.data?.action === "triggerWebhookFunction") {
      const body = event.data.body;
      let cid = body.client_encoded == 1 ? atob(body.client_id) : body.client_id;
      if (!cid) return;
      if (!cid.includes("@")) cid = cid + "@c.us";
      if (body.action === "flowcharts") checkMsgInFlowcharts(body.trigger_key, cid);
      else if (body.action === "chatbots") checkMsgInChatBot(body.trigger_key, cid);
      else if (body.action === "sendSingleMsgTemplate") {
        const t = availableTemplates.find((d) => d.temp_slug == body.template_id);
        if (t) await sendSingleMsgTemplate({ caption: t.caption, template_id: body.template_id, media: t.media }, cid.split("@")[0]);
      }
      return;
  }

  if (event.origin !== "https://web.whatsapp.com") return;
    try {
      // if (event.data.action === "triggerWebhookFunction") {
      //   const body = event.data.body;
      //   let cid = body.client_encoded == 1 ? atob(body.client_id) : body.client_id;
      //   if (!cid) return;
      //   if (!cid.includes("@")) cid = cid + "@c.us";
      //   if (body.action === "flowcharts") checkMsgInFlowcharts(body.trigger_key, cid);
      //   else if (body.action === "chatbots") checkMsgInChatBot(body.trigger_key, cid);
      //   else if (body.action === "sendSingleMsgTemplate") {
      //     const t = availableTemplates.find((d) => d.temp_slug == body.template_id);
      //     if (t) await sendSingleMsgTemplate({ caption: t.caption, template_id: body.template_id, media: t.media }, cid.split("@")[0]);
      //   }
      //   return;
      // }
      const msg = event.data.message;
      if (!msg) return;
      // AFTER (correct — execute the theme/blur change directly in the WA tab):
      if (msg.manageUi) {
        const { ui, value } = msg.manageUi;
        if (ui === "darkMode") {
          // Toggle: if value is empty string it's a toggle, if "dark"/"light" it's explicit
          const body = document.querySelector("body");
          const isDark = body.classList.contains("dark");
          const goingDark = value ? (value === "dark") : !isDark;
          if (goingDark) {
            body.classList.add("dark");
            // persist to userInfo
            try {
              const info = JSON.parse(localStorage.getItem("userInfo") || "{}");
              if (info.status) { info.status.theme = "dark"; localStorage.setItem("userInfo", JSON.stringify(info)); }
            } catch(e) {}
          } else {
            body.classList.remove("dark");
            try {
              const info = JSON.parse(localStorage.getItem("userInfo") || "{}");
              if (info.status) { info.status.theme = "light"; localStorage.setItem("userInfo", JSON.stringify(info)); }
            } catch(e) {}
          }
        } else {
          // blur actions — keep existing forward for bundle.js to handle
          window.postMessage({ manageUiForward: msg.manageUi }, "*");
        }
      }
      if (msg.sendMsg === "BulkCamp") handleBulkCamp(msg);
      if (msg.sendMsg === "ShootMsg") handleShootMsg(msg);
      if (msg.saveToken) {
        // token saved by index.js — just trigger fetches
        if (!activeChatBots.length) window.postMessage({ fetchChatBots: msg.saveToken }, "*");
        if (!activeFlowCharts.length) window.postMessage({ fetchFlowCharts: msg.saveToken }, "*");
        if (!availableTemplates.length) window.postMessage({ messageTemplates: msg.saveToken }, "*");
      }
      if (msg.chatBots) { activeChatBots = msg.chatBots; console.log("chatBots updated", activeChatBots.length); }
      if (msg.flowCharts) { activeFlowCharts = msg.flowCharts; console.log("flowCharts updated", activeFlowCharts.length); }
      if (msg.templates) { availableTemplates = msg.templates; console.log("templates updated", availableTemplates.length); }
      if (msg.shootSingleMsg) shootMsg(msg.shootSingleMsg);
      if (msg.setUserPlan) userPlan = msg.setUserPlan;
      if (msg.fetchChatBots) { const t = await getToken(); window.postMessage({ fetchChatBots: t }, "*"); }
      if (msg.fetchFlowCharts) { const t = await getToken(); window.postMessage({ fetchFlowCharts: t }, "*"); }
      if (msg.messageTemplates) { const t = await getToken(); window.postMessage({ templates: t }, "*"); }
    } catch (e) {}
  });

  // ── WPP lifecycle ─────────────────────────────────────────────
  window.WPP.webpack.onInjected(() => console.log("🔥 [inject.js] onInjected fired"));
  window.WPP.webpack.onReady(() => console.log("🔥 [inject.js] onReady fired"));
  window.WPP.webpack.onFullReady(() => {
    console.log("🔥 [inject.js] onFullReady fired");
    try { userPhone = window.WPP.conn.getMyUserId()._serialized.toString(); } catch (e) {}
    const interval = setInterval(() => {
      if (document.querySelector("#app")) {
        clearInterval(interval);
        _init_();
        const info = localStorage.getItem("userInfo");
        if (info) window.postMessage({ userInfoUpdated: JSON.parse(info) }, "*");
      }
    }, 1000);
  });
  window.WPP.on("chat.active_chat", manageActiveChat);
 window.WPP.on("chat.new_message", async (msg) => {
  try {
    if (!userPhone || msg.from._serialized === userPhone || msg.user === "status") return;

    // Pass the original _serialized as-is — sendMsg will keep it intact
    const from = msg.from._serialized;
    console.log("📨 [chat.new_message] from:", from);

    checkMsgInChatBot(msg.body, from);
    checkMsgInFlowcharts(msg.body, from);
  } catch (e) { console.error("chat.new_message error", e); }
});

  waitAndSaveUserInfo(0);
  
  });


  
})();