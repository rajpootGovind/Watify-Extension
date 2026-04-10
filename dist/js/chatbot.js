const chatbotBody = (chatbot, index) => `<td>${index + 1}</td>
    <td>${chatbot.bot_name}</td>
    <td>${chatbot.keyword_type}</td>
    <td>${chatbot.total_sent ?? 0}</td>
    <td>
      <div
        class="form-check form-switch d-flex align-items-center justify-content-center"
      >
        <input
          type="checkbox"
          class="form-check-input statusSwitch cursor-pointer"
          id="customSwitch1"
         ${chatbot.status == 1 ? "checked" : ""}
          data-bot-id="${chatbot.bot_id}"
          style="cursor: pointer;"
        />
        <label
          class="form-check-label"
          for="customSwitch1"
        ></label>
      </div>
    </td>
    <td>
      <i
        class="bi bi-pencil-square text-primary me-3 cursor-pointer"
        data-toggle="tooltip"
        data-bot-id="${chatbot.bot_id}"
        aria-label="Edit"
        style="cursor: pointer;"
      ></i
      ><i
        class="bi bi-trash text-danger cursor-pointer"
        data-toggle="tooltip"
        data-bot-id="${chatbot.bot_id}"
        aria-label="Delete"
        style="cursor: pointer;"
      ></i>
    </td>
  
`;
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
async function notifyForBot() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  await chrome.tabs.sendMessage(tab.id, {
    message: { fetchChatBots: 1 },
  });
}

const chatbot = document.getElementById("chatbot");
const svg = chatbot.querySelector(".refreshContactGroups svg");
svg.addEventListener("click", reloadBot);

async function reloadBot() {
  svg.classList.add("spin", "disabled");
  await waitForToken();
  await showChatBots();                   // ← await added
  svg.classList.remove("spin", "disabled");

  const contactRefreshText = chatbot.querySelector(".contactRefreshText");
  contactRefreshText.style.opacity = 1;
  contactRefreshText.classList.remove("d-none");

  setTimeout(() => {
    contactRefreshText.classList.add("d-none");
    contactRefreshText.style.opacity = 0;
  }, 2000);

  notifyForBot();
}

// reloadBot();

async function chatBotAPI(payload) {
  try {
    const token = await getToken();
    payload["token"] = token;
    // console.log(payload, "delete bot");
    const res = await fetch("https://watify.io/fun/watifyExtApi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.text();
    notifyForBot();
    return JSON.parse(data);
  } catch (error) {
    console.error("error on chatbot api", error);
  }
}
async function deleteBot(bot, chatbotId) {
  if (!confirm("Are you sure you want to delete this chatbot?")) return;
  const res = await chatBotAPI({ deleteChatbot: 1, chatbotId });

  // console.log(bot.closest("tr"));
  if (res.status == 200) {
    bot.closest("tr").remove();
    const chatbotBody = document.getElementById("chatbot-body");
    if (chatbotBody.children.length == 0)
      chatbotBody.innerHTML = `<tr class="odd"><td valign="top" colspan="6" class="dataTables_empty">No chatbot available</td></tr>`;
    notifyForBot();
  }
}

function chatBotListeners() {
  const chatbotBody = document.getElementById("chatbot-body");
  chatbotBody.addEventListener("click", function (e) {
    if (e.target.closest(".statusSwitch")) {
      const statusSwitch = e.target.closest(".statusSwitch");
      const isActive = statusSwitch.checked;
      const botId = statusSwitch.getAttribute("data-bot-id");
      chatBotAPI({
        updateChatbotStatus: 1,
        chatbotId: botId,
        status: isActive ? 1 : 0,
      });
    } else if (e.target.closest(".bi-trash")) {
      const bot = e.target.closest(".bi-trash");
      const chatbotId = bot.getAttribute("data-bot-id");
      deleteBot(bot, chatbotId);
    } else if (e.target.closest(".bi-pencil-square")) {
      const bot = e.target.closest(".bi-pencil-square");
      const chatbotId = bot.getAttribute("data-bot-id");
      // console.log(chatbotId, "edit chatbot");
      chrome.tabs.create(
        {
          active: true,
          url: `https://watify.io/chatbot?editBot=${chatbotId}`,
        },
        null
      );
    }
  });
}

async function fetchChatBots() {
  const token = await getToken();
  let chatBotsRes = await fetch(
    `https://watify.io/fun/watifyExtApi?getChatbots=1&token=${token}`
  );
  let chatBots = await chatBotsRes.text();
  chatBots = JSON.parse(chatBots);
  console.log("chatbots-->", chatBots);
  
  notifyForBot();
  if (chatBots.status == 200) return chatBots.data;
  else return false;
}

async function showChatBots() {
  let chatBots = await fetchChatBots();
  if (!chatBots) return;
  chatBots = Object.values(chatBots);
  const chatbotTab = document.getElementById("chatbot-body");
  if (chatBots.length == 0)
    chatbotTab.innerHTML = `<tr class="odd"><td valign="top" colspan="6" class="dataTables_empty">No chatbot available</td></tr>`;
  else {
    chatbotTab.innerHTML = ""; // clear before re-render
    chatBots.forEach((chatbot, index) => {
      const chatbotEle = document.createElement("tr");
      chatbotEle.classList.add("chatbot");
      chatbotEle.innerHTML = chatbotBody(chatbot, index);
      chatbotTab.appendChild(chatbotEle);
    });
  }
}

function initChatbotHandler() {
  showChatBots();
  chatBotListeners();
}

export { initChatbotHandler };
