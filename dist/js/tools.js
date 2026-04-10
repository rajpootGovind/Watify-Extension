import { setUserStatus, getUserInfo } from "./userInfo.js";

function waitForElement(selector, callback) {
  const el = document.querySelector(selector);
  if (el) return callback(el);

  const observer = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      observer.disconnect();
      callback(el);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function setDarkMode(isManualToggle = false) {
  try {
    localStorage.setItem("theme", '"dark"');
    localStorage.setItem("system-theme-mode", "false");
  } catch (e) {}

  setUserStatus("theme", "dark");
  
  if (isManualToggle) {
    window.location.reload();
  } else {
    const body = document.querySelector("body");
    if (body && !body.classList.contains("dark")) body.classList.add("dark");
    if (!document.documentElement.classList.contains("dark")) document.documentElement.classList.add("dark");
  }
}

function setLightMode(isManualToggle = false) {
  try {
    localStorage.setItem("theme", '"light"');
    localStorage.setItem("system-theme-mode", "false");
  } catch (e) {}

  setUserStatus("theme", "light");
  
  if (isManualToggle) {
    window.location.reload();
  } else {
    const body = document.querySelector("body");
    if (body) body.classList.remove("dark");
    document.documentElement.classList.remove("dark");
  }
}

function toggleTheme(init = false, themeValue = false) {
  if (init) {
    const theme = getItemFromStorage("theme");
    if (theme === "dark") setDarkMode(false);
    else setLightMode(false);
  } else if (themeValue) {
    if (themeValue === "dark") setDarkMode(true);
    else setLightMode(true);
  } else {
    const theme = getCurrentTheme();
    // console.log("theme", theme);
    if (theme === "dark") setLightMode(true);
    else setDarkMode(true);
  }
}
let blurInterval = null;
let hoveredElements = new Set(); // Track which elements are being hovered

function applyBlurToAll() {
  document
    .querySelectorAll("#main div[role='row'] div[tabindex='-1']")
    .forEach(el => {
      if (!hoveredElements.has(el)) { // ← Don't blur hovered elements
        el.style.filter = "blur(10px) grayscale(100%)";
      }
    });
}

function attachHoverListeners() {
  document
    .querySelectorAll("#main div[role='row'] div[tabindex='-1']")
    .forEach(el => {
      if (el._blurListenersAttached) return; // Avoid duplicate listeners
      el._blurListenersAttached = true;

      el.addEventListener("mouseover", (e) => {
        // If the hovered target spans the full row width, it's the empty space wrapper.
        // The actual chat bubble represents a smaller percentage of the total row width.
        if (e.target.offsetWidth > el.offsetWidth * 0.65) {
          el.style.filter = "blur(10px) grayscale(100%)";
          hoveredElements.delete(el);
        } else {
          hoveredElements.add(el);
          el.style.filter = "blur(0px) grayscale(0%)";
        }
      });

      el.addEventListener("mouseout", (e) => {
        if (!el.contains(e.relatedTarget)) {
          hoveredElements.delete(el);
          el.style.filter = "blur(10px) grayscale(100%)"; // Re-blur when cursor leaves
        }
      });
    });
}

function manageBlur(blurItem, blur = false) {
  const chatList = document.querySelector('#app');
  if (blur) {
    chatList.classList.add(blurItem);
  } else {
    chatList.classList.remove(blurItem);
  }

  // 🔥 SPECIAL HANDLING FOR blurConversation
  if (blurItem === "blurConversation") {
    if (blur) {
      applyBlurToAll();
      attachHoverListeners(); // ← Attach hover on/off listeners

      blurInterval = setInterval(() => {
        applyBlurToAll();
        attachHoverListeners(); // ← Re-attach for any new messages loaded
      }, 500);

    } else {
      clearInterval(blurInterval);
      blurInterval = null;
      hoveredElements.clear(); // ← Reset hover tracking

      // Remove blur and clean up listeners
      document
        .querySelectorAll("#main div[role='row'] div[tabindex='-1']")
        .forEach(el => {
          el.style.filter = "";
          el._blurListenersAttached = false; // Allow re-attaching next time
        });
    }
  }

  setUserStatus(blurItem, blur);
}

function getCurrentTheme() {
  const body = document.querySelector("body");
  return document.documentElement.classList.contains("dark") || body.classList.contains("dark") ? "dark" : "light";
}

function getItemFromStorage(key) {
  const userInfo = getUserInfo();

  // console.log("itemstorage", userInfo);
  return userInfo.status[key];
}

export { toggleTheme, getCurrentTheme, manageBlur };
