/**
 * RecommendationSystem.js
 * A recommendation system inspired by ByteDance's Monolith to optimize the user's feed
 * based on interaction history and preferences.
 */

import * as tf from '@tensorflow/tfjs';
import StorageService from './StorageService';
import BooruService from './BooruService';

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
export const COMMON_TAGS = [
  '1girl', '1boy', '2girls', '2boys', 'solo', 'comic', 'monochrome',
  'greyscale', 'unknown_artist', 'text', 'commentary', 'translated',
  'multiple_girls', 'multiple_boys', 'scenery', 'original', 'highres',
  'absurdres', 'check_commentary', 'photo', 'parody',
  'long_hair', 'breasts', 'large_breasts', 'looking_at_user', 'short_hair',
  'animated', 'tagme', 'copyright_request', 'spoiler', 'source_request',
  'artist_request', 'character_request', 'cosplay_request', 'check_character',
  'duplicate', 'sound', 'looking_at_viewer', 'looking_at_another',
  'simple_background'
];

class RecommendationSystem {
  constructor() {
    this.userEmbedding = null;
    this.tagScores = null;
    this.tagEngagement = null; // Tracks total engagement regardless of sentiment
    this.tagCategories = null;
    this.ratingPreferences = null;
    this.avoidedTags = [...COMMON_TAGS]; // Default to common tags

    this.mediaTypePreferences = null;
    this.lastUpdateTime = 0;

    // Cache for post scores to avoid recalculating
    this.postScoreCache = new Map();

    // Session state for explore mode
    this.strategyCursors = {};
    this.exhaustedStrategies = new Set();
  }

  /**
   * Initialize the recommendation system
   */
  async initialize() {
    // Session state for explore mode
    this.strategyCursors = {};
    this.exhaustedStrategies = new Set();

    // Build initial user profile from stored interactions
    await this.updateUserProfile();

    // Set up periodic profile updates (every 5 minutes)
    setInterval(() => this.updateUserProfile(), 5 * 60 * 1000);
  }

  /**
   * Reset the explore session state (cursors and exhausted list)
   * Call this when the user refreshes the feed or starts a new search
   */
  resetExploreSession() {
    this.strategyCursors = {};
    this.exhaustedStrategies = new Set();
    console.log("Explore session reset");
  }

  /**
   * Update the user's profile based on their interaction history
   */
  async updateUserProfile() {
    console.log("Updating user recommendation profile...");
    let interactions = await StorageService.getInteractions();

    // Load preferences including avoided tags and reset timestamp
    const preferences = await StorageService.getPreferences();
    if (preferences.avoidedTags && Array.isArray(preferences.avoidedTags)) {
      this.avoidedTags = preferences.avoidedTags;
    } else {
      this.avoidedTags = [...COMMON_TAGS];
    }

    // Filter out interactions that occurred before the recommendation reset
    const resetTimestamp = preferences.recommendationResetTime || 0;
    if (resetTimestamp > 0) {
      const beforeCount = interactions.length;
      interactions = interactions.filter(i => i.timestamp > resetTimestamp);
      console.log(`Filtered interactions: ${beforeCount} -> ${interactions.length} (reset at ${new Date(resetTimestamp).toISOString()})`);
    }

    if (interactions.length === 0) {
      console.log("No interactions found (or all filtered by reset), using default profile");
      this.initializeDefaultProfile();
      return;
    }

    // Recency-based weighting: More recent interactions have more influence
    const now = Date.now();
    this.lastUpdateTime = now;

    // Initialize tag scores and engagement objects
    this.tagScores = {};
    this.tagEngagement = {}; // Tracks total engagement regardless of sentiment
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
    // Create a Set for fast lookups of avoided/common tags
    // These tags should NEVER influence the user profile
    const avoidedSet = new Set(this.avoidedTags || []);

    // Helper to process a single tag
    const processTag = (tag, category) => {
      if (!tag) return;

      // BLOCK COMMON TAGS: Don't let tags like '1girl', 'long_hair' accumulate score
      // This prevents them from dominating recommendations
      if (avoidedSet.has(tag)) return;

      // Initialize if first time seeing this tag
      if (this.tagScores[tag] === undefined) {
        this.tagScores[tag] = 0;
        this.tagCategories[tag] = category;
      }
      if (this.tagEngagement[tag] === undefined) {
        this.tagEngagement[tag] = 0;
      }

      // Update net score (sentiment: likes cancel dislikes)
      this.tagScores[tag] += weight;

      // Update engagement (history: always positive)
      // Like (+1.0) adds 1. Dislike (-1.0) also adds 1.
      this.tagEngagement[tag] += Math.abs(weight);
    };

    // Process all tag categories
    TAG_CATEGORIES.forEach(category => {
      const tagString = post[`tag_string_${category}`] || '';
      if (tagString) {
        tagString.split(' ').forEach(tag => processTag(tag, category));
      }
    });

    // Process general tags (if not already processed)
    const generalTags = post.tag_string || '';
    if (generalTags) {
      generalTags.split(' ').forEach(tag => {
        // Block avoided tags here too
        if (avoidedSet.has(tag)) return;

        // Only process if not already in a specific category
        if (tag && this.tagCategories[tag] === undefined) {
          processTag(tag, 'general');
        } else if (tag && this.tagCategories[tag] === 'general') {
          // Already processed as general, just update scores
          this.tagScores[tag] += weight;
          this.tagEngagement[tag] += Math.abs(weight);
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
    this.tagEngagement = {};
    this.tagCategories = {};
    this.ratingPreferences = {
      general: 1.0,
      sensitive: 0.0,
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
   * Reset the recommendation system to a fresh state.
   * This clears tag scores and preferences but does NOT delete
   * stored interactions, history, likes, favorites, or other user data.
   */
  async resetRecommendations() {
    console.log("Resetting recommendation system to fresh state...");

    // Store reset timestamp so future profile rebuilds ignore old interactions
    const resetTime = Date.now();
    await StorageService.storePreferences({ recommendationResetTime: resetTime });
    console.log(`Recommendation reset timestamp set to: ${new Date(resetTime).toISOString()}`);

    // Reload avoided tags from preferences
    const preferences = await StorageService.getPreferences();
    if (preferences.avoidedTags && Array.isArray(preferences.avoidedTags)) {
      this.avoidedTags = preferences.avoidedTags;
    } else {
      this.avoidedTags = [...COMMON_TAGS];
    }

    // Reset all scoring data
    this.tagScores = {};
    this.tagEngagement = {};
    this.tagCategories = {};
    this.ratingPreferences = {
      general: 1.0,
      sensitive: 0.0,
      questionable: 0,
      explicit: 0
    };
    this.mediaTypePreferences = {
      image: 0.8,
      video: 0.2
    };

    // Clear the post score cache
    this.postScoreCache.clear();

    // Reset explore session state
    this.resetExploreSession();

    this.lastUpdateTime = Date.now();

    console.log("Recommendation system reset complete.");
  }

  /**
   * Track a new user interaction and optionally update the profile immediately
   */
  async trackInteraction(postId, interactionType, value, postData, updateImmediately = false) {
    // Store the interaction
    await StorageService.storeInteraction({
      postId,
      type: interactionType,
      value,
      metadata: { post: postData }
    });

    // Clear the score cache for this post
    this.postScoreCache.delete(postId);

    // Optionally update the profile immediately
    if (updateImmediately) {
      await this.updateUserProfile();
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

    // ---------------------------------------------------------
    // CATEGORY-BASED SCORING
    // ---------------------------------------------------------
    // Aggregate scores by category with different multipliers:
    // - Character: 2.5x (strongest signal - user likes specific characters)
    // - Copyright: 2.0x (strong signal - user likes specific series)
    // - Artist: 2.0x (strong signal - user likes specific art styles)
    // - General: 0.4x (weak signal - generic descriptors shouldn't dominate)
    // - Meta: 0.0x (ignored - technical tags like 'highres')
    const CATEGORY_MULTIPLIERS = {
      character: 2.5,
      copyright: 2.0,
      artist: 2.0,
      general: 0.4,
      meta: 0.0
    };

    // Accumulators for category-based scoring
    const categoryScores = {
      character: { sum: 0, count: 0 },
      copyright: { sum: 0, count: 0 },
      artist: { sum: 0, count: 0 },
      general: { sum: 0, count: 0 },
      meta: { sum: 0, count: 0 }
    };

    // ---------------------------------------------------------
    // REFINED: Category-Weighted Discovery Logic
    // ---------------------------------------------------------
    let familiarWeight = 0;  // Weighted sum of familiar anchors
    let novelCount = 0;      // Truly new tags (zero engagement), excluding noise

    // Use avoidedTags (COMMON_TAGS) to filter noise
    const noiseTags = new Set(this.avoidedTags || []);

    // Helper to process a tag for both scoring and discovery
    const processTag = (tag, category) => {
      if (!tag) return;

      // SKIP NOISE: Common tags don't count
      if (noiseTags.has(tag)) return;

      const tagScoreVal = this.tagScores?.[tag] || 0;
      const engagement = this.tagEngagement?.[tag] || 0;

      // Resolve category (use stored if available, else passed, else 'general')
      const resolvedCategory = this.tagCategories?.[tag] || category || 'general';

      // Add to category-specific accumulator
      if (categoryScores[resolvedCategory]) {
        categoryScores[resolvedCategory].sum += tagScoreVal;
        categoryScores[resolvedCategory].count++;
      }

      // Discovery logic: track familiar anchors and novel tags
      if (engagement > 0) {
        if (tagScoreVal > 0.3) {
          if (['character', 'copyright', 'artist'].includes(resolvedCategory)) {
            familiarWeight += 1.0;
          } else {
            familiarWeight += 0.2;
          }
        }
      } else {
        novelCount++;
      }
    };

    // Process categorized tag strings
    TAG_CATEGORIES.forEach(category => {
      const tagString = post[`tag_string_${category}`] || '';
      if (tagString) {
        tagString.split(' ').forEach(tag => processTag(tag, category));
      }
    });

    // Process general tag_string (for uncategorized tags)
    const generalTags = post.tag_string || '';
    if (generalTags) {
      generalTags.split(' ').forEach(tag => {
        // Skip if already processed in a specific category
        if (!TAG_CATEGORIES.some(cat => post[`tag_string_${cat}`]?.includes(tag))) {
          processTag(tag, 'general');
        }
      });
    }

    // Calculate weighted tag score from category aggregates
    let weightedTagScore = 0;
    let totalTagCount = 0;
    for (const [category, data] of Object.entries(categoryScores)) {
      if (data.count > 0) {
        const multiplier = CATEGORY_MULTIPLIERS[category] || 0;
        const avgCategoryScore = data.sum / data.count;
        weightedTagScore += avgCategoryScore * multiplier * data.count;
        totalTagCount += data.count;
      }
    }

    // Normalize and add to total score
    if (totalTagCount > 0) {
      score += (weightedTagScore / totalTagCount) * 3.0;
    }

    // Discovery Bonus: Reward "Novelty in a Familiar Context"
    // CATEGORY-WEIGHTED THRESHOLDS:
    // - Need familiarWeight >= 1.0 (1 Character OR 5 General tags as anchor)
    // - Need 5 new elements (to ensure it's actually different)
    // Common tags like 1girl, long_hair are filtered out so they don't trigger this trivially
    if (familiarWeight >= 1.0 && novelCount >= 5) {
      score += 0.25;
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
      discoveryBonus: 0,
      familiarWeight: 0,  // Changed from familiarTagCount to weighted system
      novelTagCount: 0,
      contributingTags: []
    };

    // Base score
    details.totalScore += details.baseScore;

    // Tag scores
    let tagScoreSum = 0;
    let tagCount = 0;
    const contributors = [];

    // Use avoidedTags (COMMON_TAGS) to filter noise - these shouldn't count for discovery
    const noiseTags = new Set(this.avoidedTags || []);

    // Helper to process tags - uses ENGAGEMENT + CATEGORY WEIGHTING for discovery bonus
    const processTag = (tag, category) => {
      if (!tag) return;

      // SKIP NOISE FIRST: Common tags don't count for scoring or discovery
      if (noiseTags.has(tag)) return;

      const tagScoreValue = this.tagScores[tag] || 0;
      const tagEngagementValue = this.tagEngagement?.[tag] || 0;

      // Retrieve stored category, fallback to passed category or 'general'
      const storedCategory = this.tagCategories?.[tag] || category || 'general';

      // Track score contributors if tag has any score history
      if (this.tagScores[tag] !== undefined) {
        tagCount++;
        tagScoreSum += tagScoreValue;
        contributors.push({
          tag,
          score: tagScoreValue,
          category: storedCategory
        });
      }

      // Use engagement + category weighting to determine familiarity
      if (tagEngagementValue > 0) {
        // Only consider positive sentiments as anchors
        if (tagScoreValue > 0.3) {
          // WEIGHTING LOGIC:
          // Specific Identifiers (Character, Copyright, Artist) = 1.0 (Strong Anchor)
          // Broad Descriptors (General, Meta) = 0.2 (Weak Anchor)
          if (['character', 'copyright', 'artist'].includes(storedCategory)) {
            details.familiarWeight += 1.0;
          } else {
            details.familiarWeight += 0.2;
          }
        }
      } else {
        // Truly novel (zero engagement)
        details.novelTagCount++;
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

    // Discovery Bonus: Reward "Novelty in a Familiar Context"
    // CATEGORY-WEIGHTED THRESHOLDS (matching scorePost):
    // - Need familiarWeight >= 1.0 (1 Character OR 5 General tags as anchor)
    // - Need 5 new elements (to ensure it's actually different)
    if (details.familiarWeight >= 1.0 && details.novelTagCount >= 5) {
      details.discoveryBonus = 0.25;
      details.totalScore += details.discoveryBonus;
    }

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
    return this.getQueryableTagsWithScores().map(item => item.tag);
  }

  /**
   * Get tags with their weighted scores for probabilistic selection
   * Returns array of { tag, score } sorted by score descending
   */
  getQueryableTagsWithScores() {
    if (!this.tagScores) return [];

    // ANTI-CONVERGENCE QUERYING with RELAXED GENERAL PENALTY
    // Penalize "general" category tags when generating search queries,
    // but not too harshly - broad interests like 'cyberpunk' should still surface.
    const QUERY_CATEGORY_WEIGHTS = {
      character: 1.0,   // Full weight - specific characters are great search terms
      copyright: 1.0,   // Full weight - specific series are great search terms
      artist: 1.0,      // Full weight - specific artists are great search terms
      general: 0.5,     // Relaxed penalty - allows broad interests to compete
      meta: 0.0         // Exclude - technical tags are useless for discovery
    };

    return Object.entries(this.tagScores)
      // Filter out tags with no score
      .filter(([tag, score]) => score > 0)
      // Filter out meta tags entirely
      .filter(([tag]) => this.tagCategories[tag] !== 'meta')
      // Filter out avoided tags
      .filter(([tag]) => !this.avoidedTags.includes(tag))
      // Filter out explicit 'video' tag as it is handled by filetype filters
      .filter(([tag]) => tag !== 'video')
      // Apply category-based weighting for query prioritization
      .map(([tag, score]) => {
        const category = this.tagCategories?.[tag] || 'general';
        const weight = QUERY_CATEGORY_WEIGHTS[category] ?? 0.15;
        return { tag, score: score * weight };
      })
      // Sort by weighted score descending
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Select a tag using weighted random selection (roulette wheel)
   * @param {Array} candidates - Array of { tag, score } objects
   * @param {Set} exclude - Set of tags to exclude from selection
   * @returns {Object|null} - Selected { tag, score } or null if none available
   */
  weightedRandomSelect(candidates, exclude = new Set()) {
    // Filter out excluded and exhausted tags
    const available = candidates.filter(c =>
      !exclude.has(c.tag) && !this.exhaustedStrategies.has(c.tag)
    );

    if (available.length === 0) return null;

    // Calculate total weight
    const totalWeight = available.reduce((sum, c) => sum + Math.max(0.01, c.score), 0);

    // Roll random number
    let random = Math.random() * totalWeight;

    // Find the selected tag
    for (const candidate of available) {
      random -= Math.max(0.01, candidate.score);
      if (random <= 0) {
        return candidate;
      }
    }

    // Fallback to last available (shouldn't happen, but safety)
    return available[available.length - 1];
  }

  /**
   * Generate 6 diverse search queries: 3 single tag, 3 duo tag
   * @param {Array} selectedRatings - Array of rating values to include
   * @param {Array} whitelist - Optional whitelist to use as seed for fresh profiles
   * @returns {Array} - Array of query parameter objects
   */
  generateMultiStrategyQueries(selectedRatings = ['general'], whitelist = []) {
    const queries = [];
    const topTagsWithScores = this.getQueryableTagsWithScores();
    let topTags = topTagsWithScores.map(t => t.tag);

    // If no user history (fresh profile), use whitelist tags as the "top terms"
    if (topTags.length === 0 && whitelist && whitelist.length > 0) {
      topTags = whitelist.slice(0, 5);
      console.log("Using whitelist as seed for fresh profile queries:", topTags);
    }

    // Explicitly filter out 'video' tag
    topTags = topTags.filter(t => t !== 'video');

    // ---------------------------------------------------------
    // WEIGHTED RANDOM SELECTION (Roulette Wheel)
    // ---------------------------------------------------------
    // A tag with score 10 has 10x higher chance than a score of 1.
    // This ensures top preferences dominate but lower ones still get a chance.
    const CANDIDATE_POOL_SIZE = 20;
    const candidatePool = topTagsWithScores.slice(0, CANDIDATE_POOL_SIZE);

    // Track used anchors to ensure UNIQUE ANCHORS across strategies
    const usedAnchors = new Set();

    // --- Strategy 1: Single Tag Queries (2 tags via weighted random) ---
    const singleQueries = [];
    for (let i = 0; i < 2; i++) {
      const selected = this.weightedRandomSelect(candidatePool, usedAnchors);
      if (selected) {
        singleQueries.push({ tags: selected.tag, type: 'single' });
        usedAnchors.add(selected.tag);
        console.log(`Single query ${i + 1}: "${selected.tag}" (score: ${selected.score.toFixed(2)})`);
      }
    }

    // Fill with fallbacks if needed
    if (singleQueries.length < 2) {
      const fallbacks = ['order:score', 'order:popular', 'date:>1w', 'date:>1d', 'order:rank'];
      for (const fb of fallbacks) {
        if (singleQueries.length >= 2) break;
        if (!this.exhaustedStrategies.has(fb) && !singleQueries.some(q => q.tags === fb)) {
          singleQueries.push({ tags: fb, type: 'single' });
        }
      }
    }

    // --- Strategy 2: Duo Tag Combinations (2 pairs via weighted random) ---
    const duoCombinations = [];

    // Select 4 more tags for duo combinations (2 pairs)
    for (let pair = 0; pair < 2; pair++) {
      const tag1 = this.weightedRandomSelect(candidatePool, usedAnchors);
      if (!tag1) break;
      usedAnchors.add(tag1.tag);

      const tag2 = this.weightedRandomSelect(candidatePool, usedAnchors);
      if (!tag2) break;
      usedAnchors.add(tag2.tag);

      const duoTag = `${tag1.tag} ${tag2.tag}`;
      if (!this.exhaustedStrategies.has(duoTag)) {
        duoCombinations.push(duoTag);
        console.log(`Duo query ${pair + 1}: "${duoTag}" (scores: ${tag1.score.toFixed(2)}, ${tag2.score.toFixed(2)})`);
      }
    }

    // Add Single queries FIRST (more reliable)
    for (const q of singleQueries) {
      if (queries.length < 2) {
        queries.push(q);
      }
    }

    // Then add Duo queries
    for (const duoTag of duoCombinations) {
      if (queries.length < 4) {
        queries.push({ tags: duoTag, type: 'duo' });
      }
    }

    // Ensure uniqueness
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
   * Rank an array of posts based on personalized scores
   */
  rankPosts(posts) {
    if (!posts || posts.length === 0) return [];

    // Create a copy with scores
    const scoredPosts = posts.map(post => {
      let score = this.scorePost(post);

      // BONUS: Prioritize posts found via specific Duo queries.
      // This helps break ties when "Common Tag" weighting relies on a generic tag that has 0 score.
      // It ensures "discovery" pairs (e.g. "1girl scenery") win over just "1girl".
      if (post._strategy === 'duo') {
        score += 0.5; // Significant bump to surface diversity, but not overwhelming
      }

      return {
        post,
        score
      };
    });

    // Sort by score (descending)
    scoredPosts.sort((a, b) => b.score - a.score);

    return scoredPosts.map(sp => sp.post);
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
      // Check whitelist (include ONLY if AT LEAST ONE whitelist tag is present -> CHANGED to ALL)
      // Standard search logic implies AND for multiple tags.
      // If user Whitelists "1girl" and "hat", they want posts with BOTH.
      if (whitelist.length > 0) {
        if (!whitelist.every(tag => postTags.includes(tag))) {
          return false;
        }
      }
      return true;
    });
  }

  async getCuratedExploreFeed(fetchFunction, options = {}) {
    const {
      postsPerFetch = 20,   // Number of posts to fetch per query
      maxTotal = 10,        // Maximum total posts to return (curated subset)
      selectedRatings = ['general'], // Rating filters to apply
      whitelist = [],
      blacklist = [],
      existingPostIds = new Set()
    } = options;

    // Update user profile before fetching to incorporate recent interactions
    await this.updateUserProfile();

    // Generate multi-strategy query sets (2 single, 2 duo)
    const queries = this.generateMultiStrategyQueries(selectedRatings, whitelist);
    console.log("Explore queries:", queries);

    // Helper to build the final API query and client-side filter instructions
    const buildHybridQuery = (baseQuery) => {
      let apiTags = baseQuery.tags ? baseQuery.tags.split(' ') : [];

      // Remove order:random if we have other sort orders or if we are going to fallback
      if (apiTags.includes('order:random')) {
        apiTags = apiTags.filter(tag => !tag.startsWith('order:'));
        apiTags.push('order:random'); // Keep it at the end or alone
      }

      // 1. Mandatory 'Free' Tags (Rating, Filetype)
      const freeTags = [];

      // Rating
      if (selectedRatings && selectedRatings.length > 0) {
        const ratingMap = { 'general': 'g', 'sensitive': 's', 'questionable': 'q', 'explicit': 'e' };
        const shortRatings = selectedRatings.map(r => ratingMap[r] || r);
        freeTags.push(`rating:${shortRatings.join(',')}`);
      }

      // Filetype filters (these don't count against Danbooru's 2-tag limit)
      // Danbooru supports comma syntax: filetype:mp4,webm means mp4 OR webm
      freeTags.push('-filetype:zip,swf');

      if (options.wantsVideos && !options.wantsImages) {
        freeTags.push('filetype:mp4,webm');
      } else if (!options.wantsVideos && options.wantsImages) {
        freeTags.push('-filetype:mp4,webm,gif');
      }

      // 2. 'Expensive' Tags (Base Query + Whitelist + Blacklist)
      const baseTagCount = apiTags.filter(t => !t.startsWith('status:')).length;
      const whitelistCount = whitelist.length;
      const blacklistCount = blacklist.length;

      const totalExpensiveTags = baseTagCount + whitelistCount + blacklistCount;

      let clientSideFilterNeeded = false;
      let finalApiTags = [...apiTags];

      // Check adapter tag limit
      const tagLimit = BooruService.getTagLimit();

      // Check if we exceed the limit
      if (totalExpensiveTags > tagLimit) {
        // HYBRID MODE: Send only Base Query + Free Tags to API.
        // Filter Whitelist/Blacklist client-side.
        clientSideFilterNeeded = true;
        console.log(`Query "${baseQuery.tags}" + filters exceeds API limit (${totalExpensiveTags} > ${tagLimit}). Using Client-Side Filtering.`);

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

        // Use cursor for this specific query
        const currentPage = this.strategyCursors[query.tags] || 1;
        apiQuery.page = currentPage;

        console.log(`Processing query: "${apiQuery.tags}" Page: ${currentPage} (ClientFilter: ${clientSideFilterNeeded})`);

        // Execute fetch
        return fetchFunction(apiQuery, limit)
          .then(posts => {
            // If NO posts found (raw from API), mark strategy as exhausted
            if (!posts || posts.length === 0) {
              this.exhaustedStrategies.add(query.tags);
              console.log(`Explorer: Strategy exhausted: "${query.tags}"`);
              return [];
            }

            let processedPosts = posts;

            // Apply Client-Side Filtering if needed
            if (clientSideFilterNeeded) {
              const beforeCount = processedPosts.length;
              processedPosts = this.applyClientSideFilters(processedPosts, { whitelist, blacklist });
              console.log(`Client-filter for "${query.tags}": ${beforeCount} -> ${processedPosts.length} posts`);
            }

            // If we got posts (even if filtered), increment cursor for next time
            // (Note: if filtered down to 0, we still advance page to try next batch)
            // But if API returned 0, we already handled it above.
            if (posts.length > 0) {
              this.strategyCursors[query.tags] = currentPage + 1;
            }

            // Attach detailed debug info
            return processedPosts.map(post => {
              // 1. Capture the ACTUAL API query tags sent to Danbooru
              const apiTagsSent = apiQuery.tags;

              // 2. Identify Client-Side Filters applied
              let clientFilterString = 'None';
              if (clientSideFilterNeeded) {
                const appliedFilters = [];
                if (whitelist.length > 0) appliedFilters.push(...whitelist.map(t => `+${t}`));
                if (blacklist.length > 0) appliedFilters.push(...blacklist.map(t => `-${t}`));
                if (appliedFilters.length > 0) clientFilterString = appliedFilters.join(' ');
              }

              // Determine Order (from API tags)
              let sortOrder = 'dflt/random';
              if (apiTagsSent.includes('order:')) {
                const parts = apiTagsSent.split(' ');
                const orderTag = parts.find(t => t.startsWith('order:'));
                if (orderTag) sortOrder = orderTag.replace('order:', '');
              }

              // Determine Rating (from API tags or selected)
              let ratingDebug = 'N/A';
              // Check if rating was in the sent tags
              if (apiTagsSent.includes('rating:')) {
                const parts = apiTagsSent.split(' ');
                const ratingTag = parts.find(t => t.startsWith('rating:'));
                if (ratingTag) ratingDebug = ratingTag.replace('rating:', '');
              } else if (selectedRatings && selectedRatings.length > 0) {
                ratingDebug = selectedRatings.join(',');
              }

              // Determine Filetype
              let filetypeDebug = 'N/A';
              if (options.wantsVideos && !options.wantsImages) filetypeDebug = 'Videos (Only)';
              else if (!options.wantsVideos && options.wantsImages) filetypeDebug = 'Images (Static Only - No GIF/Video)';
              else if (options.wantsVideos && options.wantsImages) filetypeDebug = 'All Media';

              post._debugMetadata = {
                apiQuery: apiTagsSent,       // The simplified query sent to cloud
                clientFilters: clientFilterString, // The strict filters applied locally
                order: sortOrder,
                rating: ratingDebug,
                filetype: filetypeDebug
              };

              post._strategy = query.type || 'single'; // Attach strategy type

              if (post._debugMetadata) {
                post._debugMetadata.strategy = query.type || 'single';
              }

              // Legacy support
              post._searchCriteria = apiTagsSent;

              return post;
            });
          })
          .catch(error => {
            console.error(`Query failed for tags: ${query.tags}`, error);
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

      // Remove duplicates, actively favoring 'duo' strategies
      const uniqueMap = new Map();
      allPosts.forEach(post => {
        const key = post.source ? `${post.source}|${post.id}` : String(post.id);
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, post);
        } else {
          // If duplicate, keep the one with the 'duo' strategy (more specific/diverse)
          const existing = uniqueMap.get(key);
          if (existing._strategy !== 'duo' && post._strategy === 'duo') {
            uniqueMap.set(key, post);
          }
        }
      });

      let uniquePosts = Array.from(uniqueMap.values());

      console.log(`Found ${uniquePosts.length} unique posts after deduplication`);

      // Filter out posts that have already been seen
      if (existingPostIds.size > 0) {
        uniquePosts = uniquePosts.filter(post => {
          const key = post.source ? `${post.source}|${post.id}` : String(post.id);
          return !existingPostIds.has(key);
        });
      }

      // PROBABILISTIC FEED INTERLEAVING
      // Separates posts into Ranked (safe) and Discovery (exploratory) buckets
      // then interleaves them to ensure content diversity.

      const DISCOVERY_INTERVAL = 4; // Slot a discovery post every Nth position

      // Score each post
      const scoredPosts = uniquePosts.map(post => ({
        post,
        score: this.scorePost(post)
      }));

      // Sort by score descending to determine percentiles
      scoredPosts.sort((a, b) => b.score - a.score);

      // Use PERCENTILE-BASED SPLITTING instead of absolute thresholds
      // This works regardless of the actual score scale (which can vary from 0.5 to 6+)
      const totalPosts = scoredPosts.length;
      const rankedCutoff = Math.floor(totalPosts * 0.6);  // Top 60% = Ranked
      // Bottom 40% = Discovery (lower-scored but not rejected)

      // Bucket 1: RANKED (Top 60%) - High-confidence content you'll probably like
      const rankedBucket = scoredPosts
        .slice(0, rankedCutoff)
        .map(sp => sp.post);

      // Bucket 2: DISCOVERY (Bottom 40%) - Lower-scored exploratory content
      const discoveryBucket = scoredPosts
        .slice(rankedCutoff)
        .map(sp => sp.post);

      console.log(`Feed buckets: ${rankedBucket.length} ranked (top 60%), ${discoveryBucket.length} discovery (bottom 40%)`);
      if (scoredPosts.length > 0) {
        console.log(`Score range: ${scoredPosts[scoredPosts.length - 1].score.toFixed(2)} - ${scoredPosts[0].score.toFixed(2)}`);
      }

      // Build interleaved feed
      const finalFeed = [];
      let rankedIndex = 0;
      let discoveryIndex = 0;

      for (let position = 0; finalFeed.length < Math.min(maxTotal, uniquePosts.length); position++) {
        // Every Nth position (e.g., 4th, 8th, 12th...), slot a discovery post
        if ((position + 1) % DISCOVERY_INTERVAL === 0 && discoveryIndex < discoveryBucket.length) {
          finalFeed.push(discoveryBucket[discoveryIndex++]);
        }
        // Otherwise, try ranked posts first
        else if (rankedIndex < rankedBucket.length) {
          finalFeed.push(rankedBucket[rankedIndex++]);
        }
        // Fallback to discovery if ranked is exhausted
        else if (discoveryIndex < discoveryBucket.length) {
          finalFeed.push(discoveryBucket[discoveryIndex++]);
        }
        // All buckets exhausted
        else {
          break;
        }
      }

      // Limit to max posts and cache logic
      const limitedFeed = finalFeed.slice(0, maxTotal);

      // Cache scores for these posts to ensure consistency
      limitedFeed.forEach(post => {
        if (!this.postScoreCache.has(post.id)) {
          this.scorePost(post); // Ensure score is cached
        }
      });

      console.log(`Returning ${limitedFeed.length} curated posts (from ${finalFeed.length} ranked candidates)`);

      // Return processed results (limited to maxTotal)
      return limitedFeed;
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
