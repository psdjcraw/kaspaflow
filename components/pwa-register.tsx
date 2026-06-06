"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await registration.update();
        console.log("[PWA] sw registered");
      } catch (err) {
        console.error("[PWA] sw registration failed", err);
      }
    });
  }, []);

  return null;
}
