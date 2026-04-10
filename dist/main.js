import { initChatbotHandler } from "./js/chatbot.js";
import { initFlowchartsHandler } from "./js/flowcharts.js"
import { notify } from "./js/notifier.js";
import { saveCampaign } from "./js/saveForm.js";
import { fetchUserPlan } from "./js/userInfo.js";

try {
  // console.log("main loaded");
function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get("watifyToken", (result) => {
      resolve(result.watifyToken);
    });
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

  console.log("✅ Token ready:", token);
  return token; // ✅ FIX
}
  const fetchContactGroups = async () => {
    await waitForToken();
    const token = await getToken();
    console.log("bulk message", token);
    
    bulkSendForm
      .querySelector(".refreshContactGroups svg")
      .classList.add("spin", "disabled");
    let contactGroupsRes = await fetch(
      `https://watify.io/fun/watifyExtApi?getContactGroups=1&token=${token
      }`
    );
    let contactGroups = await contactGroupsRes.text();
    console.log("contact groups-->", contactGroups);
    
    bulkSendForm
      .querySelector(".refreshContactGroups svg")
      .classList.remove("spin", "disabled");
    bulkSendForm
      .querySelector(".contactRefreshText")
      .classList.remove("d-none");
    bulkSendForm.querySelector(".contactRefreshText").style.opacity = 1;
    setTimeout(() => {
      bulkSendForm.querySelector(".contactRefreshText").classList.add("d-none");
      bulkSendForm.querySelector(".contactRefreshText").style.opacity = 0;
    }, 2000);
    contactGroups = JSON.parse(contactGroups);
    if (contactGroups.status == 200) {
      bulkSendForm.querySelector("#bulkContactGroup").innerHTML = "";
      localStorage.setItem("userInstanceId", contactGroups.instance_id);
      //  chrome.storage.local.set({ userInstanceId: contactGroups.instance_id });
      contactGroups = contactGroups.data;
      contactGroups.forEach((contactGroup) => {
        let option = document.createElement("option");
        option.value = contactGroup.group_slug;
        option.text = contactGroup.group_name;
        bulkSendForm.querySelector("#bulkContactGroup").appendChild(option);
      });
      let defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.text = "Select Contact Group";
      defaultOption.selected = true;
      bulkSendForm.querySelector("#bulkContactGroup").prepend(defaultOption);
    }
  };

  function manageContentHeight(target) {
    let height;
    switch (target) {
      case "bulkSendForm":
      case "shootMsgForm":
        height = "600px";
        break;
      default:
        height = "200px";
        break;
    }

    document.querySelector("body").style.height = height;
    document.querySelector("html").style.height = height;
  }

  document.querySelector("#myTab").addEventListener("click", (e) => {
    e.preventDefault();
    if (e.target.classList.contains("nav-link")) {
      const isAnyActive = document.querySelector(".nav-link.active");
      if (!isAnyActive) return;

      let target = e.target.getAttribute("data-bs-target");
      let tabContent = document.querySelector(".tab-content");
      let tabs = tabContent.querySelectorAll(".tab-pane");
      tabs.forEach((tab) => {
        tab.classList.remove("active");
      });
      tabContent.querySelector(target).classList.add("active");
      let navLinks = document.querySelectorAll(".nav-link");
      navLinks.forEach((link) => {
        link.classList.remove("active");
      });
      e.target.classList.add("active");
      // console.log(localStorage);

      manageContentHeight(target);
    }
  });

  document.getElementById("tools").addEventListener("change", (e) => {
    // console.log("cehckbox changed", e.target.id, e.target.checked);
    if (e.target.id === "blurUserNames") {
      notify(chrome.runtime, {
        manageUi: { ui: "blurUserNames", value: e.target.checked },
      });
    } else if (e.target.id === "blurMessages") {
      notify(chrome.runtime, {
        manageUi: { ui: "blurMessages", value: e.target.checked },
      });
    } else if (e.target.id === "blurProfile") {
      notify(chrome.runtime, {
        manageUi: { ui: "blurProfile", value: e.target.checked },
      });
    } else if (e.target.id === "darkMode") {
      notify(chrome.runtime, {
        manageUi: { ui: "darkMode", value: "" },
      });
    } else if (e.target.id === "blurConversation") {
      notify(chrome.runtime, {
        manageUi: { ui: "blurConversation", value: e.target.checked },
      });
    }
  });

  let _manageBtnTimer = null;

  function manageBtn(btn, action) {
    if (action === "enable") {
      clearTimeout(_manageBtnTimer);
      btn.disabled = false;
      btn.textContent = "Send";
      // btn.classList.remove("btn-success");
      btn.classList.add("btn-primary");
    } else if (action === "disable") {
      btn.disabled = true;
      btn.textContent = "initiating...";
      _manageBtnTimer = setTimeout(() => {
        btn.textContent = "Sending...";
      }, 1000);
    } else if (action === "success") {
      clearTimeout(_manageBtnTimer);
      btn.disabled = false;
      btn.textContent = "Sent";
      // btn.classList.remove("btn-primary");
      // btn.classList.add("btn-success");
      _manageBtnTimer = setTimeout(() => {
        manageBtn(btn, "enable");
      }, 2500);
    }
  }

  async function fetchContacts(groupId) {
    let contactsRes = await fetch(
      `https://watify.io/fun/watifyExtApi?getContacts=1&contactGroupToken=${groupId}`
    );
    let contacts = await contactsRes.text();
    contacts = JSON.parse(contacts);
    if (contacts.status == 200) return contacts.data;
    else return false;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("File is undefined"));
        return;
      }

      const reader = new FileReader();
      // console.log("reader", reader);
      reader.onload = () => {
        const base64 = reader.result; // Extract the base64 part
        const ext = file.name.split(".").pop().toLowerCase(); // Get the file extension
        const type = file.type; // Get the MIME type
        const filename = file.name; // Get the file name

        // console.log({ file: base64, ext, fileType: type, filename });
        resolve({ file: base64, ext, fileType: type, filename });
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsDataURL(file);
    });
  }

  async function handelBulkForm(event) {
    event.preventDefault();
    let sendBtn = bulkSendForm.querySelector("#submitBtn");
    manageBtn(sendBtn, "disable");

    const formData = new FormData(bulkSendForm);
    // console.log(Object.fromEntries(formData.entries()), "formData");

    const contactsRes = await fetchContacts(formData.get("bulkContactGroup"));

    const contacts = contactsRes.map((contact) => contact.phone);
    // console.log(contacts, "contacts");
    if (!contacts) {
      manageBtn(sendBtn, "enable");
      alert("No contacts found in this group");
      return;
    }

    formData.append("contacts", contacts);

    const token = await getToken();
    // console.log(token, "token");

    formData.append("token", token);

    const userPlan = await fetchUserPlan(token);
    if (userPlan && userPlan.msg == "Plan Expired") {
      manageBtn(sendBtn, "enable");
      alert(
        "Your plan has expired, please renew your plan to continue using the service"
      );
      return;
    }

    const sendLimit =
      Number(userPlan.bulk_msg_limit) - Number(userPlan.bulkSend);

    if (sendLimit <= 0) {
      manageBtn(sendBtn, "enable");
      alert(
        `You have reached your daily limit of ${userPlan.bulk_msg_limit} messages, you can not send any more bulk messages`
      );
      return;
    }
    if (sendLimit < contacts.length) {
      manageBtn(sendBtn, "enable");
      alert(
        `You have reached your daily limit of ${
          userPlan.bulk_msg_limit
        } messages, you can only send ${
          userPlan.bulk_msg_limit - userPlan.bulkSend
        } messages`
      );
      return;
    }

    const saveBulk = await saveCampaign(formData);
    if (!saveBulk) {
      manageBtn(sendBtn, "enable");
      alert("Unable to send campaign");
      return;
    }

    // console.log(saveBulk, "saveBulk");

    const payload = Object.fromEntries(formData.entries());
    payload["bulkSlug"] = JSON.parse(saveBulk).slug;

    console.log(payload, "payload before");

    // if (payload.bulkCampMedia.size > 0) {
    //   console.log(payload.bulkCampMedia, "payload.bulkCampMedia");
    //   const { file, _, fileType, filename } = await fileToBase64(
    //     payload.bulkCampMedia
    //   );
    //   payload["file"] = file;
    //   payload["fileType"] = fileType;
    //   payload["filename"] = filename;
    // }
    // console.log(payload, "payload");
    // delete payload["bulkCampMedia"];

    // console.log("payload", payload);

    // const bulkData = {
    //   contacts: payload["contacts"],
    //   caption: payload["bulkCampMsg"],
    //   media: "",
    //   slug: payload["bulkSlug"],
    // };
    // if (payload.file) {
    //   bulkData.media = {
    //     file: payload.file,
    //     fileType: payload.fileType,
    //     filename: payload.filename,
    //   };
    // }

    // console.log("|bulkData|", bulkData);

    notify(chrome.runtime, { sendMsg: "BulkCamp", value: payload });

    // Show success state — no alert() to avoid popup losing focus/closing
    manageBtn(sendBtn, "success");
  }

  async function handelShootMsg(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector("#shootMsgBtn");
    manageBtn(btn, "disable");

    const token = await getToken();
    // console.log(token, "token");

    const formData = new FormData(form);
    formData.append("token", token);

    // console.log(Object.fromEntries(formData.entries()), "formData");

    const userPlan = await fetchUserPlan(token);
    if (userPlan && userPlan.msg == "Plan Expired") {
      manageBtn(btn, "enable");
      alert(
        "Your plan has expired, please renew your plan to continue using the service"
      );
      return;
    }

    const sendLimit = Number(userPlan.msg_limit) - Number(userPlan.totalSend);

    if (sendLimit <= 1) {
      manageBtn(btn, "enable");
      alert(
        `You have reached your daily limit of ${userPlan.msg_limit} messages, you can not send any more messages`
      );
      return;
    }

    const phone = formData.get("shootMsgPhone");
    const phoneCode = formData.get("phoneCode").replace(/[^\d]/g, "");

    formData.set("shootMsgPhone", `${phoneCode}${phone}`);

    const saveShootMsg = await saveCampaign(formData);
    if (!saveShootMsg) {
      manageBtn(btn, "enable");
      alert("Unable to send campaign");
      return;
    }

    const payload = Object.fromEntries(formData.entries());

    payload["slug"] = JSON.parse(saveShootMsg).slug;

    // if (payload.shootMsgMedia.size > 0) {
    //   const { file, _, fileType, filename } = await fileToBase64(
    //     payload.shootMsgMedia
    //   );
    //   payload["file"] = file;
    //   payload["fileType"] = fileType;
    //   payload["filename"] = filename;
    // }
    // delete payload["shootMsgMedia"];

    // console.log("payload", payload);

    // const sendMsgData = {
    //   contacts: payload["shootMsgPhone"],
    //   caption: payload["shootMsgCaption"],
    //   media: "",
    //   slug: payload["slug"],
    // };

    // if (payload.file) {
    //   sendMsgData.media = {
    //     file: payload.file,
    //     fileType: payload.fileType,
    //     filename: payload.filename,
    //   };
    // }

    // console.log("|sendMsgData|", sendMsgData);

    notify(chrome.runtime, { sendMsg: "ShootMsg", value: payload });

    // Same pattern as bulk — show "Sent" then reset to "Send" after 2.5s
    manageBtn(btn, "success");
  }

  const bulkSendForm = document.querySelector("#bulkSendForm");

  fetchContactGroups();
  bulkSendForm
    .querySelector(".refreshContactGroups")
    .addEventListener("click", () => {
      console.log("refreshing contact groups");
      fetchContactGroups();
    });

  bulkSendForm.addEventListener("submit", handelBulkForm);

  document
    .querySelector("#shootMsgForm")
    .addEventListener("submit", handelShootMsg);

  const countryPhoneCodes = {
    "United States": "+1",
    Canada: "+1",
    Russia: "+7",
    China: "+86",
    India: "+91",
    "United Kingdom": "+44",
    Germany: "+49",
    France: "+33",
    Italy: "+39",
    Spain: "+34",
    Australia: "+61",
    Brazil: "+55",
    "South Africa": "+27",
    Japan: "+81",
    "South Korea": "+82",
    Mexico: "+52",
    Indonesia: "+62",
    Turkey: "+90",
    "Saudi Arabia": "+966",
    Nigeria: "+234",
    Argentina: "+54",
    Pakistan: "+92",
    Bangladesh: "+880",
    Vietnam: "+84",
    Egypt: "+20",
    Iran: "+98",
    Thailand: "+66",
    Philippines: "+63",
    Malaysia: "+60",
    Singapore: "+65",
    "United Arab Emirates": "+971",
    Israel: "+972",
    "New Zealand": "+64",
    Sweden: "+46",
    Norway: "+47",
    Denmark: "+45",
    Finland: "+358",
    Netherlands: "+31",
    Belgium: "+32",
    Switzerland: "+41",
    Austria: "+43",
    Ireland: "+353",
    Portugal: "+351",
    Greece: "+30",
    "Czech Republic": "+420",
    Poland: "+48",
    Hungary: "+36",
    Romania: "+40",
    Slovakia: "+421",
    Bulgaria: "+359",
    Croatia: "+385",
    Slovenia: "+386",
    Estonia: "+372",
    Latvia: "+371",
    Lithuania: "+370",
    Iceland: "+354",
    Luxembourg: "+352",
    Malta: "+356",
    Cyprus: "+357",
  };
  const selectBox = document.getElementById("phoneCode");
  for (const [country, code] of Object.entries(countryPhoneCodes)) {
    const option = document.createElement("option");
    option.value = code;
    option.text = `${country} (${code})`;
    selectBox.appendChild(option);
  }
  selectBox.value = "+91";

  document.querySelectorAll(".reloadWhatsapp").forEach((ele) => {
    // console.log("reloadWhatsapp", ele);
    ele.addEventListener("click", () => {
      // console.log("chrome runtime");
      chrome.tabs.create(
        {
          active: true,
          url: "https://web.whatsapp.com",
        },
        null
      );
    });
  });

  document.getElementById("report-tab").addEventListener("click", async() => {
    const isAnyActive = document.querySelector(".nav-link.active");
    if (!isAnyActive) return;
    await waitForToken();
    const token = await getToken();
    chrome.tabs.create(
      {
        active: true,
        url: `https://watify.io/dashboard?tab=report&user=${token}`,
      },
      null
    );
  });

  document.getElementById("account-tab").addEventListener("click", () => {
    chrome.tabs.create(
      {
        active: true,
        url: `https://watify.io/signin`,
      },
      null
    );
  });

  initChatbotHandler();
  initFlowchartsHandler();
} catch (error) {
  // console.log("error on main", error);
}
