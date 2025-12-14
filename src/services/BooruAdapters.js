/**
 * BooruAdapters.js
 * Adapter pattern for different Booru API types
 */

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
    constructor(baseUrl = 'https://danbooru.donmai.us') {
        super(baseUrl, 'danbooru');
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
                // Convert Danbooru filetype syntax to Gelbooru video/animated tag
                .replace(/filetype:mp4,webm\b/g, 'video')
                .replace(/-filetype:mp4,webm,gif\b/g, '-video -animated_gif')
                .replace(/-filetype:mp4,webm\b/g, '-video')
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

            return posts.filter(post => post.file_url || post.image).map(p => this.normalizePost(p));
        } catch (error) {
            console.error(`Error fetching from ${this.baseUrl}:`, error);
            if (_isTest) throw error; // Re-throw for testConnection to catch
            return [];
        }
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
            width: post.width,
            height: post.height,
            file_url: (() => {
                const rewrittenUrl = this.rewriteVideoUrl(fileUrl || post.file_url);
                // Debug: log the URL rewriting
                if (rewrittenUrl !== (fileUrl || post.file_url)) {
                    console.log(`[Gelbooru] URL rewritten for post ${post.id}: ${fileUrl || post.file_url} -> ${rewrittenUrl}`);
                }
                return rewrittenUrl;
            })(),
            preview_file_url: post.preview_url,
            rating: this.mapRating(post.rating),
            tag_string: post.tags,
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
        if (!rating) return 'general';
        const r = rating.toLowerCase();
        if (r === 'safe' || r === 's') return 'general';
        if (r === 'questionable' || r === 'q') return 'questionable';
        if (r === 'explicit' || r === 'e') return 'explicit';
        return 'active'; // fallback
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
                        const proxyUrl = `/gelbooru-video${urlObj.pathname}`;
                        console.log(`[Gelbooru] Using proxy for video: ${url} -> ${proxyUrl}`);
                        return proxyUrl;
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
        if (!rating) return 'general';
        const r = rating.toLowerCase();
        if (r === 's') return 'general';
        if (r === 'q') return 'questionable';
        if (r === 'e') return 'explicit';
        return 'general';
    }
}
