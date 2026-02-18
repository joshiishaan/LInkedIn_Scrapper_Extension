chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_PROFILE") {
    sendResponse({ success: true });
  }

  if (message.action === "openPopup") {
    chrome.action.openPopup();
    sendResponse({ success: true });
  }
  return true;
});
