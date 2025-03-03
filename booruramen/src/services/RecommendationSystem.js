/**
 * RecommendationSystem.js
 * A recommendation system inspired by ByteDance's Monolith to optimize the user's feed
 * based on interaction history and preferences.
 */

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
  'artist', 'character', 'copyright', 'general', 'meta'
];

class RecommendationSystem {
  constructor() {
    this.userEmbedding = null;
    this.tagScores = null;
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
      .filter(([_, score]) => score > 0)
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
    
    // Add user's favorite tags if requested
    if (includeUserTags && this.tagScores) {
      const recommendedTags = this.getRecommendedTags(3);
      if (recommendedTags.length > 0) {
        // If we have multiple tags, use them as "any of these" query
        if (recommendedTags.length > 1 && !exploreMode) {
          tags.push(`(${recommendedTags.join(' OR ')})`);
        } 
        // In explore mode or with just one tag, add it directly
        else {
          tags.push(recommendedTags[0]);
        }
      }
    }
    
    // In explore mode, intentionally get more diverse content
    if (exploreMode) {
      // Add diversity by using order:random
      tags.push('order:random');
    }
    
    return {
      tags: tags.join(' ')
    };
  }

  /**
   * Generate diverse query sets for explore mode to cast a wider net
   * @param {number} count - Number of different query sets to generate
   * @returns {Array} - Array of query parameter objects
   */
  generateExploreQueries(count = 3) {
    const queries = [];
    
    // Always include one query with the user's top preferences
    queries.push(this.buildRecommendedQueryParams(true, true));
    
    if (count <= 1) return queries;
    
    // Get all tags with positive scores
    const positiveTags = Object.entries(this.tagScores || {})
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);
    
    // Generate a query with some mid-tier tags
    if (positiveTags.length > 5) {
      const midIndex = Math.floor(positiveTags.length / 2);
      const midTags = positiveTags.slice(midIndex, midIndex + 3)
        .map(([tag]) => tag);
      
      if (midTags.length > 0) {
        queries.push({
          tags: `(${midTags.join(' OR ')}) order:random`
        });
      }
    }
    
    if (count <= 2) return queries;
    
    // Generate a discovery query from tag categories the user likes
    const tagCategoryScores = {};
    
    // Calculate scores for each tag category
    Object.entries(this.tagScores || {}).forEach(([tag, score]) => {
      // Try to identify the tag category
      TAG_CATEGORIES.forEach(category => {
        if (tag.startsWith(`${category}:`)) {
          if (!tagCategoryScores[category]) {
            tagCategoryScores[category] = 0;
          }
          tagCategoryScores[category] += score;
        }
      });
    });
    
    // Find the top category
    const topCategory = Object.entries(tagCategoryScores)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (topCategory) {
      queries.push({
        tags: `${topCategory[0]}:* order:random`
      });
    } else {
      // If we can't find a category, use a popularity-based query
      queries.push({
        tags: 'order:rank'
      });
    }
    
    return queries;
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
  async getCuratedExploreFeed(fetchFunction, options = {}) {
    const { 
      fetchCount = 3,       // Number of different queries to run
      postsPerFetch = 20,   // Number of posts to fetch per query
      maxTotal = 50         // Maximum total posts to return
    } = options;
    
    // Generate diverse query sets
    const queries = this.generateExploreQueries(fetchCount);
    console.log("Explore mode queries:", queries);
    
    // Fetch posts for each query in parallel
    try {
      const fetchPromises = queries.map(query => 
        fetchFunction(query, postsPerFetch)
      );
      
      const fetchResults = await Promise.all(fetchPromises);
      
      // Combine all fetched posts
      let allPosts = [];
      fetchResults.forEach(posts => {
        if (posts && posts.length) {
          allPosts = [...allPosts, ...posts];
        }
      });
      
      // Remove duplicates
      const uniquePosts = Array.from(
        new Map(allPosts.map(post => [post.id, post])).values()
      );
      
      // Rank the combined posts using our recommendation system
      const rankedPosts = this.rankPosts(uniquePosts);
      
      // Return the top posts up to maxTotal
      return rankedPosts.slice(0, maxTotal);
    } catch (error) {
      console.error("Error fetching curated explore feed:", error);
      return [];
    }
  }
}

// Create and export a singleton instance
const recommendationSystem = new RecommendationSystem();
export default recommendationSystem;
