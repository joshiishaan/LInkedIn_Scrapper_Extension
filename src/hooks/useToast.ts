import { useState, useEffect, useCallback } from "react";

export type ToastState = {
  show: boolean;
  message: string;
  type: "success" | "error";
};

const DEFAULT_DURATION_MS = 3000;

export function useToast(durationMs = DEFAULT_DURATION_MS) {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    if (!toast.show) return;
    const t = window.setTimeout(
      () => setToast((prev) => ({ ...prev, show: false })),
      durationMs,
    );
    return () => window.clearTimeout(t);
  }, [toast.show, durationMs]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ show: true, message, type });
    },
    [],
  );

  return { toast, showToast };
}
