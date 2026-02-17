if (document.contentType === "text/html") {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("assets/antibot.js");
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}
