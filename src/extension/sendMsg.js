const { sleep } = require("./sleep");

async function sendMsg(data, number) {
  try {
    // ✅ FIX: was number.contains() which doesn't exist on strings
    if (!number.includes("@c.us")) number = number + "@c.us";

    let msgRes;

    if (data.media && data.media !== "") {
      const { file, fileType, filename } = data.media;

      const convert = {
        "&#96;": "`",
        "&quot;": '"',
        "&apos;": "'",
      };
      let caption = (data.caption || "").replace(
        /&#96;|&quot;|&apos;/g,
        (m) => convert[m]
      );

      await sleep(1500);

      const msgOptions = {
        type: fileType,
        caption: caption,
        filename: filename,
        createChat: true,
        delay: 500,
      };

      msgRes = await window.WPP.chat.sendFileMessage(number, file, msgOptions);
    } else {
      const msgOptions = {
        delay: 500,
        createChat: true,
      };
      msgRes = await window.WPP.chat.sendTextMessage(
        number,
        data.caption || "",
        msgOptions
      );
    }

    const res = await msgRes.sendMsgResult;
    if (res && res.messageSendResult === "OK") {
      return true;
    }
    return false;
  } catch (error) {
    console.log("error on sendMsg", error);
    return false;
  }
}

module.exports = { sendMsg };