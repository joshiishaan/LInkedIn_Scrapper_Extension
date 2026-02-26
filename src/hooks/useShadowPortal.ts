import { useMemo, useEffect } from "react";

export function useShadowPortal(isOpen: boolean) {
  const shadowRoot = useMemo(() => {
    if (!isOpen) return null;

    const host = document.createElement("div");
    host.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483648;";

    const shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);

    return { shadow, host };
  }, [isOpen]);

  useEffect(() => {
    if (!shadowRoot) return;
    return () => {
      shadowRoot.host.remove();
    };
  }, [shadowRoot]);

  return shadowRoot?.shadow || null;
}
