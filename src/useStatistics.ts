import { useEffect, useRef } from "react";

export default function useStatistics(view: string, ready: boolean) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || previous.current === view) return;
    if (
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true
    )
      return;
    const entry = previous.current === null;
    previous.current = view;
    void fetch("/api/statistics/view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Futboleros-Event": "1",
      },
      body: JSON.stringify({ view, entry }),
      keepalive: true,
    }).catch(() => {});
  }, [view, ready]);
}
