self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// Intentionally no fetch handler yet.
// Future PWA work can add offline pages, asset precaching, and API cache rules here.
