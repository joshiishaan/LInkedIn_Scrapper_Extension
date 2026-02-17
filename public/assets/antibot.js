function getCookie(name) {
  const cookies = `; ${document.cookie}`.split(`; ${name}=`);
  if (cookies.length === 2) return cookies.pop().split(";").shift();
}

// Set Ember debug mode (LinkedIn uses Ember.js)
window.EmberENV = { _DEBUG_RENDER_TREE: true };

// Check for LinkedIn protection and bypass
if (getCookie("li-protect") === "true" && !window.fetchReplaced) {
  window.fetchReplaced = true;
  
  window.fetch = new Proxy(window.fetch, {
    apply: function (target, thisArg, args) {
      if (
        args.length > 0 &&
        typeof args[0] === "string" &&
        typeof args[0].includes === "function" &&
        args[0].includes("lnokhhhekhiapce")
      ) {
        args[0] = "chrome-extension://xxxxxxxxxxxxxxxx/index.js";
      }
      return target.apply(thisArg, args);
    }
  });
}
