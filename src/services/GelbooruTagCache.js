/**
 * Service for caching Gelbooru tag categories locally
 * This avoids making repeated API calls for the same tags
 */

const STORAGE_KEY = 'gelbooru_tag_cache';

class GelbooruTagCache {
    constructor() {
        this.cache = new Map();
        this.loadFromStorage();
    }

    /**
     * Load cached tags from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.cache = new Map(Object.entries(parsed));
                console.log(`[TagCache] Loaded ${this.cache.size} cached tags`);
            }
        } catch (e) {
            console.error('[TagCache] Failed to load from storage:', e);
            this.cache = new Map();
        }
    }

    /**
     * Save cache to localStorage
     */
    saveToStorage() {
        try {
            const obj = Object.fromEntries(this.cache);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        } catch (e) {
            console.error('[TagCache] Failed to save to storage:', e);
        }
    }

    /**
     * Get the category number for a tag
     * @param {string} tag - Tag name
     * @returns {number|null} - Category number (0=General, 1=Artist, 3=Copyright, 4=Character, 5=Meta) or null if not cached
     */
    getCategory(tag) {
        return this.cache.get(tag) ?? null;
    }

    /**
     * Set the category for a tag
     * @param {string} tag - Tag name
     * @param {number} category - Category number
     */
    setCategory(tag, category) {
        this.cache.set(tag, category);
    }

    /**
     * Get tags that are NOT in the cache
     * @param {string[]} tags - Array of tag names
     * @returns {string[]} - Tags that need to be fetched
     */
    getUncachedTags(tags) {
        return tags.filter(tag => !this.cache.has(tag));
    }

    /**
     * Categorize tags into groups based on their category
     * @param {string[]} tags - Array of tag names
     * @returns {Object} - Object with categorized tags
     */
    categorizeTags(tags) {
        const result = {
            general: [],
            artist: [],
            copyright: [],
            character: [],
            meta: [],
        };

        for (const tag of tags) {
            const category = this.cache.get(tag);
            switch (category) {
                case 1:
                    result.artist.push(tag);
                    break;
                case 3:
                    result.copyright.push(tag);
                    break;
                case 4:
                    result.character.push(tag);
                    break;
                case 5:
                    result.meta.push(tag);
                    break;
                default:
                    // Category 0 or unknown = general
                    result.general.push(tag);
                    break;
            }
        }

        return result;
    }

    /**
     * Get cache statistics
     * @returns {Object} - Stats about the cache
     */
    getStats() {
        let general = 0, artist = 0, copyright = 0, character = 0, meta = 0;
        for (const category of this.cache.values()) {
            switch (category) {
                case 0: general++; break;
                case 1: artist++; break;
                case 3: copyright++; break;
                case 4: character++; break;
                case 5: meta++; break;
            }
        }
        return {
            total: this.cache.size,
            general,
            artist,
            copyright,
            character,
            meta,
        };
    }

    /**
     * Clear the entire cache
     */
    clear() {
        this.cache.clear();
        localStorage.removeItem(STORAGE_KEY);
        console.log('[TagCache] Cache cleared');
    }
}

// Export a singleton instance
export const gelbooruTagCache = new GelbooruTagCache();
export default gelbooruTagCache;
