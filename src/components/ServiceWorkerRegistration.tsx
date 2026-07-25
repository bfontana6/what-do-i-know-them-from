'use client';
import { useEffect } from 'react';

/**
 * Registers the app's service worker after hydration.
 * Rendered in the root layout so it runs on every page load.
 * Only registers in production — the service worker is not generated during dev builds.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }
  }, []);

  return null;
}
