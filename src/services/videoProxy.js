/**
 * videoProxy.js
 * Proxies video URLs through Tauri HTTP to create blob URLs for playback.
 * This bypasses CORS issues in Tauri production builds.
 */

import { httpFetch } from './httpClient.js';

// Check if we're running in a Tauri context
const isTauri = () => {
    return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
};

// Cache for blob URLs to avoid re-fetching
const blobUrlCache = new Map();

/**
 * Get a playable video URL. In Tauri production, fetches the video and creates a blob URL.
 * In development (browser), returns the original URL (Vite proxy handles CORS).
 * @param {string} url - The original video URL
 * @returns {Promise<string>} - A playable URL (blob URL in Tauri, original in dev)
 */
export async function getPlayableVideoUrl(url) {
    if (!url) return url;

    // Check if it's a video URL that needs proxying
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
    if (!isVideo) return url;

    // In development, use proxy URLs (already handled by Vite)
    if (import.meta.env && import.meta.env.DEV) {
        return url;
    }

    // In Tauri production, fetch as blob
    if (isTauri()) {
        // Check cache first
        if (blobUrlCache.has(url)) {
            return blobUrlCache.get(url);
        }

        try {
            console.log('[VideoProxy] Fetching video as blob:', url);
            const response = await httpFetch(url, {
                method: 'GET',
            });

            if (!response.ok) {
                console.error('[VideoProxy] Failed to fetch video:', response.status);
                return url; // Fall back to original URL
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            // Cache the blob URL
            blobUrlCache.set(url, blobUrl);
            console.log('[VideoProxy] Created blob URL for video');

            return blobUrl;
        } catch (error) {
            console.error('[VideoProxy] Error proxying video:', error);
            return url; // Fall back to original URL
        }
    }

    return url;
}

/**
 * Revoke a blob URL to free memory
 * @param {string} blobUrl - The blob URL to revoke
 */
export function revokeBlobUrl(blobUrl) {
    if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
        // Remove from cache
        for (const [originalUrl, cachedBlobUrl] of blobUrlCache.entries()) {
            if (cachedBlobUrl === blobUrl) {
                blobUrlCache.delete(originalUrl);
                break;
            }
        }
    }
}

/**
 * Clear all cached blob URLs
 */
export function clearBlobCache() {
    for (const blobUrl of blobUrlCache.values()) {
        URL.revokeObjectURL(blobUrl);
    }
    blobUrlCache.clear();
}

export default {
    getPlayableVideoUrl,
    revokeBlobUrl,
    clearBlobCache
};
