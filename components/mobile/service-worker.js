/**
 * CAOS CRM Mobile - Service Worker
 * Provides offline functionality and caching for the mobile PWA
 */

const CACHE_NAME = 'caos-crm-mobile-v1.0.0';
const API_CACHE_NAME = 'caos-crm-api-v1.0.0';
const STATIC_CACHE_NAME = 'caos-crm-static-v1.0.0';

// Static resources to cache
const STATIC_RESOURCES = [
    './Mobile.html',
    './manifest.json',
    '../../styles/snowui.css',
    '../ui/DataTable.html',
    '../ui/Navigation.html',
    '../ui/Feedback.html'
];

// API endpoints to cache
const CACHED_ENDPOINTS = [
    '/api/mobile/dashboard',
    '/api/mobile/leads',
    '/api/mobile/tasks',
    '/api/mobile/calendar/events',
    '/api/mobile/session',
    '/api/mobile/sync/status'
];

// Network timeout settings
const CACHE_TIMEOUT = 5000; // 5 seconds
const BACKGROUND_SYNC_TAG = 'caos-crm-sync';

// Install event - cache static resources
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');

    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE_NAME).then((cache) => {
                console.log('[ServiceWorker] Caching static resources');
                return cache.addAll(STATIC_RESOURCES.map(url => new Request(url, { cache: 'reload' })));
            }),
            caches.open(API_CACHE_NAME).then((cache) => {
                console.log('[ServiceWorker] API cache ready');
                return cache;
            })
        ]).then(() => {
            console.log('[ServiceWorker] Installation complete');
            // Skip waiting to activate immediately
            return self.skipWaiting();
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME &&
                        cacheName !== API_CACHE_NAME &&
                        cacheName !== STATIC_CACHE_NAME) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[ServiceWorker] Activation complete');
            // Take control of all clients immediately
            return self.clients.claim();
        })
    );
});

// Fetch event - handle network requests with caching strategy
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Handle different types of requests
    if (request.method === 'GET') {
        if (url.pathname.startsWith('/api/mobile/')) {
            // API requests - Cache First with Network Fallback
            event.respondWith(handleApiRequest(request));
        } else if (url.pathname.includes('.html') ||
                   url.pathname.includes('.css') ||
                   url.pathname.includes('.js')) {
            // Static resources - Cache First
            event.respondWith(handleStaticRequest(request));
        } else {
            // Other requests - Network First
            event.respondWith(handleNetworkFirst(request));
        }
    } else if (request.method === 'POST' || request.method === 'PUT') {
        // Data modification requests - handle offline queue
        event.respondWith(handleDataModification(request));
    }
});

// Handle API requests with intelligent caching
async function handleApiRequest(request) {
    const url = new URL(request.url);
    const cacheKey = url.pathname + url.search;

    try {
        // Try network first with timeout
        const networkPromise = fetchWithTimeout(request, CACHE_TIMEOUT);
        const response = await networkPromise;

        if (response.ok) {
            // Cache successful responses
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(cacheKey, response.clone());
        }

        return response;
    } catch (error) {
        console.log('[ServiceWorker] Network failed, trying cache for:', cacheKey);

        // Fallback to cache
        const cachedResponse = await caches.match(cacheKey);
        if (cachedResponse) {
            // Add offline header
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-Served-From-Cache', 'true');

            return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers: headers
            });
        }

        // Return offline response
        return new Response(
            JSON.stringify({
                success: false,
                message: 'Offline - data not available in cache',
                offline: true
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Handle static resource requests
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[ServiceWorker] Failed to fetch static resource:', request.url);

        // Return offline page for HTML requests
        if (request.url.includes('.html')) {
            return new Response(
                generateOfflinePage(),
                { headers: { 'Content-Type': 'text/html' } }
            );
        }

        throw error;
    }
}

// Handle network-first requests
async function handleNetworkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Handle data modification requests (POST, PUT, DELETE)
async function handleDataModification(request) {
    try {
        // Try network first
        const response = await fetch(request);
        return response;
    } catch (error) {
        console.log('[ServiceWorker] Queuing request for background sync');

        // Queue for background sync
        await queueRequest(request);

        // Return synthetic response
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Request queued for when online',
                queued: true
            }),
            {
                status: 202, // Accepted
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Background sync event
self.addEventListener('sync', (event) => {
    console.log('[ServiceWorker] Background sync:', event.tag);

    if (event.tag === BACKGROUND_SYNC_TAG) {
        event.waitUntil(syncQueuedRequests());
    }
});

// Queue request for background sync
async function queueRequest(request) {
    const requestData = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: request.method !== 'GET' ? await request.text() : null,
        timestamp: Date.now()
    };

    // Store in IndexedDB
    const db = await openDB();
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    await store.add(requestData);

    // Register background sync
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        const registration = await self.registration;
        await registration.sync.register(BACKGROUND_SYNC_TAG);
    }
}

// Sync queued requests
async function syncQueuedRequests() {
    const db = await openDB();
    const transaction = db.transaction(['requests'], 'readonly');
    const store = transaction.objectStore('requests');
    const requests = await store.getAll();

    console.log(`[ServiceWorker] Syncing ${requests.length} queued requests`);

    for (const requestData of requests) {
        try {
            const response = await fetch(requestData.url, {
                method: requestData.method,
                headers: requestData.headers,
                body: requestData.body
            });

            if (response.ok) {
                // Remove from queue
                const deleteTransaction = db.transaction(['requests'], 'readwrite');
                const deleteStore = deleteTransaction.objectStore('requests');
                await deleteStore.delete(requestData.id);

                console.log('[ServiceWorker] Synced request:', requestData.url);
            }
        } catch (error) {
            console.log('[ServiceWorker] Failed to sync request:', requestData.url, error);
        }
    }
}

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[ServiceWorker] Push received');

    let notificationData = {};

    if (event.data) {
        notificationData = event.data.json();
    } else {
        notificationData = {
            title: 'CAOS CRM',
            body: 'New notification',
            icon: './manifest.json'
        };
    }

    const options = {
        title: notificationData.title,
        body: notificationData.body,
        icon: notificationData.icon || './manifest.json',
        badge: './manifest.json',
        tag: notificationData.tag || 'caos-crm',
        data: notificationData.data,
        actions: notificationData.actions || [
            {
                action: 'open',
                title: 'Open CRM'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(options.title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[ServiceWorker] Notification clicked:', event.notification.tag);

    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                // Check if CRM is already open
                for (const client of clientList) {
                    if (client.url.includes('Mobile.html') && 'focus' in client) {
                        return client.focus();
                    }
                }

                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow('./Mobile.html');
                }
            })
        );
    }
});

// Utility functions
function fetchWithTimeout(request, timeout) {
    return Promise.race([
        fetch(request),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), timeout)
        )
    ]);
}

function generateOfflinePage() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CAOS CRM - Offline</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                    color: #374151;
                }
                .offline-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }
                .offline-title {
                    font-size: 1.5rem;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }
                .offline-message {
                    text-align: center;
                    color: #6b7280;
                    margin-bottom: 2rem;
                }
                .retry-button {
                    background: #2563eb;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="offline-icon">📱</div>
            <div class="offline-title">You're Offline</div>
            <div class="offline-message">
                CAOS CRM is not available right now.<br>
                Please check your connection and try again.
            </div>
            <button class="retry-button" onclick="window.location.reload()">
                Try Again
            </button>
        </body>
        </html>
    `;
}

// IndexedDB setup for offline queue
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('caos-crm-offline', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const store = db.createObjectStore('requests', {
                keyPath: 'id',
                autoIncrement: true
            });
            store.createIndex('timestamp', 'timestamp', { unique: false });
        };
    });
}

// Cache management
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        console.log('[ServiceWorker] Clearing cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            })
        );
    }

    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        event.waitUntil(getCacheSize().then((size) => {
            event.ports[0].postMessage({ size });
        }));
    }
});

async function getCacheSize() {
    const cacheNames = await caches.keys();
    let totalSize = 0;

    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
            }
        }
    }

    return totalSize;
}

console.log('[ServiceWorker] Service Worker registered and ready');