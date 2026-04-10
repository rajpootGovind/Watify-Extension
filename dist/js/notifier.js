async function notify(runtime, message) {
  // console.log("inside notify posting", message);
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  console.log(tab, "Tab");
  const response = await chrome.tabs.sendMessage(tab.id, {
    message,
  });
  // console.log(response, "Res"); // );
  // do something with response here, not outside the function
}

export { notify };