/**
 * RecommendationSystem.js
 * A recommendation system inspired by ByteDance's Monolith to optimize the user's feed
 * based on interaction history and preferences.
 */

import * as tf from '@tensorflow/tfjs';
import StorageService from './StorageService';

// Constants for recommendation system
const INTERACTION_WEIGHTS = {
  like: 1.0,
  dislike: -1.0,
  favorite: 2.0,
  view: 0.2,
  timeSpent: 0.1 // Weight per second spent viewing content
};

// Tag categories for embedding generation
const TAG_CATEGORIES = [
  'artist', 'copyright', 'character', 'general', 'meta'
];

// Common tags to ignore in specific query generation (too broad)
const COMMON_TAGS = [
  '1girl', '1boy', '2girls', '2boys', 'solo', 'comic', 'monochrome',
  'greyscale', 'unknown_artist', 'text', 'commentary', 'translated',
  'multiple_girls', 'multiple_boys', 'scenery', 'original', 'highres',
  'absurdres', 'check_commentary', 'photo', 'parody'
];

class RecommendationSystem {
  constructor() {
    this.userEmbedding = null;
    this.tagScores = null;
    this.tagCategories = null;
    this.ratingPreferences = null;

    this.mediaTypePreferences = null;
    this.lastUpdateTime = 0;

    // Cache for post scores to avoid recalculating
    this.postScoreCache = new Map();

    // Initialize the system
    this.initialize();
  }

  /**
   * Initialize the recommendation system
   */
  initialize() {
    // Build initial user profile from stored interactions
    this.updateUserProfile();

    // Set up periodic profile updates (every 5 minutes)
    setInterval(() => this.updateUserProfile(), 5 * 60 * 1000);
  }

  /**
   * Update the user's profile based on their interaction history
   */
  updateUserProfile() {
    console.log("Updating user recommendation profile...");
    const interactions = StorageService.getInteractions();

    if (interactions.length === 0) {
      console.log("No interactions found, using default profile");
      this.initializeDefaultProfile();
      return;
    }

    // Recency-based weighting: More recent interactions have more influence
    const now = Date.now();
    this.lastUpdateTime = now;

    // Initialize tag scores object
    this.tagScores = {};
    this.tagCategories = {};


    // Initialize rating and media type preferences
    this.ratingPreferences = {
      general: 0,
      sensitive: 0,
      questionable: 0,
      explicit: 0
    };

    this.mediaTypePreferences = {
      image: 0,
      video: 0
    };

    // Process each interaction to build user preferences
    interactions.forEach(interaction => {
      // Calculate recency weight (higher for more recent interactions)
      const ageInHours = (now - interaction.timestamp) / (1000 * 60 * 60);
      const recencyWeight = Math.exp(-0.05 * ageInHours); // Exponential decay

      // Get base weight for this interaction type
      let weight = INTERACTION_WEIGHTS[interaction.type] || 0;

      // Adjust weight based on recency
      weight *= recencyWeight;

      // For timeSpent, we need to convert to seconds and apply the weight
      if (interaction.type === 'timeSpent') {
        weight *= (interaction.value / 1000); // Convert ms to seconds
      }

      // Apply the interaction to our user profile if we have post data
      if (interaction.metadata && interaction.metadata.post) {
        this.updateProfileWithPost(interaction.metadata.post, weight);
      }
    });

    // Normalize scores
    this.normalizeScores();

    console.log("User profile updated:", {
      tagScores: this.summarizeTagScores(),
      ratingPreferences: this.ratingPreferences,
      mediaTypePreferences: this.mediaTypePreferences
    });
  }

  /**
   * Update the profile based on interaction with a specific post
   */
  updateProfileWithPost(post, weight) {
    // Process all tag categories
    TAG_CATEGORIES.forEach(category => {
      const tagString = post[`tag_string_${category}`] || '';
      if (tagString) {
        tagString.split(' ').forEach(tag => {
          if (tag) {
            if (!this.tagScores[tag]) {
              this.tagScores[tag] = 0;
              this.tagCategories[tag] = category;
            }
            this.tagScores[tag] += weight;

          }
        });
      }
    });

    // Process general tags (if not already processed)
    const generalTags = post.tag_string || '';
    if (generalTags) {
      generalTags.split(' ').forEach(tag => {
        if (tag && !this.tagScores[tag]) {
          this.tagScores[tag] = 0;
          this.tagCategories[tag] = 'general';
          this.tagScores[tag] += weight;

        }
      });
    }

    // Update rating preferences
    if (post.rating) {
      this.ratingPreferences[post.rating] += weight;
    }

    // Update media type preferences
    if (post.file_ext) {
      const isVideo = ['mp4', 'webm'].includes(post.file_ext);
      this.mediaTypePreferences[isVideo ? 'video' : 'image'] += weight;
    }
  }

  /**
   * Normalize all scores to reasonable ranges
   */
  normalizeScores() {
    // Normalize tag scores
    const tagScoreValues = Object.values(this.tagScores);
    if (tagScoreValues.length > 0) {
      const maxTagScore = Math.max(...tagScoreValues.map(Math.abs));
      if (maxTagScore > 0) {
        for (const tag in this.tagScores) {
          this.tagScores[tag] /= maxTagScore;
        }
      }
    }

    // Normalize rating preferences to sum to 1
    const totalRatingScore = Object.values(this.ratingPreferences).reduce((sum, val) => sum + Math.max(0, val), 0);
    if (totalRatingScore > 0) {
      for (const rating in this.ratingPreferences) {
        this.ratingPreferences[rating] = Math.max(0, this.ratingPreferences[rating]) / totalRatingScore;
      }
    } else {
      // Default to equal distribution if no positive scores
      const ratings = Object.keys(this.ratingPreferences);
      ratings.forEach(rating => {
        this.ratingPreferences[rating] = 1 / ratings.length;
      });
    }

    // Normalize media type preferences
    const totalMediaScore = Math.max(0.001, this.mediaTypePreferences.image + this.mediaTypePreferences.video);
    this.mediaTypePreferences.image /= totalMediaScore;
    this.mediaTypePreferences.video /= totalMediaScore;
  }

  /**
   * Initialize a default profile when no interactions exist
   */
  initializeDefaultProfile() {
    this.tagScores = {};
    this.tagCategories = {};
    this.ratingPreferences = {

      general: 0.7,
      sensitive: 0.3,
      questionable: 0,
      explicit: 0
    };
    this.mediaTypePreferences = {
      image: 0.8,
      video: 0.2
    };
    this.lastUpdateTime = Date.now();
  }

  /**
   * Track a new user interaction and optionally update the profile immediately
   */
  trackInteraction(postId, interactionType, value, postData, updateImmediately = false) {
    // Store the interaction
    StorageService.storeInteraction({
      postId,
      type: interactionType,
      value,
      metadata: { post: postData }
    });

    // Clear the score cache for this post
    this.postScoreCache.delete(postId);

    // Optionally update the profile immediately
    if (updateImmediately) {
      this.updateUserProfile();
    }
  }

  /**
   * Calculate a score for a post based on the user's profile
   */
  scorePost(post) {
    // Check if we have a cached score
    if (this.postScoreCache.has(post.id)) {
      return this.postScoreCache.get(post.id);
    }

    // If we don't have a user profile yet, initialize one
    if (!this.tagScores) {
      this.updateUserProfile();
    }

    let score = 0;

    // Base score for all posts
    score += 0.1;

    // Score based on tags
    let tagScore = 0;
    let tagCount = 0;

    // Process all tag categories
    TAG_CATEGORIES.forEach(category => {
      const tagString = post[`tag_string_${category}`] || '';
      if (tagString) {
        tagString.split(' ').forEach(tag => {
          tagCount++;
          if (this.tagScores[tag]) {
            tagScore += this.tagScores[tag];
          }
        });
      }
    });

    // Process general tags
    const generalTags = post.tag_string || '';
    if (generalTags) {
      generalTags.split(' ').forEach(tag => {
        if (!TAG_CATEGORIES.some(cat => post[`tag_string_${cat}`]?.includes(tag))) {
          tagCount++;
          if (this.tagScores[tag]) {
            tagScore += this.tagScores[tag];
          }
        }
      });
    }

    // Average tag score and add to total
    if (tagCount > 0) {
      score += (tagScore / tagCount) * 3.0; // Weight tag matching heavily
    }

    // Score based on rating
    if (post.rating && this.ratingPreferences[post.rating]) {
      score += this.ratingPreferences[post.rating] * 2.0;
    }

    // Score based on media type
    if (post.file_ext) {
      const isVideo = ['mp4', 'webm'].includes(post.file_ext);
      score += this.mediaTypePreferences[isVideo ? 'video' : 'image'] * 1.5;
    }

    // Add slight randomness for exploration
    score += Math.random() * 0.2;

    // Cache and return the score
    this.postScoreCache.set(post.id, score);
    return score;
  }

  /**
   * Get detailed score breakdown for a post (for debug mode)
   */
  getPostScoreDetails(post) {
    if (!this.tagScores) {
      this.initializeDefaultProfile();
    }

    const details = {
      totalScore: 0,
      baseScore: 0.1,
      ratingScore: 0,
      mediaScore: 0,
      tagScore: 0,
      contributingTags: []
    };

    // Base score
    details.totalScore += details.baseScore;

    // Tag scores
    let tagScoreSum = 0;
    let tagCount = 0;
    const contributors = [];

    // Helper to process tags
    const processTag = (tag, category) => {
      if (this.tagScores[tag]) {
        tagCount++;
        tagScoreSum += this.tagScores[tag];
        contributors.push({
          tag,
          score: this.tagScores[tag],
          category
        });
      }
    };

    // Process all tag categories
    TAG_CATEGORIES.forEach(category => {
      const tagString = post[`tag_string_${category}`] || '';
      if (tagString) {
        tagString.split(' ').forEach(tag => processTag(tag, category));
      }
    });

    // Process general tags
    const generalTags = post.tag_string || '';
    if (generalTags) {
      generalTags.split(' ').forEach(tag => {
        if (!TAG_CATEGORIES.some(cat => post[`tag_string_${cat}`]?.includes(tag))) {
          processTag(tag, 'general');
        }
      });
    }

    if (tagCount > 0) {
      details.tagScore = (tagScoreSum / tagCount) * 3.0;
      details.totalScore += details.tagScore;
    }

    // Sort contributors by score descending
    details.contributingTags = contributors.sort((a, b) => b.score - a.score).slice(0, 10);

    // Rating score
    if (post.rating && this.ratingPreferences[post.rating]) {
      details.ratingScore = this.ratingPreferences[post.rating] * 2.0;
      details.totalScore += details.ratingScore;
    }

    // Media type score
    if (post.file_ext) {
      const isVideo = ['mp4', 'webm'].includes(post.file_ext);
      details.mediaScore = this.mediaTypePreferences[isVideo ? 'video' : 'image'] * 1.5;
      details.totalScore += details.mediaScore;
    }

    return details;
  }

  /**
   * Rank an array of posts based on personalized scores
   */
  rankPosts(posts) {
    if (!posts || posts.length === 0) return [];

    // Create a copy with scores
    const scoredPosts = posts.map(post => ({
      post,
      score: this.scorePost(post)
    }));

    // Sort by score (descending)
    scoredPosts.sort((a, b) => b.score - a.score);

    // Return just the posts in the new order
    return scoredPosts.map(sp => sp.post);
  }

  /**
   * Get a summary of top tag preferences (for debugging/UI)
   */
  summarizeTagScores(limit = 10) {
    const sortedTags = Object.entries(this.tagScores || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return Object.fromEntries(sortedTags);
  }

  /**
   * Get recommended tags based on user profile
   */
  getRecommendedTags(limit = 5) {
    if (!this.tagScores) {
      return [];
    }

    return Object.entries(this.tagScores)
      .filter(([tag, score]) => score > 0 && this.tagCategories[tag] !== 'meta')
      .sort((a, b) => b[1] - a[1])

      .slice(0, limit)
      .map(([tag]) => tag);
  }

  /**
   * Get rating filter based on user preferences
   */
  getRecommendedRatings() {
    if (!this.ratingPreferences) {
      return ['general'];
    }

    // Return ratings with above-threshold preferences
    return Object.entries(this.ratingPreferences)
      .filter(([_, pref]) => pref > 0.15)
      .map(([rating]) => rating);
  }

  /**
   * Build API query parameters based on user preferences
   */
  buildRecommendedQueryParams(includeUserTags = true, exploreMode = false) {
    // Start with an empty tag query
    let tags = [];

    // Add user's favorite tag if requested (limited to 1 tag to stay under API limit)
    if (includeUserTags && this.tagScores) {
      const recommendedTags = this.getRecommendedTags(1);
      if (recommendedTags.length > 0) {
        tags.push(recommendedTags[0]);
      }
    }

    // In explore mode, add diversity via time-based query or popularity
    // Completely avoid order:random as it causes timeouts
    if (exploreMode && tags.length < 2) {
      // Only use safe strategies that won't timeout the database
      const saferStrategies = [
        'date:>1d', // Last day
        'date:>3d', // Last 3 days
        'date:>7d', // Last week
        'order:score', // High scoring posts
        'order:popular' // Popular posts
      ];

      tags.push(saferStrategies[Math.floor(Math.random() * saferStrategies.length)]);
    }

    return {
      tags: tags.join(' ')
    };
  }


  /**
   * Get tags suitable for specifically targeting in queries
   * (Excludes common tags and meta tags)
   */
  getQueryableTags() {
    if (!this.tagScores) return [];

    return Object.entries(this.tagScores)
      // Filter out tags with no score
      .filter(([tag, score]) => score > 0)
      // Filter out meta tags
      .filter(([tag]) => this.tagCategories[tag] !== 'meta')
      // Filter out common tags
      .filter(([tag]) => !COMMON_TAGS.includes(tag))
      // Sort by score descending
      .sort((a, b) => b[1] - a[1])
      // Return just the tag strings
      .map(([tag]) => tag);
  }

  /**
   * Generate 6 diverse search queries: 3 single tag, 3 duo tag
   * @param {Array} selectedRatings - Array of rating values to include
   * @returns {Array} - Array of query parameter objects
   */
  generateMultiStrategyQueries(selectedRatings = ['general']) {
    const queries = [];
    const topTags = this.getQueryableTags();

    // We need at least some tags to work with different strategies
    // If not enough tags, we'll fill with fallbacks

    // --- Strategy 1: Top 3 Single Tags ---
    for (let i = 0; i < 3; i++) {
      if (i < topTags.length) {
        queries.push({ tags: topTags[i] });
      } else {
        // Fallback for single tag slots if we run out of unique tags
        // Use time-based or order-based queries
        const fallbacks = ['order:score', 'order:popular', 'date:>1w'];
        const fallback = fallbacks[i % fallbacks.length];
        // Only add if not already present
        if (!queries.some(q => q.tags === fallback)) {
          queries.push({ tags: fallback });
        }
      }
    }

    // --- Strategy 2: Top 3 Duo Tag Combinations ---
    // We want to combine top tags to get more specific results
    // Combinations: T1+T2, T1+T3, T2+T3 (or similar)

    const duoCombinations = [];

    if (topTags.length >= 2) {
      // T1 + T2
      duoCombinations.push(`${topTags[0]} ${topTags[1]}`);
    }

    if (topTags.length >= 3) {
      // T1 + T3
      duoCombinations.push(`${topTags[0]} ${topTags[2]}`);

      // T2 + T3
      duoCombinations.push(`${topTags[1]} ${topTags[2]}`);
    } else if (topTags.length === 2) {
      // If we only have 2 tags, we only have one combo (T1+T2)
      // We need 2 more duo slots.
      // Try combining T1 with a safe general tag like 'cute'? No, that's assuming.
      // Instead, try combining T1 with 'order:score'
      duoCombinations.push(`${topTags[0]} order:score`);
      duoCombinations.push(`${topTags[1]} order:score`);
    } else if (topTags.length === 1) {
      // Only 1 tag available.
      duoCombinations.push(`${topTags[0]} order:score`);
      duoCombinations.push(`${topTags[0]} order:popular`);
      duoCombinations.push(`${topTags[0]} date:>1M`);
    } else {
      // No tags? Just more broad queries
      duoCombinations.push(`order:rank`);
      duoCombinations.push(`order:favcount`);
      duoCombinations.push(`date:>1d`);
    }

    // Add generated combinations to queries
    // We want exactly 3 duo queries (or as many as we generated up to 3)
    // If we generated fewer than 3 valid ones in the main logic (e.g. only 2 tags), the fallback logic above handles it.
    // Ensure we take up to 3.
    for (let i = 0; i < 3; i++) {
      if (i < duoCombinations.length) {
        queries.push({ tags: duoCombinations[i] });
      } else {
        // Redundant fallback if logic above failed
        queries.push({ tags: 'order:random' });
      }
    }

    // Return unique queries
    return queries.filter((query, index, self) =>
      self.findIndex(q => q.tags === query.tags) === index
    );
  }

  /**
   * Curate the next best post for the user from a pool of fetched posts
   * @param {Array} postPool - Array of posts to select from
   * @returns {Object} - Selected post and remaining posts
   */
  selectNextBestPost(postPool) {
    if (!postPool || postPool.length === 0) {
      return {
        nextPost: null,
        remainingPosts: []
      };
    }

    // Score all posts in the pool
    const scoredPosts = postPool.map(post => ({
      post,
      score: this.scorePost(post)
    }));

    // Sort by score (descending)
    scoredPosts.sort((a, b) => b.score - a.score);

    // Return the highest scoring post and the remaining posts
    const [best, ...rest] = scoredPosts;

    return {
      nextPost: best.post,
      remainingPosts: rest.map(item => item.post)
    };
  }

  /**
   * Get a curated feed for explore mode by fetching diverse content
   * and selecting the best posts based on user preferences
   * @param {Function} fetchFunction - Function to fetch posts with query params
   * @param {Object} options - Configuration options
   * @returns {Promise<Array>} - Curated list of posts
   */
  /**
   * Filter posts client-side correctly handling Danbooru tag formats
   */
  applyClientSideFilters(posts, { whitelist = [], blacklist = [] }) {
    if (!posts || posts.length === 0) return [];

    return posts.filter(post => {
      const postTags = (post.tag_string || '').split(' ');
      if (blacklist.some(tag => postTags.includes(tag))) return false;
      if (whitelist.length > 0 && !whitelist.some(tag => postTags.includes(tag))) return false;
      return true;
    });
  }

  async getCuratedExploreFeed(fetchFunction, options = {}) {
    const {
      postsPerFetch = 20,   // Number of posts to fetch per query
      maxTotal = 50,        // Maximum total posts to return
      selectedRatings = ['general'], // Rating filters to apply
      whitelist = [],
      blacklist = [],
      existingPostIds = new Set()
    } = options;


    // Generate multi-strategy query sets (3 single, 3 duo)
    const queries = this.generateMultiStrategyQueries(selectedRatings);
    console.log("Explore mode multi-strategy queries:", queries);

    // Helper to build the final API query and client-side filter instructions
    const buildHybridQuery = (baseQuery) => {
      let apiTags = baseQuery.tags ? baseQuery.tags.split(' ') : [];

      // Remove order:random if we have other sort orders or if we are going to fallback
      if (apiTags.includes('order:random')) {
        apiTags = apiTags.filter(tag => !tag.startsWith('order:'));
        apiTags.push('order:random'); // Keep it at the end or alone
      }

      // 1. Mandatory 'Free' Tags (Rating, Filetype)
      // These do not count towards the 2-tag limit on Danbooru
      const freeTags = [];

      // Rating
      if (selectedRatings && selectedRatings.length > 0) {
        freeTags.push(`rating:${selectedRatings.join(',')}`);
      }

      // Filetype (handled via options now)
      if (options.wantsVideos && !options.wantsImages) {
        freeTags.push('filetype:mp4,webm');
      } else if (!options.wantsVideos && options.wantsImages) {
        freeTags.push('-filetype:mp4,webm');
      }

      // 2. 'Expensive' Tags (Base Query + Whitelist + Blacklist)
      // These count towards the limit.
      const baseTagCount = apiTags.filter(t => !t.startsWith('order:') && !t.startsWith('status:')).length;
      const whitelistCount = whitelist.length;
      const blacklistCount = blacklist.length;

      const totalExpensiveTags = baseTagCount + whitelistCount + blacklistCount;

      let clientSideFilterNeeded = false;
      let finalApiTags = [...apiTags];

      // Check if we exceed the limit (2 tags)
      if (totalExpensiveTags > 2) {
        // HYBRID MODE: Send only Base Query + Free Tags to API.
        // Filter Whitelist/Blacklist client-side.
        clientSideFilterNeeded = true;
        console.log(`Query "${baseQuery.tags}" + filters exceeds API limit (${totalExpensiveTags} > 2). Using Client-Side Filtering.`);

        // We do NOT add whitelist/blacklist to finalApiTags here.

      } else {
        // SAFE MODE: Send everything to API.
        // Add whitelist
        if (whitelist.length > 0) {
          finalApiTags.push(...whitelist);
        }
        // Add blacklist
        if (blacklist.length > 0) {
          finalApiTags.push(...blacklist.map(t => `-${t}`));
        }
      }

      // Always add Free Tags
      finalApiTags.push(...freeTags);

      return {
        apiQuery: { tags: finalApiTags.join(' ') },
        clientSideFilterNeeded,
        originalBaseTags: baseQuery.tags
      };
    };

    // Fetch posts for each query in parallel
    try {
      const fetchPromises = queries.map(query => {
        // Build the hybrid query
        const { apiQuery, clientSideFilterNeeded } = buildHybridQuery(query);

        // If we need client side filtering, fetch MORE posts to ensure we have enough after filtering
        const limit = clientSideFilterNeeded ? 100 : postsPerFetch; // Fetch 100 if filtering, else standard amount

        console.log(`Processing query: "${apiQuery.tags}" (ClientFilter: ${clientSideFilterNeeded})`);

        // Execute fetch
        return fetchFunction(apiQuery, limit)
          .then(posts => {
            let processedPosts = posts;

            // Apply Client-Side Filtering if needed
            if (clientSideFilterNeeded) {
              const beforeCount = processedPosts.length;
              processedPosts = this.applyClientSideFilters(processedPosts, { whitelist, blacklist });
              console.log(`Client-filter for "${query.tags}": ${beforeCount} -> ${processedPosts.length} posts`);
            }

            // Attach search criteria
            return processedPosts.map(post => {
              post._searchCriteria = query.tags; // Log the ORIGINAL intent, not the technical API query
              return post;
            });
          })
          .catch(error => {
            console.warn(`Query failed: ${apiQuery.tags}`, error);
            return [];
          });
      });

      const fetchResults = await Promise.all(fetchPromises);

      // Combine all fetched posts
      let allPosts = [];
      fetchResults.forEach((posts, index) => {
        const queryTags = queries[index].tags;
        const isDuo = queryTags.trim().split(' ').length > 1;

        if (posts && posts.length) {
          console.log(`Query [${isDuo ? 'DUO' : 'SINGLE'}] "${queryTags}" returned ${posts.length} posts`);
          allPosts = [...allPosts, ...posts];
        } else {
          console.warn(`Query [${isDuo ? 'DUO' : 'SINGLE'}] "${queryTags}" returned NO posts`);
        }
      });

      // If we didn't get enough posts, try fallback queries
      if (allPosts.length < 10) {
        console.log(`Only found ${allPosts.length} posts, trying fallback query`);

        // Fallback: Simple order:score query (very reliable)
        try {
          // Build a base query object for the fallback
          const fallbackBaseQuery = { tags: 'order:score' };

          // Use the hybrid builder to handle limits and filtering
          const { apiQuery, clientSideFilterNeeded } = buildHybridQuery(fallbackBaseQuery);

          // If we need client side filtering, fetch MORE posts
          const limit = clientSideFilterNeeded ? 100 : postsPerFetch;

          console.log(`Running fallback query: "${apiQuery.tags}" (ClientFilter: ${clientSideFilterNeeded})`);

          const fallbackPosts = await fetchFunction(apiQuery, limit);

          let processedFallbackPosts = fallbackPosts;

          // Apply Client-Side Filtering if needed
          if (clientSideFilterNeeded) {
            const beforeCount = processedFallbackPosts.length;
            processedFallbackPosts = this.applyClientSideFilters(processedFallbackPosts, { whitelist, blacklist });
            console.log(`Fallback Client-filter: ${beforeCount} -> ${processedFallbackPosts.length} posts`);
          }

          if (processedFallbackPosts && processedFallbackPosts.length) {
            console.log(`Fallback query found ${processedFallbackPosts.length} posts`);
            allPosts = [...allPosts, ...processedFallbackPosts];
          }
        } catch (fallbackError) {
          console.error("Fallback query failed:", fallbackError);
        }
      }

      // Check if we have posts
      if (allPosts.length === 0) {
        console.warn("All queries returned no posts. This should not happen with our conservative approach.");

        // Last resort: Try with only the rating tag
        // Last resort: Try with only the rating tag
        try {
          // Build a base query with just the rating (and implicit free tags handled by builder)
          const lastResortBaseQuery = { tags: '' };

          // Use hybrid builder
          const { apiQuery, clientSideFilterNeeded } = buildHybridQuery(lastResortBaseQuery);

          const limit = clientSideFilterNeeded ? 100 : postsPerFetch;

          console.log(`Trying last resort query: "${apiQuery.tags}" (ClientFilter: ${clientSideFilterNeeded})`);

          const lastResortPosts = await fetchFunction(apiQuery, limit);

          let processedLastResortPosts = lastResortPosts;

          // Apply Client-Side Filtering
          if (clientSideFilterNeeded) {
            processedLastResortPosts = this.applyClientSideFilters(processedLastResortPosts, { whitelist, blacklist });
          }

          if (processedLastResortPosts && processedLastResortPosts.length) {
            console.log(`Last resort query found ${processedLastResortPosts.length} posts`);
            allPosts = processedLastResortPosts;
          } else {
            console.error("Last resort query returned no posts. API may be down or filters are too strict.");
          }
        } catch (lastResortError) {
          console.error("Last resort query failed:", lastResortError);
        }
      }

      // Remove duplicates
      let uniquePosts = Array.from(
        new Map(allPosts.map(post => [post.id, post])).values()
      );

      console.log(`Found ${uniquePosts.length} unique posts after deduplication`);

      // Filter out posts that have already been seen
      if (existingPostIds.size > 0) {
        uniquePosts = uniquePosts.filter(post => !existingPostIds.has(post.id));
      }

      // Rank the combined posts using our recommendation system
      const rankedPosts = this.rankPosts(uniquePosts);

      // Return the top posts up to maxTotal
      return rankedPosts.slice(0, maxTotal);
    } catch (error) {
      console.error("Error fetching curated explore feed:", error);
      return [];
    }
  }


  /**
   * Normalize rating code from short form to full form
   * @param {string} ratingCode - The rating code to normalize
   * @returns {string} - Normalized rating
   */
  normalizeRatingCode(ratingCode) {
    const ratingMap = {
      'g': 'general',
      'general': 'general',
      's': 'sensitive',
      'sensitive': 'sensitive',
      'q': 'questionable',
      'questionable': 'questionable',
      'e': 'explicit',
      'explicit': 'explicit'
    };
    return ratingMap[ratingCode] || ratingCode;
  }
}

const recommendationSystem = new RecommendationSystem();
export default recommendationSystem;
