/**
 * BooruAdapters.js
 * Adapter pattern for different Booru API types
 */

import { gelbooruTagCache } from './GelbooruTagCache.js';

class BooruAdapter {
    constructor(baseUrl, type) {
        this.baseUrl = baseUrl;
        this.type = type;
        // Limit tags to 5 for all sources to prevent queries becoming too complex/strict for searches.
        // Even if API allows 100 upload tags, search usually limits to ~6 terms or has complexity penalty.
        // This forces "Hybrid Mode" (Client Side Filtering) in RecommendationSystem, ensuring we get posts.
        this.tagLimit = type === 'danbooru' ? 2 : 5;
    }

    async getPosts(query) {
        throw new Error('Not implemented');
    }

    async testConnection() {
        try {
            const posts = await this.getPosts({ limit: 1, tags: '', _isTest: true }); // Pass _isTest flag
            if (posts && posts.length >= 0) {
                return { success: true, message: `Connected! Found ${posts.length} sample posts.` };
            }
            return { success: false, message: 'Connected but returned invalid data.' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Test authentication for this booru source
     * @returns {{ success: boolean, message: string, tier?: 'free' | 'authenticated' }}
     */
    async testAuthentication() {
        // Default implementation: just test connection (for sources without auth)
        const result = await this.testConnection();
        if (result.success) {
            return {
                success: true,
                message: 'Authenticated Successfully! (Free Tier)',
                tier: 'free'
            };
        }
        return { success: false, message: result.message };
    }

    // Explicitly test connection/auth, throwing errors on failure (Used by UI 'Verify' button)
    async verifyConnection() {
        const result = await this.testConnection();
        if (result.success) return true;
        throw new Error(result.message);
    }

    // Helper to extract relevant post data into a normalized format
    normalizePost(post) {
        return post;
    }
}

export class DanbooruAdapter extends BooruAdapter {
    constructor(baseUrl = 'https://danbooru.donmai.us', credentials = {}) {
        super(baseUrl, 'danbooru');
        this.credentials = credentials;
    }

    /**
     * Test authentication for Danbooru
     * - No credentials: Returns free tier message
     * - With credentials: Tests via /profile.json endpoint
     */
    async testAuthentication() {
        // If no credentials provided, test connectivity and return free tier message
        if (!this.credentials.userId || !this.credentials.apiKey) {
            const connectionResult = await this.testConnection();
            if (!connectionResult.success) {
                return { success: false, message: connectionResult.message };
            }
            return {
                success: true,
                message: 'Authenticated Successfully! (Free Tier)',
                tier: 'free'
            };
        }

        // Test authentication via /profile.json endpoint
        try {
            const params = new URLSearchParams({
                login: this.credentials.userId,
                api_key: this.credentials.apiKey
            });

            const url = `${this.baseUrl}/profile.json?${params.toString()}`;
            console.log(`[Danbooru] Testing authentication...`);

            const response = await fetch(url);

            if (response.status === 401) {
                return {
                    success: false,
                    message: 'Authentication failed: Invalid credentials'
                };
            }

            if (!response.ok) {
                return {
                    success: false,
                    message: `Authentication failed: HTTP ${response.status}`
                };
            }

            const data = await response.json();
            const username = data.name || this.credentials.userId;

            return {
                success: true,
                message: `Authenticated as ${username}!`,
                tier: 'authenticated'
            };
        } catch (error) {
            console.error('[Danbooru] Auth test error:', error);
            return {
                success: false,
                message: 'Failed to Authenticate'
            };
        }
    }

    async getPosts({ tags, page, limit, sort, sortOrder, skipSort, _isTest }) {
        const hasOrder = tags.includes('order:');

        // Danbooru supports comma syntax for filetypes natively (e.g., filetype:mp4,webm)
        // No expansion needed
        let queryTags = tags;

        // Smart sort logic specific to Danbooru's low tag limit
        if (!hasOrder && !skipSort) {
            const tagList = queryTags.split(' ');
            const expensiveTags = tagList.filter(t =>
                !t.startsWith('rating:') &&
                !t.startsWith('filetype:') &&
                !t.startsWith('-filetype:') &&
                !t.startsWith('status:') &&
                t.trim() !== ''
            );

            if (expensiveTags.length < 2) {
                if (sort === 'score') {
                    queryTags = `${queryTags} order:score`;
                } else if (sort === 'popular') {
                    queryTags = `${queryTags} order:popular`;
                } else {
                    queryTags = `${queryTags}`;
                }
            }
        }

        const params = new URLSearchParams({
            tags: queryTags,
            page,
            limit,
        });

        // Add credentials if available
        if (this.credentials.userId && this.credentials.apiKey) {
            params.append('login', this.credentials.userId);
            params.append('api_key', this.credentials.apiKey);
        }

        // Danbooru supports CORS natively, no proxy needed generally.
        // If we really need proxy, we can uncomment, but it seems to break things if headers aren't perfect.
        const url = `${this.baseUrl}/posts.json?${params.toString()}`;

        try {
            console.log(`[Danbooru] Fetching: ${url}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data.filter(post => post.id && (post.file_url || post.large_file_url)).map(p => this.normalizePost(p));
        } catch (error) {
            console.error('Error fetching posts from Danbooru:', error);
            if (_isTest) throw error; // Re-throw for testConnection to catch
            return [];
        }
    }

    normalizePost(post) {
        // For videos, prefer file_url (original) since large_file_url may not exist
        // For images, large_file_url may be a resized version
        if (!post.file_url && post.large_file_url) {
            post.file_url = post.large_file_url;
        }

        post.post_url = `${this.baseUrl}/posts/${post.id}`;
        post.source = this.baseUrl;
        return post;
    }
}

export class GelbooruAdapter extends BooruAdapter {
    constructor(baseUrl, credentials = {}) {
        super(baseUrl, 'gelbooru');
        this.credentials = credentials;
        // Rate limiting - Gelbooru has strict limits
        this.lastRequestTime = 0;
        this.minRequestInterval = 500; // Minimum 500ms between requests
        // Detect if this site supports actual video files (MP4/WebM)
        this.supportsVideoFiles = this.detectVideoSupport(baseUrl);
    }

    /**
     * Detect if this Gelbooru-engine site supports actual video files
     * @param {string} baseUrl - The base URL of the site
     * @returns {boolean} - True if the site hosts video files
     */
    detectVideoSupport(baseUrl) {
        const url = baseUrl.toLowerCase();
        // Only gelbooru.com is known to have actual video file support
        // Other Gelbooru-engine sites (safebooru.org, etc.) only host images/gifs
        if (url.includes('gelbooru.com')) return true;
        return false;
    }

    /**
     * Check if this Gelbooru-engine site has a free tier (no auth required)
     * @returns {boolean}
     */
    hasFreeTier() {
        const url = this.baseUrl.toLowerCase();
        // Safebooru.org has a free tier
        // Gelbooru.com requires authentication
        return url.includes('safebooru.org');
    }

    /**
     * Test if the website is reachable (doesn't check authentication)
     * This overrides the base method to avoid calling getPosts which requires auth for Gelbooru
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testConnection() {
        try {
            await this.throttle();

            // Use a simple request to check if the site responds
            // We request the main page rather than the API to avoid auth requirements
            let cleanBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
            if (import.meta.env && import.meta.env.DEV) {
                if (cleanBaseUrl.includes('gelbooru.com')) cleanBaseUrl = '/api/gelbooru';
                if (cleanBaseUrl.includes('safebooru.org')) cleanBaseUrl = '/api/safebooru';
            }

            // Make a minimal request - just check if the endpoint responds
            const url = `${cleanBaseUrl}/index.php?page=dapi&s=post&q=index&json=1&limit=0`;
            console.log(`[Gelbooru] Testing connection to ${url}...`);

            const response = await fetch(url, { method: 'GET' });

            // Any response (even 401/403) means the site is reachable
            // We only care about network errors or complete failures
            if (response.ok || response.status === 401 || response.status === 403) {
                return { success: true, message: 'Site is reachable.' };
            }

            return { success: false, message: `Site returned HTTP ${response.status}` };
        } catch (error) {
            console.error('[Gelbooru] Connection test error:', error);
            return { success: false, message: `Cannot reach site: ${error.message}` };
        }
    }

    /**
     * Test authentication for Gelbooru-engine sites
     * - Safebooru: Has free tier, auth optional
     * - Gelbooru: Requires authentication
     */
    async testAuthentication() {
        const isGelbooru = this.baseUrl.toLowerCase().includes('gelbooru.com');
        const isSafebooru = this.baseUrl.toLowerCase().includes('safebooru.org');
        const hasCreds = this.credentials.userId && this.credentials.apiKey;

        // Gelbooru requires authentication
        if (isGelbooru && !hasCreds) {
            return {
                success: false,
                message: 'Gelbooru requires authentication. Please enter your User ID and API Key.'
            };
        }

        // Safebooru is a public API that doesn't validate credentials
        if (isSafebooru && hasCreds) {
            // Test connectivity first
            const connectionResult = await this.testConnection();
            if (!connectionResult.success) {
                return { success: false, message: connectionResult.message };
            }
            // Safebooru ignores credentials - they're not validated
            return {
                success: true,
                message: 'Authenticated Successfully! (Free Tier - credentials not required)',
                tier: 'free'
            };
        }

        // If no credentials and this site has free tier, test connectivity and return free tier message
        if (!hasCreds) {
            const connectionResult = await this.testConnection();
            if (!connectionResult.success) {
                return { success: false, message: connectionResult.message };
            }
            return {
                success: true,
                message: 'Authenticated Successfully! (Free Tier)',
                tier: 'free'
            };
        }

        // With credentials, test them by making an API call
        try {
            await this.throttle();

            const params = new URLSearchParams({
                page: 'dapi',
                s: 'post',
                q: 'index',
                json: 1,
                limit: 1,
                user_id: this.credentials.userId,
                api_key: this.credentials.apiKey
            });

            let cleanBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
            if (import.meta.env && import.meta.env.DEV) {
                if (cleanBaseUrl.includes('gelbooru.com')) cleanBaseUrl = '/api/gelbooru';
                if (cleanBaseUrl.includes('safebooru.org')) cleanBaseUrl = '/api/safebooru';
            }

            const url = `${cleanBaseUrl}/index.php?${params.toString()}`;
            console.log(`[Gelbooru] Testing authentication...`);

            const response = await fetch(url);

            if (response.status === 401 || response.status === 403) {
                return {
                    success: false,
                    message: 'Failed to Authenticate'
                };
            }

            if (!response.ok) {
                return {
                    success: false,
                    message: 'Failed to Authenticate'
                };
            }

            // Try to parse response - invalid credentials might still return 200 with error in body
            const text = await response.text();
            
            // Try to parse as JSON first
            try {
                const data = JSON.parse(text);
                // Check for explicit error responses from the API
                if (data.error || data.success === false) {
                    return {
                        success: false,
                        message: 'Failed to Authenticate'
                    };
                }
                // If we got valid JSON with posts or attributes, authentication worked
                return {
                    success: true,
                    message: 'Authenticated Successfully!',
                    tier: 'authenticated'
                };
            } catch (parseError) {
                // If not valid JSON, check for error text in the raw response
                const lowerText = text.toLowerCase();
                if (lowerText.includes('access denied') || 
                    lowerText.includes('invalid api') || 
                    lowerText.includes('authentication failed')) {
                    return {
                        success: false,
                        message: 'Failed to Authenticate'
                    };
                }
                // If we got a response that's not JSON but also not an obvious error, assume success
                return {
                    success: true,
                    message: 'Authenticated Successfully!',
                    tier: 'authenticated'
                };
            }
        } catch (error) {
            console.error('[Gelbooru] Auth test error:', error);
            return {
                success: false,
                message: 'Failed to Authenticate'
            };
        }
    }

    // Throttle helper to prevent 429 errors
    async throttle() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
    }

    /**
     * Fetch tag categories from Gelbooru API for tags not in cache
     * @param {string[]} tags - Array of tag names to look up
     * @returns {Promise<void>}
     */
    async fetchTagCategories(tags) {
        // Filter to only tags we haven't cached yet
        const uncachedTags = gelbooruTagCache.getUncachedTags(tags);
        if (uncachedTags.length === 0) return;

        // Batch tags in groups of 100 (API limit)
        const batchSize = 100;
        for (let i = 0; i < uncachedTags.length; i += batchSize) {
            const batch = uncachedTags.slice(i, i + batchSize);

            try {
                await this.throttle();

                // Build the tag query - Gelbooru accepts comma-separated names
                const tagQuery = batch.join(' ');

                // Build URL with authentication
                const params = new URLSearchParams({
                    page: 'dapi',
                    s: 'tag',
                    q: 'index',
                    json: '1',
                    limit: '100',
                    names: tagQuery,
                });

                // Add credentials if available
                if (this.credentials.userId) {
                    params.append('user_id', this.credentials.userId);
                }
                if (this.credentials.apiKey) {
                    params.append('api_key', this.credentials.apiKey);
                }

                const url = `/api/gelbooru/index.php?${params.toString()}`;
                console.log(`[Gelbooru] Fetching tag categories for ${batch.length} tags`);

                const response = await fetch(url);
                if (!response.ok) {
                    console.warn(`[Gelbooru] Tag API returned ${response.status}`);
                    // Mark these tags as general (0) on failure to prevent repeated requests
                    for (const tag of batch) {
                        gelbooruTagCache.setCategory(tag, 0);
                    }
                    continue;
                }

                const data = await response.json();

                // Process the response - it should be an array of tag objects
                let tagList = Array.isArray(data) ? data : (data.tag || []);

                // Map fetched tags to cache
                const fetchedTagNames = new Set();
                for (const tagObj of tagList) {
                    const name = tagObj.name || tagObj.tag;
                    const category = tagObj.type ?? tagObj.category ?? 0;
                    if (name) {
                        gelbooruTagCache.setCategory(name, category);
                        fetchedTagNames.add(name);
                    }
                }

                // Mark any tags that weren't found as general
                for (const tag of batch) {
                    if (!fetchedTagNames.has(tag)) {
                        gelbooruTagCache.setCategory(tag, 0);
                    }
                }

                console.log(`[Gelbooru] Cached ${tagList.length} tag categories`);
            } catch (error) {
                console.error('[Gelbooru] Error fetching tag categories:', error);
                // Mark as general on error
                for (const tag of batch) {
                    gelbooruTagCache.setCategory(tag, 0);
                }
            }
        }

        // Save to localStorage after processing all batches
        gelbooruTagCache.saveToStorage();
    }

    async getPosts({ tags, page, limit, sort, sortOrder, _isTest }) {
        // Gelbooru 0.2 syntax: index.php?page=dapi&s=post&q=index&json=1...
        // Safebooru matches this.

        let queryTags = tags;

        // Map Danbooru rating tags (g,s,q,e) to Gelbooru's rating tags
        // Gelbooru uses: rating:general, rating:sensitive, rating:questionable, rating:explicit
        queryTags = queryTags
            .replace(/rating:g\b/g, 'rating:general')
            .replace(/rating:s\b/g, 'rating:sensitive')
            .replace(/rating:q\b/g, 'rating:questionable')
            .replace(/rating:e\b/g, 'rating:explicit');

        // Map "order:score" (Danbooru) to "sort:score" (Gelbooru) logic
        // Gelbooru uses 'sort:score' in tags, usually with 'order:desc' implicit or explicit?
        // Actually Gelbooru supports 'sort:score:desc'. Ref: Gelbooru wiki.

        let hasOrder = false;
        if (queryTags.includes('order:')) {
            // Strip unknown 'order:' tags that would break Gelbooru search
            queryTags = queryTags.replace(/order:\w+/g, '');
            hasOrder = true;
        }

        // Apply sort if requested and not present in tags
        if (sort === 'score' && !queryTags.includes('sort:')) {
            queryTags = `${queryTags.trim()} sort:score:desc`;
        } else if (hasOrder && !queryTags.includes('sort:')) {
            // If original query had "order:..." (likely score/rank), map to sort:score
            // Default to sort:score:desc as it's the most common mapping for order:score
            queryTags = `${queryTags.trim()} sort:score:desc`;
        }

        const params = new URLSearchParams({
            page: 'dapi',
            s: 'post',
            q: 'index',
            json: 1,
            limit: limit,
            pid: page - 1 // usually 0-indexed
        });

        if (this.credentials.userId && this.credentials.apiKey) {
            params.append('user_id', this.credentials.userId);
            params.append('api_key', this.credentials.apiKey);
        }

        if (queryTags) {
            // Strip unsupported tags for Gelbooru and map ratings/filetypes
            let cleanTags = queryTags
                .replace(/date:\S+/g, '') // Gelbooru doesn't support date:>...
                .replace(/order:\S+/g, '') // Strip remaining order tags
                .replace(/rating:g\b/g, 'rating:general')
                .replace(/rating:s\b/g, 'rating:sensitive')
                .replace(/rating:q\b/g, 'rating:questionable')
                .replace(/rating:e\b/g, 'rating:explicit')
                // Handle video filetype tags based on site support
                // Only gelbooru.com supports the 'video' meta-tag; others don't host video files
                .replace(/filetype:mp4,webm\b/g, this.supportsVideoFiles ? 'video' : '')
                .replace(/-filetype:mp4,webm,gif\b/g, this.supportsVideoFiles ? '-video -animated_gif' : '-animated_gif')
                .replace(/-filetype:mp4,webm\b/g, this.supportsVideoFiles ? '-video' : '')
                .replace(/\s+/g, ' ')
                .trim();


            // If cleanTags becomes empty due to stripping (e.g. valid 'date:>1d' became ''),
            // we default to 'sort:updated' to ensure we get recent posts instead of an error or empty set.
            if (cleanTags.length === 0) {
                cleanTags = 'sort:updated';
            }

            params.append('tags', cleanTags);
        }

        // SafeBooru / Gelbooru URL handling
        // Ensure strictly NO trailing slash before query
        let cleanBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;

        // Proxy rewriting for Development
        if (import.meta.env && import.meta.env.DEV) {
            if (cleanBaseUrl.includes('gelbooru.com')) cleanBaseUrl = '/api/gelbooru';
            if (cleanBaseUrl.includes('safebooru.org')) cleanBaseUrl = '/api/safebooru';
        }

        const url = `${cleanBaseUrl}/index.php?${params.toString()}`;

        try {
            // Rate limit requests to avoid 429 errors
            await this.throttle();
            console.log(`[Gelbooru] Fetching: ${url}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            // Safely handle non-JSON or empty responses
            const text = await response.text();
            if (!text || text.trim().length === 0) {
                console.warn(`[Gelbooru] Empty response from ${url}`);
                return [];
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                // Check if it's XML (old API error) or just garbage
                console.warn(`[Gelbooru] Failed to parse JSON: ${e.message}`);
                if (_isTest) throw new Error(`Failed to parse JSON response: ${e.message}`); // Re-throw for testConnection
                return [];
            }

            // Gelbooru API is inconsistent: sometimes [posts], sometimes { post: [posts] }, sometimes []
            let posts = [];
            if (Array.isArray(data)) {
                posts = data;
            } else if (data && Array.isArray(data.post)) {
                posts = data.post;
            }

            // Normalize posts first
            const normalizedPosts = posts.filter(post => post.file_url || post.image).map(p => this.normalizePost(p));

            // Collect all unique tags from all posts
            const allTags = new Set();
            for (const post of normalizedPosts) {
                if (post.tag_string) {
                    for (const tag of post.tag_string.split(' ')) {
                        if (tag) allTags.add(tag);
                    }
                }
            }

            // Fetch categories for any new tags (async but non-blocking for UX)
            // We'll still return posts immediately while categories are being fetched
            this.fetchTagCategories(Array.from(allTags)).then(() => {
                // Re-categorize tags on posts after cache is updated
                for (const post of normalizedPosts) {
                    this.applyTagCategories(post);
                }
            }).catch(e => console.error('[Gelbooru] Tag category fetch failed:', e));

            // Apply any cached categories immediately
            for (const post of normalizedPosts) {
                this.applyTagCategories(post);
            }

            return normalizedPosts;
        } catch (error) {
            console.error(`Error fetching from ${this.baseUrl}:`, error);
            if (_isTest) throw error; // Re-throw for testConnection to catch
            return [];
        }
    }

    /**
     * Apply tag categories from cache to a post
     * @param {Object} post - Normalized post object
     */
    applyTagCategories(post) {
        if (!post.tag_string) return;

        const tags = post.tag_string.split(' ').filter(t => t);
        const categorized = gelbooruTagCache.categorizeTags(tags);

        post.tag_string_general = categorized.general.join(' ');
        post.tag_string_artist = categorized.artist.join(' ');
        post.tag_string_character = categorized.character.join(' ');
        post.tag_string_copyright = categorized.copyright.join(' ');
        post.tag_string_meta = categorized.meta.join(' ');
    }

    normalizePost(post) {
        // Determine file URL
        // Safebooru/Gelbooru often gives 'directory' and 'image' relative paths, OR 'file_url' absolute (modern)
        let fileUrl = post.file_url;
        if (!fileUrl && post.directory && post.image) {
            // Basic construction for older gelbooru/safebooru (images/directory/image)
            const cleanBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
            fileUrl = `${cleanBase}/images/${post.directory}/${post.image}`;
        }

        const normalizedPost = {
            ...post, // Spread first so our explicit properties override
            id: Number(post.id),
            created_at: (() => {
                if (!post.created_at) return new Date().toISOString();
                // Check if it's a timestamp (numeric string or number)
                if (!isNaN(post.created_at)) {
                    return new Date(post.created_at * 1000).toISOString();
                }
                // Try parsing as date string
                const d = new Date(post.created_at);
                if (!isNaN(d.getTime())) return d.toISOString();
                return new Date().toISOString();
            })(),
            score: post.score,
            // Ensure width/height are numbers (both naming conventions for compatibility)
            width: Number(post.width) || 0,
            height: Number(post.height) || 0,
            image_width: Number(post.width) || 0,
            image_height: Number(post.height) || 0,
            // File size - Gelbooru may use 'file_size' or just 'size'
            file_size: Number(post.file_size || post.size || post.filesize) || 0,
            file_url: this.rewriteVideoUrl(fileUrl || post.file_url),
            preview_file_url: post.preview_url,
            // Map rating properly
            rating: this.mapRating(post.rating),
            tag_string: post.tags,
            // Gelbooru doesn't provide tag categories in the posts API
            // All tags go to general for now
            tag_string_general: post.tags,
            tag_string_artist: '',
            tag_string_character: '',
            tag_string_copyright: '',
            tag_string_meta: '',
            source: this.baseUrl,
            directory: post.directory,
            image: post.image,
            post_url: `${this.baseUrl}/index.php?page=post&s=view&id=${post.id}`,
        };

        // Extract file extension from the FINAL file_url (after rewriting)
        normalizedPost.file_ext = normalizedPost.file_url
            ? normalizedPost.file_url.split('.').pop().split('?')[0]
            : (post.image ? post.image.split('.').pop() : 'jpg');

        return normalizedPost;
    }

    mapRating(rating) {
        if (!rating) return 'g'; // default to general
        const r = rating.toLowerCase();
        // Return short codes to match Danbooru format (g, s, q, e)
        if (r === 'safe' || r === 's' || r === 'general' || r === 'g') return 'g';
        if (r === 'sensitive') return 's';
        if (r === 'questionable' || r === 'q') return 'q';
        if (r === 'explicit' || r === 'e') return 'e';
        return 'g'; // fallback to general
    }

    // Rewrite video CDN URLs to use local proxy in development
    rewriteVideoUrl(url) {
        if (!url) return url;

        // Gelbooru API returns video-cdn3.gelbooru.com which doesn't exist (DNS fails)
        // In development, proxy through Vite to bypass CORS issues
        if (url.includes('gelbooru.com') && /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
            try {
                const urlObj = new URL(url);
                // Rewrite to use local proxy in development
                if (urlObj.hostname.includes('video-cdn') || urlObj.hostname.includes('gelbooru.com')) {
                    if (import.meta.env && import.meta.env.DEV) {
                        // Use local proxy in development
                        return `/gelbooru-video${urlObj.pathname}`;
                    } else {
                        // In production, rewrite to video-cdn4
                        urlObj.hostname = 'video-cdn4.gelbooru.com';
                        return urlObj.toString();
                    }
                }
            } catch (e) {
                console.error('[Gelbooru] Error rewriting URL:', e);
            }
        }
        return url;
    }
}

export class MoebooruAdapter extends BooruAdapter {
    constructor(baseUrl) {
        super(baseUrl, 'moebooru');
    }

    async getPosts({ tags, page, limit, _isTest }) {
        // Map Danbooru rating tags (g,s,q,e) to verbose tags
        const queryTags = tags
            .replace(/rating:g\b/g, 'rating:safe')
            .replace(/rating:s\b/g, 'rating:questionable')
            .replace(/rating:q\b/g, 'rating:questionable')
            .replace(/rating:e\b/g, 'rating:explicit');

        const params = new URLSearchParams({
            tags: queryTags,
            page: page,
            limit: limit
        });

        let cleanBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;

        // Proxy rewriting for Development
        if (import.meta.env && import.meta.env.DEV) {
            if (cleanBaseUrl === 'https://konachan.com') cleanBaseUrl = '/api/konachan';
            if (cleanBaseUrl === 'https://yande.re') cleanBaseUrl = '/api/yande';
        }

        const url = `${cleanBaseUrl}/post.json?${params.toString()}`;

        try {
            console.log(`[Moebooru] Fetching: ${url}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data.filter(p => p.file_url).map(p => this.normalizePost(p));
        } catch (error) {
            console.error(`Error fetching from ${this.baseUrl}:`, error);
            if (_isTest) throw error; // Re-throw for testConnection to catch
            return [];
        }
    }

    normalizePost(post) {
        return {
            id: post.id,
            created_at: post.created_at ? new Date(post.created_at * 1000).toISOString() : new Date().toISOString(),
            score: post.score,
            width: post.width,
            height: post.height,
            file_ext: post.file_url ? post.file_url.split('.').pop() : 'jpg',
            file_url: post.file_url,
            rating: this.mapRating(post.rating),
            tag_string: post.tags,
            tag_string_general: post.tags,
            post_url: `${this.baseUrl}/post/show/${post.id}`,
            source: this.baseUrl,
            ...post
        };
    }

    mapRating(rating) {
        if (!rating) return 'g';
        const r = rating.toLowerCase();
        // Return short codes to match Danbooru format (g, s, q, e)
        if (r === 's' || r === 'safe') return 'g'; // Moebooru 's' = safe = general
        if (r === 'q' || r === 'questionable') return 'q';
        if (r === 'e' || r === 'explicit') return 'e';
        return 'g';
    }
}
