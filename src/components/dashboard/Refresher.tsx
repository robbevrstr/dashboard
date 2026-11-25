"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the server tiles now and then, so "Now" and the deadlines don't go stale on a
 * dashboard that stays open all day. Also when you come back to the tab after a while.
 */
export function Refresher({ every = 5 * 60_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, every);
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, every]);
  return null;
}
