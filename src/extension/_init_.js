import { manageBlur } from "../../dist/js/tools";
import { getUserInfo, setUserInfo } from "../../dist/js/userInfo";
import { sendMsg } from "./sendMsg";
import { sleep } from "./sleep";

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
    
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 2000);
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
  return token;
}

function changeTheme() {
  const userInfo = localStorage.getItem("userInfo");
  if (!userInfo) return;
  const parsed = JSON.parse(userInfo);
  const theme = parsed?.status?.theme;
  if (!theme) return;
  const body = document.querySelector("body");
  if (theme === "dark" && !body.classList.contains("dark"))
    body.classList.add("dark");
  else if (theme === "light" && body.classList.contains("dark"))
    body.classList.remove("dark");
}

function _init_(WPP) {
  // ADD THIS BLOCK right here, before anything else:
  // if (!WPP?.conn) {
  //   console.warn("setUserInfo: WPP.conn not ready, retrying in 1.5s...");
  //   setTimeout(() => setUserInfo(WPP), 1500);
  //   return;
  // }
  setUserInfo(window.WPP);
  // changeTheme();
  // const userInfo = getUserInfo();
  setTimeout(() => {
    const userInfo = getUserInfo();
    console.log("_init_ userInfo (AFTER FIX)", userInfo);

    const userStatus = userInfo?.status || {};
    if (userStatus.blurUserNames) manageBlur("blurUserNames", true);
    if (userStatus.blurProfile) manageBlur("blurProfile", true);
    if (userStatus.blurMessages) manageBlur("blurMessages", true);

    if (userInfo?.userPhone?.phone) {
      window.postMessage(
        {
          loginUser: {
            phone: userInfo.userPhone.phone,
            name: userInfo.userName,
          },
        },
        "*"
      );
    }
  }, 1500);
  // console.log("_init_ userInfo", userInfo);
  // const userStatus = userInfo?.status || {};
  // if (userStatus.blurUserNames) manageBlur("blurUserNames", true);
  // if (userStatus.blurProfile) manageBlur("blurProfile", true);
  // if (userStatus.blurMessages) manageBlur("blurMessages", true);

  // window.postMessage(
  //   { loginUser: { phone: userInfo.userPhone.phone, name: userInfo.userName } },
  //   "*"
  // );
  // AFTER:
  if (userInfo?.userPhone?.phone) {
    window.postMessage(
      { loginUser: { phone: userInfo.userPhone.phone, name: userInfo.userName } },
      "*"
    );
  }
}

async function shootBulkCamp(message) {
  console.log(message, "shootBulkCamp");
  let send = 0;
  let failed = 0;
  try {
    const numbers = message.contacts.split(",");
    // ✅ FIX: always get token before use, not just reference it
    const token = await waitForToken();

    for (const number of numbers) {
      const isSent = await sendMsg(message, number.trim());
      if (isSent) send++;
      else failed++;
      await sleep(2500);
    }

    window.postMessage(
      {
        updateBulkCamp: {
          saveBulkAnalytics: 1,
          slug: message.slug,
          total: numbers.length,
          send,
          failed,
          token: token,
        },
      },
      "*"
    );
  } catch (error) {
    console.log("error on shootBulkCamp", error);
  }
}

async function shootMsg(message) {
  // ✅ FIX: token fetched correctly before use
  const token = await waitForToken();
  let send = 0;
  let failed = 0;
  try {
    const number = message.contacts + "@c.us";
    const isSent = await sendMsg(message, number);
    if (isSent) send++;
    else failed++;

    window.postMessage(
      {
        updateShootMsg: {
          saveShootMsgAnalytics: 1,
          slug: message.slug,
          total: 1,
          send,
          failed,
          token: token,
        },
      },
      "*"
    );
  } catch (error) {
    console.log("error on shootMsg", error);
  }
}

function manageActiveChat() {
  const userStatus = getUserInfo()?.status || {};
  if (userStatus.blurUserNames) manageBlur("blurUserNames", true);
  if (userStatus.blurProfile) manageBlur("blurProfile", true);
  if (userStatus.blurConversation) manageBlur("blurConversation", true);
}

export { _init_, shootBulkCamp, shootMsg, manageActiveChat };