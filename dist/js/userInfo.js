// function getUserInfo() {
//   const info = localStorage.getItem("userInfo");
//   console.log("get Info-->", info);

//   let userInfo;
//   if (info) userInfo = JSON.parse(info);
//   else {
//     userInfo = {
//       userName: "",
//       userPhone: {
//         phone: "",
//         _serialized: "",
//       },
//       status: {
//         blurMessages: false,
//         blurProfile: false,
//         blurUserNames: false,
//         blurConversation: false,
//         theme: "dark",
//       },
//     };
//     localStorage.setItem("userInfo", JSON.stringify(userInfo));
//   }
//   return userInfo;
// }
function getUserInfo() {
  let currentTheme = "light";
  try {
    const waThemeRaw = localStorage.getItem("theme"); // WhatsApp's own key
    if (waThemeRaw) {
      const waTheme = JSON.parse(waThemeRaw); // it's stored as '"dark"'
      if (waTheme === "dark") {
        currentTheme = "dark";
      } else if (waTheme === "system") {
        currentTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
      } else {
        currentTheme = "light";
      }
    } else {
      currentTheme =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark") ? "dark" : "light";
    }
  } catch (e) {}

  const info = localStorage.getItem("userInfo");
  let userInfo;
  if (info) {
    userInfo = JSON.parse(info);
    // Force sync extension theme with WhatsApp's native theme
    if (userInfo.status) {
      userInfo.status.theme = currentTheme;
    }
    // Update local storage silently
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
  } else {
    userInfo = {
      userName: "",
      userPhone: { phone: "", _serialized: "" },
      status: {
        blurMessages: false,
        blurProfile: false,
        blurUserNames: false,
        blurConversation: false,
        theme: currentTheme
      }
    };
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
  }
  return userInfo;
}
function setUserInfo(WPP) {
  console.log("🔥 setUserInfo called", WPP);
  const userInfo = getUserInfo(); // this already creates default if missing

  // ADD THIS BLOCK right here, before anything else:
  if (!WPP?.conn) {
    console.warn("setUserInfo: WPP.conn not ready, retrying in 1.5s...");
    setTimeout(() => setUserInfo(WPP), 1500);
    return;
  }

  try {
    const userIdObj = WPP.conn.getMyUserId();
    if (!userIdObj || !userIdObj._serialized) {
      console.warn("getMyUserId returned invalid object, retrying...");
      setTimeout(() => setUserInfo(WPP), 1000);
      return;
    }

    // userInfo.userPhone._serialized = userIdObj._serialized.toString();
    // userInfo.userPhone.phone = userIdObj.user?.toString() || "";

    // ✅ ALWAYS use _serialized
    let raw = userIdObj._serialized; // "918923410359:10@c.us"

    let phone = raw.split("@")[0].split(":")[0]; // "918923410359"

    userInfo.userPhone.phone = phone;
    userInfo.userPhone._serialized = phone + "@c.us";

    // Clean phone: remove quotes, remove :8 device suffix
    // let rawPhone = (userIdObj.user?.toString() || "")
    //   .replace(/"/g, "")   // remove any quote characters
    //   .split(":")[0]        // remove :8 device suffix
    //   .trim();

    // userInfo.userPhone.phone = rawPhone;
    // userInfo.userPhone._serialized = rawPhone + "@c.us";

    // Profile name (can fail early)
    try {
      userInfo.userName =
        WPP.profile.getMyProfileName?.() || userInfo.userPhone.phone;
    } catch (e) {
      console.log("getMyProfileName failed", e);
      userInfo.userName = userInfo.userPhone.phone;
    }

    // Persist immediately
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
    // ✅ Apply theme immediately after userInfo is saved
    const theme = userInfo.status?.theme;
    if (theme === "dark") {
      document.body.classList.add("dark");
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.body.classList.remove("dark");
      document.documentElement.classList.remove("dark");
    }

    const token = btoa(userInfo.userPhone._serialized);
    localStorage.setItem("watifyToken", token);

    // chrome.storage.local.set({ watifyToken: token });
    // ✅ Can't call chrome.storage.local here — bundle runs in MAIN world.
    // Send to content.js via postMessage bridge; content.js will do the chrome.storage.local.set.
    window.postMessage({ _saveToken: token }, "*");

    console.log("✅ userInfo + token saved", userInfo);

    // Notify content script / bundle immediately
    window.postMessage({ userInfoUpdated: userInfo, token }, "*");
  } catch (err) {
    console.error("setUserInfo failed", err);
    // WPP.conn wasn't ready yet — retry in 1.5s
    setTimeout(() => setUserInfo(WPP), 1500);
  }
}
function setUserStatus(key, value) {
  const userInfo = getUserInfo();
  const userStatus = userInfo.status;
  userStatus[key] = value;
  localStorage.setItem("userInfo", JSON.stringify(userInfo));
}

async function fetchUserPlan(token = "") {
  if (token == "") token = localStorage.getItem("watifyToken");

  const response = await fetch(
    `https://watify.io/checkPlan?fetchUserPlan=1&token=${token}`,
    {
      method: "GET"
    }
  );

  const data = await response.text();
  return JSON.parse(data);
}

export { getUserInfo, setUserStatus, setUserInfo, fetchUserPlan };
