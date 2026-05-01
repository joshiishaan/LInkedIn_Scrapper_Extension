// public/assets/interceptor.js
/**
 * LinkedIn Messaging Interceptor
 * Hooks fetch + XHR in the page context and emits HL_NETWORK_CALL events
 * for Voyager Messaging GraphQL requests that return messenger messages.
 */

(function () {
  if (window.__hlMessageInterceptorInstalled) return;
  window.__hlMessageInterceptorInstalled = true;

  function pickLinkedInHeaders(headersInit) {
    const picked = {};
    if (!headersInit) return picked;

    const setHeader = (k, v) => {
      const key = k.toLowerCase();
      if (
        key === "x-li-page-instance" ||
        key === "x-li-track" ||
        key === "x-li-lang"
      ) {
        picked[key] = String(v);
      }
    };

    if (headersInit instanceof Headers) {
      headersInit.forEach((value, key) => setHeader(key, value));
    } else if (Array.isArray(headersInit)) {
      headersInit.forEach(([key, value]) => setHeader(key, value));
    } else if (typeof headersInit === "object") {
      Object.entries(headersInit).forEach(([key, value]) =>
        setHeader(key, value),
      );
    }

    return picked;
  }

  function parseBodySafe(body) {
    if (!body) return null;
    try {
      if (typeof body === "string") {
        return JSON.parse(body);
      }
      return body;
    } catch {
      return body;
    }
  }

  function emitHlNetworkCall({
    url,
    method,
    requestBody,
    responseBody,
    status,
    requestHeaders,
    type,
  }) {
    try {
      const detail = {
        type: type || "HL_INTERNAL_LINKEDIN_MESSAGES",
        pageUrl: window.location.href,
        callUrl: url,
        method,
        requestBody: parseBodySafe(requestBody),
        responseBody: parseBodySafe(responseBody),
        statusCode: status,
        timestamp: Date.now(),
        requestHeaders: requestHeaders || {},
      };

      window.dispatchEvent(new CustomEvent("HL_NETWORK_CALL", { detail }));
    } catch (err) {
      console.warn("[HL interceptor] emit error:", err);
    }
  }

  function isMessengerMessagesRequest(url) {
    try {
      const u = new URL(url);
      if (
        !u.pathname.includes("/voyager/api/voyagerMessagingGraphQL/graphql")
      ) {
        return false;
      }
      const queryId = u.searchParams.get("queryId") || "";
      const variables = u.searchParams.get("variables") || "";
      return (
        queryId.includes("messengerMessages") &&
        variables.includes("conversationUrn:urn")
      );
    } catch {
      return false;
    }
  }

  function isProfileDataRequest(url) {
    try {
      const u = new URL(url);
      return u.pathname.includes("/voyager/api/identity/dash/profiles");
    } catch { return false; }
  }

  function isCompanyDataRequest(url) {
    try {
      const u = new URL(url);
      return u.pathname.includes("/voyager/api/organization/companies");
    } catch { return false; }
  }

  // --- fetch hook ---
  if (typeof window.fetch === "function" && !window.__hlFetchWrapped) {
    window.__hlFetchWrapped = true;
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      const method = (init.method || "GET").toUpperCase();
      const url = typeof input === "string" ? input : input.url;

      const isMessaging = isMessengerMessagesRequest(url);
      const isProfile   = isProfileDataRequest(url);
      const isCompany   = isCompanyDataRequest(url);
      const shouldWatch = isMessaging || isProfile || isCompany;
      let requestBody = init.body;

      const response = await originalFetch.apply(this, args);

      if (!shouldWatch) {
        return response;
      }

      try {
        const clone = response.clone();
        const text = await clone.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }

        const type = isMessaging
          ? "HL_INTERNAL_LINKEDIN_MESSAGES"
          : isProfile
            ? "HL_INTERNAL_LINKEDIN_PROFILE"
            : "HL_INTERNAL_LINKEDIN_COMPANY";

        emitHlNetworkCall({
          url,
          method,
          requestBody,
          responseBody: parsed,
          status: response.status,
          requestHeaders: pickLinkedInHeaders(init.headers),
          type,
        });
      } catch (err) {
        console.warn("[HL interceptor] fetch hook error:", err);
      }

      return response;
    };
  }

  // --- XHR hook (for safety, though LinkedIn mostly uses fetch) ---
  if (window.XMLHttpRequest && !window.__hlXhrWrapped) {
    window.__hlXhrWrapped = true;
    const OriginalXHR = window.XMLHttpRequest;

    function WrappedXHR() {
      const xhr = new OriginalXHR();
      let requestUrl = "";
      let method = "GET";
      let requestBody = null;

      const originalOpen = xhr.open;
      xhr.open = function (m, url, ...rest) {
        method = (m || "GET").toUpperCase();
        requestUrl = url;
        return originalOpen.call(xhr, m, url, ...rest);
      };

      const originalSend = xhr.send;
      xhr.send = function (body) {
        requestBody = body;
        xhr.addEventListener("loadend", function () {
          const isMessaging = isMessengerMessagesRequest(requestUrl);
          const isProfile   = isProfileDataRequest(requestUrl);
          const isCompany   = isCompanyDataRequest(requestUrl);
          if (!isMessaging && !isProfile && !isCompany) return;

          let responseBody = xhr.response;
          try {
            if (typeof responseBody === "string") {
              responseBody = JSON.parse(responseBody);
            }
          } catch {
            // keep as text
          }

          const type = isMessaging
            ? "HL_INTERNAL_LINKEDIN_MESSAGES"
            : isProfile
              ? "HL_INTERNAL_LINKEDIN_PROFILE"
              : "HL_INTERNAL_LINKEDIN_COMPANY";

          emitHlNetworkCall({
            url: requestUrl,
            method,
            requestBody,
            responseBody,
            status: xhr.status,
            type,
          });
        });

        return originalSend.call(xhr, body);
      };

      return xhr;
    }

    window.XMLHttpRequest = WrappedXHR;
  }
})();
