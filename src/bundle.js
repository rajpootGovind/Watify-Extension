// ✅ FIX #1: webVersionCache MUST be set before anything else touches WPP.
// The original code set this AFTER require(), which is why isReady/isInjected
// were all false — WPP had already initialized without the cache config.
console.log("At load time WPP:", window.WPP);
window.WPP = window.WPP || {};
window.WPP.webVersionCache = {
  type: "remote",
  remotePath:
    "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1033041060-alpha.html",
};

const WPP = require("@wppconnect/wa-js");

const {
  _init_,
  shootBulkCamp,
  shootMsg,
  manageActiveChat,
} = require("./extension/_init_");
const { manageBlur, toggleTheme } = require("../dist/js/tools");
const { sendMsg } = require("./extension/sendMsg");

let userPhone;
let activeChatBots = [];
let activeFlowCharts = [];
let availableTemplates = [];
let userPlan = {};

console.log("🔥 bundle.js loaded");
console.log("🔥 window.WPP →", window.WPP);

// ✅ FIX #2: Always get token fresh via bridge (MAIN world can't use chrome.*)
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
    
    // timeout as fallback
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 2000);
  });
}

async function waitForToken() {
  let token = null;
  let attempts = 0;
  while (!token) {
    token = await getToken();
    if (!token) {
      attempts++;
      console.log(`⏳ Waiting for token... (${attempts})`);
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  return token;
}

// if (window.WPP?.webpack) {
//   window.WPP.webpack.onInjected(() => {
//     console.log("🔥 [WPP] onInjected fired");
//   });

//   window.WPP.webpack.onReady(() => {
//     console.log("🔥 [WPP] onReady fired");
//   });

//   window.WPP.webpack.onFullReady(() => {
//     console.log("🔥 [WPP] onFullReady fired");
//     console.log("🔥 [WPP] isReady →", window.WPP.isReady);
//     console.log("🔥 [WPP] isInjected →", window.WPP.isInjected);

//     const userIdObj = window.WPP.conn?.getMyUserId();
//     if (userIdObj) {
//       userPhone = userIdObj._serialized.toString();
//     }

//     let customInterval = setInterval(() => {
//       const app = document.querySelector("#app");
//       if (app != null) {
//         clearInterval(customInterval);
//         console.log("🔥 calling _init_");
//         _init_(window.WPP);
//       }
//       const userInfo = localStorage.getItem("userInfo");
//       if (userInfo) {
//         window.postMessage({ userInfoUpdated: JSON.parse(userInfo) }, "*");
//       }
//     }, 1000);
//   });
// }

function waitForWPP(callback) {
  if (window.WPP && window.WPP.webpack) {
    callback(window.WPP);
  } else {
    setTimeout(() => waitForWPP(callback), 300);
  }
}

waitForWPP((WPP) => {
  console.log("🔥 WPP FOUND — attaching events");

  WPP.webpack.onInjected(() => {
    console.log("🔥 onInjected fired");
  });

  WPP.webpack.onReady(() => {
    console.log("🔥 onReady fired");
  });

  WPP.webpack.onFullReady(() => {
    console.log("🔥 onFullReady fired");

    const userIdObj = WPP.conn?.getMyUserId();
    if (userIdObj) {
      userPhone = userIdObj._serialized.toString();
    }

    let customInterval = setInterval(() => {
      const app = document.querySelector("#app");
      if (app != null) {
        clearInterval(customInterval);
        console.log("🔥 calling _init_");
        _init_(WPP);
      }
    }, 1000);
  });
});

window.addEventListener("message", async (event) => {
  if (event.origin !== "https://web.whatsapp.com") return;

  try {
    if (event.data.action === "triggerWebhookFunction") {
      const body = event.data.body;
      let trigger_client_id = body.client_encoded == 1
        ? atob(body.client_id)
        : body.client_id;

      if (!trigger_client_id) return;
      if (!trigger_client_id.includes("@"))
        trigger_client_id = trigger_client_id + "@c.us";

      try {
        if (body.action === "flowcharts") {
          checkMsgInFlowcharts(body.trigger_key, trigger_client_id);
        } else if (body.action === "chatbots") {
          checkMsgInChatBot(body.trigger_key, trigger_client_id);
        } else if (body.action === "sendSingleMsgTemplate") {
          const template = availableTemplates.find(
            (d) => d.temp_slug == body.template_id
          );
          if (template) {
            const msgData = { caption: template.caption, template_id: body.template_id };
            if (template.media !== "") msgData.media = template.media;
            await sendSingleMsgTemplate(msgData, trigger_client_id.split("@")[0]);
          }
        }
      } catch (error) {
        console.log("Webhook error in bundle.js:", error);
      }
    }

    const message = event.data.message;
    if (!message) return;

    if (message.manageUi) {
      const ui = message.manageUi.ui;
      if (ui === "darkMode") toggleTheme(false, message.manageUi.value);
      else manageBlur(ui, message.manageUi.value);
    }

    if (message.sendMsg) {
      if (message.sendMsg === "BulkCamp") handleBulkCamp(message);
      if (message.sendMsg === "ShootMsg") handleShootMsg(message);
    }

    if (message.saveToken) {
      // ✅ FIX: No chrome.storage.local here! index.js handled it.
      if (activeChatBots.length === 0)
        window.postMessage({ fetchChatBots: message.saveToken }, "*");
      if (activeFlowCharts.length === 0)
        window.postMessage({ fetchFlowCharts: message.saveToken }, "*");
      if (availableTemplates.length === 0)
        window.postMessage({ messageTemplates: message.saveToken }, "*");
    }

    if (message.chatBots) {
      activeChatBots = message.chatBots;
      console.log("activeChatBots changed", activeChatBots);
    }

    if (message.fetchChatBots) {
      // ✅ FIX #3: was using undeclared `token` variable — now always fetched
      const token = await getToken();
      window.postMessage({ fetchChatBots: token }, "*");
    }

    if (message.flowCharts) {
      activeFlowCharts = message.flowCharts;
      console.log("activeFlowCharts changed", activeFlowCharts);
    }

    if (message.fetchFlowCharts) {
      const token = await getToken();
      window.postMessage({ fetchFlowCharts: token }, "*");
    }

    if (message.messageTemplates) {
      const token = await getToken();
      window.postMessage({ templates: token }, "*");
    }

    if (message.templates) {
      availableTemplates = message.templates;
      console.log("availableTemplates changed", availableTemplates);
    }

    if (message.shootSingleMsg) {
      console.log("shootSingleMsg", message.shootSingleMsg);
      shootMsg(message.shootSingleMsg);
    }

    if (message.setUserPlan) {
      userPlan = message.setUserPlan;
    }
  } catch (error) {
    // silent — event handler errors must not crash
  }
});

// window.WPP.on("chat.active_chat", manageActiveChat);

async function sendSingleMsgTemplate(msgData, from) {
  // ✅ FIX #2: original called waitForToken() without await and after getToken()
  // Now: get token first, guard early, then proceed
  const token = await waitForToken();
  try {
    let formData = {
      token,
      shootMsgPhone: `${from}`,
      shootMsgCaption: `${msgData.caption}`,
      template_id: msgData.template_id,
    };

    const template = availableTemplates.find(
      (d) => d.temp_slug == msgData.template_id
    );

    window.postMessage(
      {
        sendSingleMsgTemplate: {
          sendSingleMsgTemplate: 1,
          formData,
          template,
          media: msgData.media,
          token,
        },
      },
      "*"
    );
  } catch (error) {
    console.log("error on sendSingleMsgTemplate", error);
  }
}

async function checkMsgInChatBot(message, from) {
  try {
    const token = await getToken();
    if (!token) return;
    if (activeChatBots.length === 0) return;
    if (
      Number(userPlan.totalSend) >= Number(userPlan.msg_limit) ||
      userPlan.msg === "Plan Expired"
    ) return;

    activeChatBots.forEach((data) => {
      const { keyword, keyword_type } = data;
      const msg = message?.toLowerCase().trim();
      const keywordArr = keyword.split(",");
      keywordArr.forEach(async (key) => {
        const kw = key?.toLowerCase().trim();
        if (!kw) return;
        if (
          (keyword_type === "keyword" && msg === kw) ||
          (keyword_type === "string" && msg.includes(kw))
        ) {
          const msgData = { caption: data.msg_caption, media: data.msg_media };
          // ✅ AFTER — delegate entirely to inject.js via triggerWebhookFunction
          window.postMessage({
            action: "triggerWebhookFunction",
            body: {
              action: "chatbots",
              trigger_key: message,        // the raw incoming message text
              client_id: from,
              client_encoded: 0,
            }
          }, "*");
          return; // inject.js takes it from here
        }
      });
    });
  } catch (error) {
    console.log("error on checkMsgInChatBot", error);
  }
}

function findNode(data, type = "starting") {
  for (let key in data) {
    if (data[key].type === type) return data[key];
  }
  return null;
}

async function sendNodeMessage(from, slug, node, allNodes, flowData, isStarting = false) {
  const token = await waitForToken();
  const options = node.options || {};
  let caption = node.message;

  if (Object.keys(options).length) {
    caption += "\n";
    if (isStarting) caption += "\nChoose an option:";
    Object.keys(options)
      .sort((a, b) => b.length - a.length)
      .forEach((opt) => (caption += `\n- ${opt}`));
  }

  const msgData = { caption: caption.trim(), media: "" };
  const sendRes = await sendMsg(msgData, from);

  if (sendRes) {
    userPlan.totalSend = Number(userPlan.totalSend) + 1;
    window.postMessage(
      {
        updateFlowChart: {
          slug,
          total: 1,
          send: 1,
          failed: 0,
          sender: "flowcharts",
          token,
          saveAnalytics: 1,
        },
      },
      "*"
    );

    if (!flowData[from]) flowData[from] = {};
    flowData[from][slug] = {
      current_node: node.id,
      message: node.message,
      type: node.type,
      options: node.options,
    };
  }
}

async function checkMsgInFlowcharts(message, from) {
  try {
    if (
      !activeFlowCharts.length ||
      Number(userPlan.totalSend) >= Number(userPlan.msg_limit) ||
      userPlan.msg === "Plan Expired"
    ) return;

    // ✅ Delegate to inject.js — it has the real window.WPP
    window.postMessage({
      action: "triggerWebhookFunction",
      body: {
        action: "flowcharts",
        trigger_key: message,
        client_id: from,
        client_encoded: 0,
      }
    }, "*");
    return;

    // ❌ Everything below is removed — sendNodeMessage calls window.WPP
    //    which doesn't exist in bundle.js context. inject.js handles this.

  } catch (error) {
    console.error("Error in checkMsgInFlowcharts:", error);
  }
}

// window.WPP.on("chat.new_message", async (msg) => {
//   try {
//     if (msg.from._serialized === userPhone || msg.user === "status") return;
//     checkMsgInChatBot(msg.body, msg.from._serialized);
//     checkMsgInFlowcharts(msg.body, msg.from._serialized);
//   } catch (error) {
//     // silent
//   }
// });

const handleBulkCamp = (payload) => {
  const templateData = availableTemplates.find(
    (d) => d.temp_slug == payload.value["messageTemplates"]
  );
  if (!templateData) return;

  const bulkData = {
    contacts: payload.value["contacts"],
    caption: templateData["caption"],
    media: templateData.media !== "" ? templateData.media : "",
    slug: payload.value["bulkSlug"],
  };
  shootBulkCamp(bulkData);
};

const handleShootMsg = (payload) => {
  const templateData = availableTemplates.find(
    (d) => d.temp_slug == payload.value["messageTemplates"]
  );
  if (!templateData) return;

  const sendMsgData = {
    contacts: payload.value["shootMsgPhone"],
    caption: templateData["caption"],
    media: templateData.media !== "" ? templateData.media : "",
    slug: payload.value["slug"],
  };
  shootMsg(sendMsgData);
};

// ✅ User info polling — unchanged, was already correct
function waitAndSaveUserInfo(attempts) {
  attempts = attempts || 0;
  if (attempts > 120) return;

  try {
    let phone = null;
    let name = null;

    try {
      const me = window.WPP?.whatsapp?.MeUser?.get();
      if (me?.id?._serialized) {
        phone = me.id.user;
        name = me.pushname || phone;
      }
    } catch (e) {}

    if (!phone) {
      try {
        const waId =
          localStorage.getItem("last-wid-md") || localStorage.getItem("last-wid");
        if (waId) {
          phone = waId.replace("@c.us", "").replace("@s.whatsapp.net", "");
          name = phone;
        }
      } catch (e) {}
    }

    if (!phone) {
      try {
        const waToken1 = localStorage.getItem("WAToken1");
        if (waToken1) {
          phone = waToken1.replace("@c.us", "").replace("@s.whatsapp.net", "");
          name = phone;
        }
      } catch (e) {}
    }

    if (!phone) {
      setTimeout(() => waitAndSaveUserInfo(attempts + 1), 1000);
      return;
    }

    const existingInfo = localStorage.getItem("userInfo");
    let userInfo = existingInfo ? JSON.parse(existingInfo) : {};

    if (!userInfo.userPhone?.phone || userInfo.userPhone.phone !== phone) {
      userInfo.userName = name;
      userInfo.userPhone = { phone, _serialized: phone + "@c.us" };
      if (!userInfo.status) {
        let currentTheme = "light";
        try {
          const waThemeRaw = localStorage.getItem("theme");
          if (waThemeRaw) {
            const waTheme = JSON.parse(waThemeRaw);
            if (waTheme === "dark") {
              currentTheme = "dark";
            } else if (waTheme === "system") {
              currentTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
            } else {
              currentTheme = "light";
            }
          } else {
            currentTheme = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark") ? "dark" : "light";
          }
        } catch (e) {}

        userInfo.status = {
          theme: currentTheme,
          blurUserNames: false,
          blurMessages: false,
          blurProfile: false,
          blurConversation: false,
        };
      }
      localStorage.setItem("userInfo", JSON.stringify(userInfo));
      // window.postMessage({
      //   type: "SAVE_USER_INFO",
      //   data: userInfo
      // }, "*");
      console.log("✅ [Watify] userInfo saved:", userInfo);
    }
  } catch (e) {
    setTimeout(() => waitAndSaveUserInfo(attempts + 1), 1000);
  }
}

waitAndSaveUserInfo(0);