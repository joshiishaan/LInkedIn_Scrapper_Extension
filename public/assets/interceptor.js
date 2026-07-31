// public/assets/interceptor.js
/**
 * LinkedIn Messaging Interceptor
 * Hooks fetch + XHR in the page context and emits HL_NETWORK_CALL events
 * for Voyager Messaging GraphQL requests that return messenger messages.
 */

(function () {
  if (window.__hlMessageInterceptorInstalled) return;
  window.__hlMessageInterceptorInstalled = true;

  /**
   * Debug logging switch.
   *
   * This file lives in public/ and is injected verbatim into the page's MAIN
   * world — Vite never bundles it, so the `dlog` helper and its build-time
   * tree-shaking are unavailable here. Gate on a constant instead.
   *
   * Leave FALSE for releases. Flip to true (or set window.__hlDebug = true from
   * the console before LinkedIn boots) while diagnosing message counts.
   */
  var HL_DEBUG = false;
  function dbg() {
    if (!HL_DEBUG && !window.__hlDebug) return;
    try {
      console.log.apply(console, arguments);
    } catch (e) {
      /* console unavailable — ignore */
    }
  }

  dbg("[HL-DBG] interceptor installed @", location.href, "isTop=", window.top === window);

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
    invitationKind,
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
      if (invitationKind) detail.invitationKind = invitationKind;

      // [HL-DBG] temporary: log messaging/seen emissions so we can see whether
      // requests are being classified + dispatched at all.
      if (
        detail.type === "HL_INTERNAL_LINKEDIN_MESSAGES" ||
        detail.type === "HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS"
      ) {
        try {
          dbg(
            "[HL-DBG] emit",
            detail.type,
            "status=",
            detail.statusCode,
            String(detail.callUrl).slice(0, 140),
          );
        } catch (e) {
          /* ignore */
        }
      }

      // IMPORTANT: this interceptor runs in the MAIN world (registered as a
      // world:"MAIN" content script). A MAIN-world script's window.dispatchEvent
      // does NOT reach listeners in the isolated content-script world, so we do
      // not emit a window CustomEvent here. Instead every payload is bridged over
      // the SHARED DOM (a hidden node appended to the top document, which the
      // main-frame content script observes) to an isolated-world "event pump"
      // that re-dispatches HL_NETWORK_CALL *in-world* for the existing consumers
      // (message sync, profile interceptor, message-activity tracker). This is
      // the same DOM channel the connection tracker already relies on.
      postToContentViaDom(detail, "__hl_evt_bridge", "data-hl-evt");

      // The connection tracker consumes its own separate bridge. Keep feeding it
      // unchanged — only invitations (send/withdraw) and profiles (accepted
      // reconciliation), so we don't churn its observer with message/company
      // payloads it ignores.
      if (
        detail.type === "HL_INTERNAL_LINKEDIN_INVITATION" ||
        detail.type === "HL_INTERNAL_LINKEDIN_PROFILE"
      ) {
        postToContentViaDom(detail, "__hl_ct_bridge", "data-hl-ct");
      }
    } catch (err) {
      console.warn("[HL interceptor] emit error:", err);
    }
  }

  // Shared-DOM bridge: append <i {attr}='{json}'> under a hidden host node.
  // Deliver into the TOP document, because LinkedIn's SDUI can issue the request
  // from inside a same-origin iframe while the content script that consumes this
  // only runs in the main frame. Targeting window.top.document lands the payload
  // where the content script is actually observing. Falls back to the local
  // document if the top is cross-origin/inaccessible. hostId/attr let the same
  // mechanism feed two independent consumers: the event pump (__hl_evt_bridge /
  // data-hl-evt) and the connection tracker (__hl_ct_bridge / data-hl-ct).
  function postToContentViaDom(detail, hostId, attr) {
    hostId = hostId || "__hl_ct_bridge";
    attr = attr || "data-hl-ct";
    try {
      var doc = document;
      try {
        if (window.top && window.top.document) doc = window.top.document;
      } catch (e) {
        /* cross-origin top — use local document */
      }

      var host = doc.getElementById(hostId);
      if (!host) {
        host = doc.createElement("div");
        host.id = hostId;
        host.style.display = "none";
        (doc.documentElement || doc.body).appendChild(host);
      }
      var node = doc.createElement("i");
      node.setAttribute(attr, JSON.stringify(detail));
      host.appendChild(node);
    } catch (e) {
      console.warn("[HL interceptor] DOM bridge failed:", e);
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

  // Read receipts for a conversation (a separate messaging graphql query that
  // fires when a thread opens). Used to compute the "read" metric.
  function isMessengerSeenReceiptsRequest(url) {
    try {
      const u = new URL(url);
      if (!u.pathname.includes("/voyager/api/voyagerMessagingGraphQL/graphql")) {
        return false;
      }
      return (u.searchParams.get("queryId") || "").includes(
        "messengerSeenReceipts",
      );
    } catch {
      return false;
    }
  }

  // Conversation metadata — either a single thread OR the inbox list. Both carry
  // the participant roster (all parties) regardless of who has messaged, so this
  // is the authoritative source for recipient names, incl. cold no-reply threads.
  // Match the whole family (messengerConversations / …ByCategory / single) — the
  // tracker keys each conversation in the response by its own urn.
  function isMessengerConversationsRequest(url) {
    try {
      const u = new URL(url);
      if (!u.pathname.includes("/voyager/api/voyagerMessagingGraphQL/graphql")) {
        return false;
      }
      return (u.searchParams.get("queryId") || "").includes(
        "messengerConversation",
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

  // Classify a connection-invitation request into 'send' | 'withdraw' | null.
  // LinkedIn has two connect mechanisms and has moved the endpoint several times:
  //   (A) Server-Driven UI: POST /flagship-web/rsc-action/actions/server-request
  //       with the specific action in the `sduiid` query param
  //       (e.g. com.linkedin.sdui.requests.mynetwork.addaAddConnection).
  //   (B) Classic Voyager: an invitation/relationship path under /voyager/api,
  //       disambiguated by HTTP method + `action` query param.
  // Only mutating requests (POST/PUT/DELETE) can be sends/withdrawals.
  function classifyInvitationRequest(url, method) {
    try {
      const u = new URL(url, window.location.origin); // resolve relative URLs
      const m = (method || "GET").toUpperCase();
      if (m !== "POST" && m !== "PUT" && m !== "DELETE") return null;

      const path = u.pathname.toLowerCase();

      // (A) SDUI action endpoint — the action is named in `sduiid`.
      const sduiid = (u.searchParams.get("sduiid") || "").toLowerCase();
      if (sduiid) {
        // Match the real withdraw ACTION (…addaWithdrawInvitation), not the
        // …WithdrawConfirmationDialog that merely opens the confirm popup.
        if (sduiid.includes("withdrawinvitation")) return "withdraw";
        if (sduiid.includes("addconnection")) return "send";
        // Post-connect callback carries the invitee's firstName/lastName +
        // profileId — used to backfill the target name (esp. for the plain
        // profile Connect, whose send body has no name). Enrichment only.
        if (sduiid.includes("interopconnection")) return "enrich";
        return null; // other SDUI actions (render/pagination/etc.) — ignore
      }

      // (B) Classic Voyager invitation endpoints.
      if (!path.includes("/voyager/api/")) return null;
      const looksLikeInvitation =
        path.includes("norminvitations") ||
        path.includes("relationships/invitations") ||
        path.includes("dashinvitations") ||
        path.includes("dashmemberrelationships") ||
        path.includes("invitation");
      if (!looksLikeInvitation) return null;

      const action = (u.searchParams.get("action") || "").toLowerCase();
      const isWithdraw =
        m === "DELETE" ||
        action.includes("withdraw") ||
        action.includes("delete");
      if (isWithdraw) return "withdraw";
      return "send";
    } catch {
      return null;
    }
  }

  // --- Realtime (live messages) ---
  // LinkedIn pushes new messages over a long-lived realtime channel rather than a
  // normal request/response, so the fetch/XHR hooks above never see them. We tap
  // all three possible transports (fetch stream to /realtime/connect, WebSocket,
  // EventSource), scan each frame for message-shaped objects, and bridge them to
  // the tracker as HL_INTERNAL_LINKEDIN_REALTIME_MSG so counts update live.

  function isRealtimeConnectRequest(url) {
    try {
      return new URL(url, window.location.origin).pathname.indexOf(
        "/realtime/connect",
      ) === 0;
    } catch (e) {
      return String(url).indexOf("/realtime/connect") >= 0;
    }
  }

  // Bridge an arbitrary detail to the isolated-world event pump (same DOM channel
  // emitHlNetworkCall uses) so the tracker receives it as an HL_NETWORK_CALL.
  function bridgeDetail(detail) {
    postToContentViaDom(detail, "__hl_evt_bridge", "data-hl-evt");
  }

  // Pull the CONVERSATION id ("2-…") out of a message object. It must come from
  // the conversation urn, never just the first "2-…" in the blob — a message's
  // own entity urn also starts with "2-", and grabbing that would mint a bogus
  // per-message key (→ duplicate rows). Return null if we can't find the real
  // conversation urn, so the tracker skips it (the normal fetch will catch it).
  function realtimeConversationKey(msg) {
    try {
      var s = JSON.stringify(msg);
      // …urn:li:msg_conversation:(urn:li:fsd_profile:ACoAA…,2-<CONV>)…
      var m = s.match(/msg_conversation[^"]*?(2-[A-Za-z0-9_=\-]{5,})/);
      if (m) return m[1];
      // …"conversationUrn":"…2-<CONV>" (and common variants).
      m = s.match(
        /"(?:conversationUrn|backendConversationUrn|backendUrn|conversation)"\s*:\s*"[^"]*?(2-[A-Za-z0-9_=\-]{5,})/,
      );
      if (m) return m[1];
      return null;
    } catch (e) {
      return null;
    }
  }

  // Recursively collect message-shaped nodes (have a numeric deliveredAt and a
  // sender/actor) from a parsed realtime frame.
  function collectRealtimeMessages(root) {
    var out = [];
    var seen = 0;
    function walk(node) {
      if (!node || typeof node !== "object" || seen > 5000) return;
      seen++;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i]);
        return;
      }
      if (typeof node.deliveredAt === "number" && (node.sender || node.actor)) {
        var key = realtimeConversationKey(node);
        if (key) out.push({ conversationKey: key, message: node });
      }
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
      }
    }
    walk(root);
    return out;
  }

  function acoOf(v) {
    var m = String(v == null ? "" : v).match(/ACoAA[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  }

  // Collect read-receipt nodes (have a numeric seenAt + a participant) from a
  // realtime frame. LinkedIn pushes these when the recipient reads your message,
  // so "read" can advance live without re-fetching the thread.
  function collectRealtimeSeen(root) {
    var out = [];
    var seen = 0;
    function walk(node) {
      if (!node || typeof node !== "object" || seen > 5000) return;
      seen++;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i]);
        return;
      }
      if (typeof node.seenAt === "number") {
        var p = node.seenByParticipant || node.actor || node.participant;
        var host = p && (p.hostIdentityUrn || p.entityUrn);
        var key = realtimeConversationKey(node);
        if (host && key) {
          out.push({ conversationKey: key, seerId: acoOf(host), seenAt: node.seenAt });
        }
      }
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
      }
    }
    walk(root);
    return out;
  }

  function handleRealtimeText(text) {
    if (!text || typeof text !== "string") return;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("data:") === 0) line = line.slice(5).trim(); // SSE framing
      if (line[0] !== "{" && line[0] !== "[") continue;
      var json;
      try {
        json = JSON.parse(line);
      } catch (e) {
        continue;
      }
      var msgs = collectRealtimeMessages(json);
      for (var j = 0; j < msgs.length; j++) {
        try {
          dbg("[HL-DBG] realtime msg ->", msgs[j].conversationKey); // [HL-DBG]
        } catch (e) {
          /* ignore */
        }
        bridgeDetail({
          type: "HL_INTERNAL_LINKEDIN_REALTIME_MSG",
          conversationKey: msgs[j].conversationKey,
          message: msgs[j].message,
          statusCode: 200,
          callUrl: "",
        });
      }
      var seens = collectRealtimeSeen(json);
      for (var s = 0; s < seens.length; s++) {
        try {
          dbg(
            "[HL-DBG] realtime seen ->",
            seens[s].conversationKey,
            "seenAt=",
            seens[s].seenAt,
          ); // [HL-DBG]
        } catch (e) {
          /* ignore */
        }
        bridgeDetail({
          type: "HL_INTERNAL_LINKEDIN_REALTIME_SEEN",
          conversationKey: seens[s].conversationKey,
          seerId: seens[s].seerId,
          seenAt: seens[s].seenAt,
          statusCode: 200,
          callUrl: "",
        });
      }
    }
  }

  // Incrementally read a streaming realtime fetch response without blocking it.
  function pumpRealtimeStream(response) {
    try {
      if (!response || !response.body || !response.body.getReader) return;
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      function read() {
        reader
          .read()
          .then(function (res) {
            if (res.done) return;
            buffer += decoder.decode(res.value, { stream: true });
            var idx;
            while ((idx = buffer.indexOf("\n")) >= 0) {
              handleRealtimeText(buffer.slice(0, idx));
              buffer = buffer.slice(idx + 1);
            }
            read();
          })
          .catch(function () {
            /* stream closed */
          });
      }
      read();
    } catch (e) {
      /* ignore */
    }
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
      const isSeen      = isMessengerSeenReceiptsRequest(url);
      const isConvo     = isMessengerConversationsRequest(url);
      const isProfile   = isProfileDataRequest(url);
      const isCompany   = isCompanyDataRequest(url);
      const invitationKind = classifyInvitationRequest(url, method);
      const isInvitation = !!invitationKind;
      const shouldWatch = isMessaging || isSeen || isConvo || isProfile || isCompany || isInvitation;
      let requestBody = init.body;

      const response = await originalFetch.apply(this, args);

      // Realtime message stream: read it incrementally (don't await full text,
      // which would never resolve on a long-lived connection).
      if (isRealtimeConnectRequest(url)) {
        try {
          dbg("[HL-DBG] realtime fetch stream ->", url.slice(0, 80)); // [HL-DBG]
          pumpRealtimeStream(response.clone());
        } catch (e) {
          /* ignore */
        }
        return response;
      }

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
          : isSeen
            ? "HL_INTERNAL_LINKEDIN_SEEN_RECEIPTS"
            : isConvo
              ? "HL_INTERNAL_LINKEDIN_CONVERSATION"
              : isProfile
                ? "HL_INTERNAL_LINKEDIN_PROFILE"
                : isCompany
                  ? "HL_INTERNAL_LINKEDIN_COMPANY"
                  : "HL_INTERNAL_LINKEDIN_INVITATION";

        emitHlNetworkCall({
          url,
          method,
          requestBody,
          responseBody: parsed,
          status: response.status,
          requestHeaders: pickLinkedInHeaders(init.headers),
          type,
          invitationKind,
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
          const invitationKind = classifyInvitationRequest(requestUrl, method);
          const isInvitation = !!invitationKind;
          if (!isMessaging && !isProfile && !isCompany && !isInvitation) return;

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
              : isCompany
                ? "HL_INTERNAL_LINKEDIN_COMPANY"
                : "HL_INTERNAL_LINKEDIN_INVITATION";

          emitHlNetworkCall({
            url: requestUrl,
            method,
            requestBody,
            responseBody,
            status: xhr.status,
            type,
            invitationKind,
          });
        });

        return originalSend.call(xhr, body);
      };

      return xhr;
    }

    window.XMLHttpRequest = WrappedXHR;
  }

  // --- WebSocket hook (realtime transport, belt-and-suspenders) ---
  if (window.WebSocket && !window.__hlWsWrapped) {
    window.__hlWsWrapped = true;
    const OrigWS = window.WebSocket;
    function WrappedWS(url, protocols) {
      const ws =
        protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
      try {
        dbg("[HL-DBG] WS opened ->", String(url).slice(0, 80)); // [HL-DBG]
        ws.addEventListener("message", function (ev) {
          try {
            if (typeof ev.data === "string") handleRealtimeText(ev.data);
          } catch (e) {
            /* ignore */
          }
        });
      } catch (e) {
        /* ignore */
      }
      return ws;
    }
    WrappedWS.prototype = OrigWS.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) {
      try {
        WrappedWS[k] = OrigWS[k];
      } catch (e) {
        /* ignore */
      }
    });
    window.WebSocket = WrappedWS;
  }

  // --- EventSource hook (realtime transport, belt-and-suspenders) ---
  if (window.EventSource && !window.__hlEsWrapped) {
    window.__hlEsWrapped = true;
    const OrigES = window.EventSource;
    function WrappedES(url, config) {
      const es = config !== undefined ? new OrigES(url, config) : new OrigES(url);
      try {
        dbg("[HL-DBG] ES opened ->", String(url).slice(0, 80)); // [HL-DBG]
        es.addEventListener("message", function (ev) {
          try {
            if (typeof ev.data === "string") handleRealtimeText(ev.data);
          } catch (e) {
            /* ignore */
          }
        });
      } catch (e) {
        /* ignore */
      }
      return es;
    }
    WrappedES.prototype = OrigES.prototype;
    window.EventSource = WrappedES;
  }
})();
