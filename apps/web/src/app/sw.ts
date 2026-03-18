/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Push notification handler — skip if app is focused
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const { title, body, icon, tag, data } = payload;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const isFocused = clients.some((c) => c.visibilityState === "visible");
      if (isFocused) return;

      return self.registration.showNotification(title, {
        body,
        icon: icon ?? "/icons/icon-192.png",
        tag,
        data,
        badge: "/icons/icon-96.png",
      });
    }),
  );
});

// Notification click handler — open/focus app and navigate
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  let targetPath = "/game";

  if (data?.type === "pvp") {
    targetPath = "/game?screen=arena";
  } else if (data?.type === "boss") {
    targetPath = "/game?screen=worldEvents";
  } else if (data?.type === "expedition") {
    targetPath = "/game?screen=guild";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes("/game"));
      if (existing) {
        existing.focus();
        existing.navigate(targetPath);
        return;
      }
      return self.clients.openWindow(targetPath);
    }),
  );
});
