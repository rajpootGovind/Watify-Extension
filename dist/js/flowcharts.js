const flowChartsBody = (flowCharts, index) => `<td>${index + 1}</td>
    <td>${flowCharts.name ?? "Untitled"}</td>
    <td>${flowCharts.trigger_key ?? "Not Set"}</td>
    <td>${flowCharts.total_sent ?? 0}</td>
    <td>
      <div
        class="form-check form-switch d-flex align-items-center justify-content-center"
      >
        <input
          type="checkbox"
          class="form-check-input flowChartStatusSwitch cursor-pointer"
          id="customSwitch2"
         ${flowCharts.status == 1 ? "checked" : ""}
          data-bot-id="${flowCharts.slug}"
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
        data-bot-id="${flowCharts.slug}"
        aria-label="Edit"
        style="cursor: pointer;"
      ></i
      ><i
        class="bi bi-trash text-danger cursor-pointer"
        data-toggle="tooltip"
        data-bot-id="${flowCharts.slug}"
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
    message: { fetchFlowCharts: 1 },
  });
}

const flowCharts = document.getElementById("flowCharts");
const svg = flowCharts.querySelector(".refreshContactGroups svg");
svg.addEventListener("click", reloadBot);

async function reloadBot() {

  svg.classList.add("spin", "disabled");
await waitForToken(); //
  await fetchFlowCharts();
  await showFlowcharts()
  svg.querySelector(".refreshContactGroups svg");
  svg.classList.remove("spin", "disabled");

  const contactRefreshText = flowCharts.querySelector(".contactRefreshText");
  contactRefreshText.style.opacity = 1;
  contactRefreshText.classList.remove("d-none");

  setTimeout(() => {
    contactRefreshText.classList.add("d-none");
    contactRefreshText.style.opacity = 0;
  }, 2000);

  notifyForBot();
}

reloadBot();

async function flowChartsAPI(payload) {
  console.log("flow chart Payload", payload);
  
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
    console.log("Flowchat response", res);
    
    const data = await res.text();
    notifyForBot();
    return JSON.parse(data);
  } catch (error) {
    console.error("error on flowCharts api", error);
  }
}
async function deleteBot(bot, flowChartsId) {
  if (!confirm("Are you sure you want to delete this flowCharts?")) return;
  const res = await flowChartsAPI({ deleteFlowcharts: 1, flowChartsId });

  // console.log(bot.closest("tr"));
  if (res.status == 200) {
    bot.closest("tr").remove();
    const flowChartsBody = document.getElementById("flowCharts-body");
    if (flowChartsBody.children.length == 0)
      flowChartsBody.innerHTML = `<tr class="odd"><td valign="top" colspan="6" class="dataTables_empty">No flowCharts available</td></tr>`;
    notifyForBot();
  }
}

function flowChartsListeners() {
  const flowChartsBody = document.getElementById("flowCharts-body");
  flowChartsBody.addEventListener("click", function (e) {
    if (e.target.closest(".flowChartStatusSwitch")) {
      const flowChartStatusSwitch = e.target.closest(".flowChartStatusSwitch");
      const isActive = flowChartStatusSwitch.checked;
      const botId = flowChartStatusSwitch.getAttribute("data-bot-id");
      flowChartsAPI({
        updateFlowchartsStatus: 1,
        flowChartsId: botId,
        status: isActive ? 1 : 0,
      });
    } else if (e.target.closest(".bi-trash")) {
      const bot = e.target.closest(".bi-trash");
      const flowChartsId = bot.getAttribute("data-bot-id");
      deleteBot(bot, flowChartsId);
    } else if (e.target.closest(".bi-pencil-square")) {
      const bot = e.target.closest(".bi-pencil-square");
      const flowChartsId = bot.getAttribute("data-bot-id");
      // console.log(flowChartsId, "edit flowCharts");
      chrome.tabs.create(
        {
          active: true,
          url: `https://watify.io/flowchart-editor/${flowChartsId}`,
        },
        null
      );
    }
  });
}

async function fetchFlowCharts() {
  const token = await getToken();
  console.log("token-->", token);
  
  let flowChartsRes = await fetch(
    `https://watify.io/fun/watifyExtApi?getFlowcharts=1&token=${token}`
  );
  let flowCharts = await flowChartsRes.text();
  flowCharts = JSON.parse(flowCharts);
  console.log("flowchart--->",(flowCharts) );
  
  notifyForBot();
  if (flowCharts.status == 200) return flowCharts.data;
  else return false;
}

async function showFlowcharts() {
  console.log("showFlowcharts");
  let flowCharts = await fetchFlowCharts();
  console.log(flowCharts, "flowCharts");
  if (!flowCharts) return;
  flowCharts = Object.values(flowCharts);
  const flowChartsTab = document.getElementById("flowCharts-body");
  if (flowCharts.length == 0)
    flowChartsTab.innerHTML = `<tr class="odd"><td valign="top" colspan="6" class="dataTables_empty">No flowCharts available</td></tr>`;
  else {
    flowChartsTab.innerHTML = ""; // clear before re-render
    flowCharts.forEach((flowCharts, index) => {
      const flowChartsEle = document.createElement("tr");
      flowChartsEle.classList.add("flowCharts");
      flowChartsEle.innerHTML = flowChartsBody(flowCharts, index);
      flowChartsTab.appendChild(flowChartsEle);
    });
  }
}

function initFlowchartsHandler() {
  console.log("initFlowchartsHandler");
  // showFlowcharts();
  flowChartsListeners();
}

export { initFlowchartsHandler };
