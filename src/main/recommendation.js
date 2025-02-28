// Monolith-inspired recommendation system for BooruRamen
// Combines collaborative filtering, content-based filtering, and multi-armed bandit approach

class MonolithRecommendation {
  constructor(db) {
    this.db = db;
    this.tagEmbeddings = {}; // Cache for tag embeddings
    this.userProfile = null;
    this.explorationRate = 0.2; // Exploration rate for multi-armed bandit (20% random content)
    this.decayFactor = 0.98; // Decay factor for historical preferences
    this.postScoresCache = new Map(); // Cache for post scores to avoid recalculation
    this.initialized = false;
  }

  /**
   * Initialize the recommendation system with user profile
   * @param {Object} userProfile - User profile data
   */
  async initialize(userProfile) {
    this.userProfile = userProfile || {
      tag_scores: {},
      tag_totals: {},
      rating_scores: {},
      rating_totals: {},
      total_liked: 0,
      total_disliked: 0,
      embeddings: {}
    };

    // Generate embeddings for tags if they don't exist
    if (!this.userProfile.embeddings) {
      this.userProfile.embeddings = {};
    }

    // Load recent user interactions for recency bias
    if (this.db) {
      try {
        this.recentInteractions = await this.getRecentInteractions();
      } catch (err) {
        console.error("Error loading recent interactions:", err);
        this.recentInteractions = [];
      }
    }

    this.initialized = true;
    console.log("Monolith recommendation system initialized");
    return this.userProfile;
  }

  /**
   * Get recent user interactions for recency bias
   * @returns {Array} Array of recent interactions
   */
  async getRecentInteractions(limit = 50) {
    if (!this.db) return [];

    try {
      const query = `
        SELECT id, status, tags, rating, timestamp 
        FROM seen_posts 
        WHERE status IS NOT NULL 
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      const interactions = this.db.prepare(query).all(limit);
      return interactions;
    } catch (err) {
      console.error("Error getting recent interactions:", err);
      return [];
    }
  }

  /**
   * Generate simple tag embeddings based on co-occurrence
   * @param {string} tag - The tag to generate embedding for
   * @returns {Object} Simple vector representation for the tag
   */
  generateTagEmbedding(tag) {
    if (this.tagEmbeddings[tag]) {
      return this.tagEmbeddings[tag];
    }

    // Create a simple embedding by hashing the tag string
    // This is a placeholder for a more sophisticated embedding approach
    const hashCode = str => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash;
    };

    // Generate 10 dimensions for the tag embedding
    const embedding = [];
    for (let i = 0; i < 10; i++) {
      // Use different seed for each dimension
      const seed = hashCode(tag + i.toString());
      // Convert to value between -1 and 1
      embedding.push((seed % 1000) / 500 - 1);
    }

    this.tagEmbeddings[tag] = embedding;
    return embedding;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate user's embedding based on liked tags
   * @returns {Array} User embedding vector
   */
  calculateUserEmbedding() {
    if (!this.userProfile || !this.userProfile.tag_scores) {
      return new Array(10).fill(0);
    }

    // Get top 20 tags with highest scores
    const topTags = Object.entries(this.userProfile.tag_scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(entry => entry[0]);

    // If no top tags, return zero vector
    if (topTags.length === 0) {
      return new Array(10).fill(0);
    }

    // Average embeddings of top tags
    const userEmbedding = new Array(10).fill(0);
    for (const tag of topTags) {
      const tagEmbedding = this.generateTagEmbedding(tag);
      for (let i = 0; i < userEmbedding.length; i++) {
        userEmbedding[i] += tagEmbedding[i];
      }
    }

    // Normalize
    for (let i = 0; i < userEmbedding.length; i++) {
      userEmbedding[i] /= topTags.length;
    }

    return userEmbedding;
  }

  /**
   * Get embedding for a post
   * @param {Object} post - Post object
   * @returns {Array} Post embedding vector
   */
  getPostEmbedding(post) {
    if (!post.tag_string) {
      return new Array(10).fill(0);
    }

    const tags = post.tag_string.split(' ');
    if (tags.length === 0) {
      return new Array(10).fill(0);
    }

    // Average embeddings of all tags
    const postEmbedding = new Array(10).fill(0);
    for (const tag of tags) {
      const tagEmbedding = this.generateTagEmbedding(tag);
      for (let i = 0; i < postEmbedding.length; i++) {
        postEmbedding[i] += tagEmbedding[i];
      }
    }

    // Normalize
    for (let i = 0; i < postEmbedding.length; i++) {
      postEmbedding[i] /= tags.length;
    }

    return postEmbedding;
  }

  /**
   * Update the user profile when a post is rated
   * @param {Object} post - The post that was rated
   * @param {string} status - 'liked', 'super liked', or 'disliked'
   * @returns {Object} Updated user profile
   */
  updateProfile(post, status) {
    if (!this.userProfile) {
      this.userProfile = {
        tag_scores: {},
        tag_totals: {},
        rating_scores: {},
        rating_totals: {},
        total_liked: 0,
        total_disliked: 0,
        embeddings: {}
      };
    }

    const tags = post.tag_string ? post.tag_string.split(' ') : [];
    const rating = post.rating || '';
    let increment;

    // Apply time decay to existing scores
    this.applyDecay();

    if (status === 'liked') {
      increment = 1;
      this.userProfile.total_liked = (this.userProfile.total_liked || 0) + 1;
    } else if (status === 'super liked') {
      increment = 3; // Super likes have 3x the weight
      this.userProfile.total_liked = (this.userProfile.total_liked || 0) + 3;
    } else if (status === 'disliked') {
      increment = -1;
      this.userProfile.total_disliked = (this.userProfile.total_disliked || 0) + 1;
    } else {
      return this.userProfile; // Do nothing for other statuses
    }

    // Initialize objects if they don't exist
    this.userProfile.tag_scores = this.userProfile.tag_scores || {};
    this.userProfile.tag_totals = this.userProfile.tag_totals || {};
    this.userProfile.rating_scores = this.userProfile.rating_scores || {};
    this.userProfile.rating_totals = this.userProfile.rating_totals || {};
    this.userProfile.embeddings = this.userProfile.embeddings || {};

    // Update tag scores
    for (const tag of tags) {
      this.userProfile.tag_scores[tag] = (this.userProfile.tag_scores[tag] || 0) + increment;
      this.userProfile.tag_totals[tag] = (this.userProfile.tag_totals[tag] || 0) + 1;

      // Store embedding for this tag if we haven't yet
      if (!this.userProfile.embeddings[tag]) {
        this.userProfile.embeddings[tag] = this.generateTagEmbedding(tag);
      }
    }

    // Update rating scores
    this.userProfile.rating_scores[rating] = (this.userProfile.rating_scores[rating] || 0) + increment;
    this.userProfile.rating_totals[rating] = (this.userProfile.rating_totals[rating] || 0) + 1;

    // Clear cache as scores have changed
    this.postScoresCache.clear();

    return this.userProfile;
  }

  /**
   * Apply time decay to user preferences to favor recent interactions
   */
  applyDecay() {
    if (!this.userProfile || !this.userProfile.tag_scores) {
      return;
    }

    // Apply decay to tag scores
    for (const tag in this.userProfile.tag_scores) {
      this.userProfile.tag_scores[tag] *= this.decayFactor;
    }

    // Apply decay to rating scores
    for (const rating in this.userProfile.rating_scores) {
      this.userProfile.rating_scores[rating] *= this.decayFactor;
    }
  }

  /**
   * Score a post based on multiple features (tag similarity, rating preference, embedding similarity)
   * @param {Object} post - The post to score
   * @returns {number} Score between 0 and 1
   */
  scorePost(post) {
    if (!this.initialized || !this.userProfile) {
      return 0.5; // Default neutral score if not initialized
    }

    // Check cache first
    const postId = post.id;
    if (this.postScoresCache.has(postId)) {
      return this.postScoresCache.get(postId);
    }

    const tags = post.tag_string ? post.tag_string.split(' ') : [];
    const rating = post.rating || '';
    
    // User-specific scores and totals
    const tagScores = this.userProfile.tag_scores || {};
    const tagTotals = this.userProfile.tag_totals || {};
    const ratingScores = this.userProfile.rating_scores || {};
    const ratingTotals = this.userProfile.rating_totals || {};
    
    let tagScore = 0;
    let ratingScore = 0;
    
    // Apply Laplace smoothing for tag scores
    for (const tag of tags) {
      // User's interaction with the tag
      const netScore = tagScores[tag] || 0;
      const total = tagTotals[tag] || 0;
      
      // Apply Laplace smoothing to handle rare or unseen tags
      const smoothedScore = (netScore + 1) / (total + 2);
      tagScore += smoothedScore;
    }
    
    if (tags.length > 0) {
      tagScore /= tags.length;  // Average over number of tags
    } else {
      // If there are no tags, assign a neutral score of 0.5
      tagScore = 0.5;
    }
    
    // Apply Laplace smoothing for rating scores
    const netRatingScore = ratingScores[rating] || 0;
    const totalRating = ratingTotals[rating] || 0;
    
    let smoothedRatingScore;
    if (totalRating > 0) {
      smoothedRatingScore = (netRatingScore + 1) / (totalRating + 2);
    } else {
      // Assign a neutral score for unseen ratings
      smoothedRatingScore = 0.5;
    }
    
    ratingScore = smoothedRatingScore;
    
    // Calculate embedding similarity score
    const userEmbedding = this.calculateUserEmbedding();
    const postEmbedding = this.getPostEmbedding(post);
    const embeddingScore = (this.cosineSimilarity(userEmbedding, postEmbedding) + 1) / 2; // Normalize to [0,1]
    
    // Weighting parameters
    const tagWeight = 0.4;
    const ratingWeight = 0.2;
    const embeddingWeight = 0.4;
    
    // Combine scores with weighting
    const totalWeight = tagWeight + ratingWeight + embeddingWeight;
    const weightedScore = 
      (tagWeight * tagScore + 
       ratingWeight * ratingScore + 
       embeddingWeight * embeddingScore) / totalWeight;
    
    // Scale total score to a probability between 0 and 1 using sigmoid function
    const finalScore = 1 / (1 + Math.exp(-5 * (weightedScore - 0.5)));
    
    // Cache the result
    this.postScoresCache.set(postId, finalScore);

    return finalScore;
  }

  /**
   * Sort and recommend posts based on predicted scores with exploration
   * @param {Array} posts - Array of posts to rank
   * @returns {Array} Sorted posts with scores
   */
  recommendPosts(posts) {
    if (!posts || posts.length === 0) {
      return [];
    }

    // If not initialized, return random order
    if (!this.initialized) {
      return this.shuffleArray([...posts]);
    }

    // Calculate scores for each post
    const scoredPosts = posts.map(post => {
      return {
        post,
        score: this.scorePost(post),
        isExploration: Math.random() < this.explorationRate
      };
    });

    // Sort posts: exploration posts randomly, others by score
    scoredPosts.sort((a, b) => {
      if (a.isExploration && b.isExploration) {
        return Math.random() - 0.5; // Random order for exploration
      } else if (a.isExploration) {
        return -1; // Exploration posts first
      } else if (b.isExploration) {
        return 1; // Exploration posts first
      }
      return b.score - a.score; // Higher scores first
    });

    // Return posts with their scores for debugging
    return scoredPosts.map(item => ({
      ...item.post,
      recommendationScore: item.score,
      isExploration: item.isExploration
    }));
  }

  /**
   * Adjust exploration rate based on user profile size
   */
  adjustExplorationRate() {
    if (!this.userProfile) {
      return;
    }

    const totalInteractions = (this.userProfile.total_liked || 0) + (this.userProfile.total_disliked || 0);
    
    // Decrease exploration rate as user interacts more
    if (totalInteractions > 100) {
      this.explorationRate = 0.1;
    } else if (totalInteractions > 50) {
      this.explorationRate = 0.15;
    } else if (totalInteractions > 20) {
      this.explorationRate = 0.2;
    } else {
      this.explorationRate = 0.25; // High exploration for new users
    }
  }

  /**
   * Shuffle array randomly (Fisher-Yates algorithm)
   */
  shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Export the recommendation model for storage
   */
  exportModel() {
    return {
      userProfile: this.userProfile,
      explorationRate: this.explorationRate,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import a previously exported recommendation model
   */
  importModel(model) {
    if (!model || !model.userProfile) {
      return false;
    }

    this.userProfile = model.userProfile;
    this.explorationRate = model.explorationRate || this.explorationRate;
    this.initialized = true;
    return true;
  }

  /**
   * Get the user's top tags ranked by score
   * @param {number} limit - Maximum number of tags to return
   * @returns {Array} Array of objects with tag and score properties
   */
  getTopUserTags(limit = 20) {
    if (!this.userProfile || !this.userProfile.tag_scores) {
      return [];
    }

    // Get tags sorted by score
    const sortedTags = Object.entries(this.userProfile.tag_scores)
      .map(([tag, score]) => {
        // Calculate a normalized score
        const total = this.userProfile.tag_totals[tag] || 1;
        // Only include tags with positive scores and minimum interactions
        return {
          tag,
          rawScore: score,
          interactions: total,
          // Calculate normalized score (score per interaction)
          normalizedScore: score / total
        };
      })
      // Filter out tags with negative scores or too few interactions
      .filter(item => item.rawScore > 0 && item.interactions >= 2)
      // Sort by normalized score (higher is better)
      .sort((a, b) => b.normalizedScore - a.normalizedScore)
      .slice(0, limit);

    return sortedTags;
  }

  /**
   * Get pairs of tags that frequently appear together in liked posts
   * @param {number} limit - Maximum number of tag pairs to return
   * @returns {Array} Array of objects with tags and score properties
   */
  getTopTagCombinations(limit = 10) {
    if (!this.db || !this.userProfile) {
      return [];
    }

    try {
      // Get posts that user liked
      const query = `
        SELECT tags 
        FROM seen_posts 
        WHERE status IN ('liked', 'super liked')
        ORDER BY timestamp DESC 
        LIMIT 200
      `;
      const likedPosts = this.db.prepare(query).all();
      
      // Count tag co-occurrences
      const tagPairs = {};
      
      likedPosts.forEach(post => {
        if (!post.tags) return;
        
        const tags = post.tags.split(' ');
        // Generate all possible pairs of tags
        for (let i = 0; i < tags.length; i++) {
          for (let j = i + 1; j < tags.length; j++) {
            // Create a consistent key for the pair
            const pair = [tags[i], tags[j]].sort().join('__');
            tagPairs[pair] = (tagPairs[pair] || 0) + 1;
          }
        }
      });
      
      // Convert to array and sort
      const sortedPairs = Object.entries(tagPairs)
        .map(([pair, count]) => {
          const [tag1, tag2] = pair.split('__');
          return { 
            tags: [tag1, tag2], 
            count,
            // Also include individual tag scores
            tag1Score: this.userProfile.tag_scores[tag1] || 0,
            tag2Score: this.userProfile.tag_scores[tag2] || 0
          };
        })
        // Only include pairs with significant co-occurrence
        .filter(item => item.count >= 3)
        // Sort by count (higher is better)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      
      return sortedPairs;
    } catch (err) {
      console.error("Error getting tag combinations:", err);
      return [];
    }
  }
}

module.exports = MonolithRecommendation;