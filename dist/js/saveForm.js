async function saveCampaign(formData) {
  try {
    const res = await fetch("https://watify.io/fun/extFun/manageBulk", {
      method: "POST",
      body: formData,
    });
    const data = await res.text();
    // console.log("res bulk", data);
    return data;
  } catch (error) {
    // console.log("err bulk", error);
    return false;
  }
}
export { saveCampaign };
