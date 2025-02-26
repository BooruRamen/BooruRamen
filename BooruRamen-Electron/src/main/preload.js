const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Database operations
    getSetting: (key, defaultValue) => ipcRenderer.invoke('get-setting', key, defaultValue),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
    isSeen: (postId) => ipcRenderer.invoke('is-seen', postId),
    markAsSeen: (postId, tags, rating) => ipcRenderer.invoke('mark-as-seen', postId, tags, rating),
    markPostStatus: (postId, status, tags, rating) => 
      ipcRenderer.invoke('mark-post-status', postId, status, tags, rating),
    
    // User profile operations
    loadUserProfile: () => ipcRenderer.invoke('load-user-profile'),
    saveUserProfile: (profile) => ipcRenderer.invoke('save-user-profile', profile),
    buildUserProfile: () => ipcRenderer.invoke('build-user-profile'),
    
    // Helper functions for math operations
    sigmoid: (x) => 1 / (1 + Math.exp(-x)),
    
    // Prediction function 
    predictPostLikelihood: (post, profile, tagWeight = 0.7, ratingWeight = 0.3) => {
      const tags = post.tag_string ? post.tag_string.split(' ') : [];
      const rating = post.rating || '';
      
      // User-specific scores and totals
      const tagScores = profile.tag_scores || {};
      const tagTotals = profile.tag_totals || {};
      const ratingScores = profile.rating_scores || {};
      const ratingTotals = profile.rating_totals || {};
      
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
      
      // Normalize weights
      const totalWeight = tagWeight + ratingWeight;
      const tagWeightNormalized = tagWeight / totalWeight;
      const ratingWeightNormalized = ratingWeight / totalWeight;
      
      // Combine scores with normalized weighting
      const totalScore = (tagWeightNormalized * tagScore) + (ratingWeightNormalized * ratingScore);
      
      // Scale total score to a probability between 0 and 1 using the sigmoid function
      const likelihood = 1 / (1 + Math.exp(-5 * (totalScore - 0.5)));
      
      return likelihood;
    },
    
    // Methods for updating user profile incrementally
    updateProfileIncrementally: (post, status, profile) => {
      const tags = post.tag_string ? post.tag_string.split(' ') : [];
      const rating = post.rating || '';
      let increment;
      
      if (status === 'liked') {
        increment = 1;
        profile.total_liked = (profile.total_liked || 0) + 1;
      } else if (status === 'super liked') {
        increment = 3;
        profile.total_liked = (profile.total_liked || 0) + 10;
      } else if (status === 'disliked') {
        increment = -1;
        profile.total_disliked = (profile.total_disliked || 0) + 1;
      } else {
        return profile;  // Do nothing for other statuses
      }
      
      // Initialize objects if they don't exist
      profile.tag_scores = profile.tag_scores || {};
      profile.tag_totals = profile.tag_totals || {};
      profile.rating_scores = profile.rating_scores || {};
      profile.rating_totals = profile.rating_totals || {};
      
      for (const tag of tags) {
        profile.tag_scores[tag] = (profile.tag_scores[tag] || 0) + increment;
        profile.tag_totals[tag] = (profile.tag_totals[tag] || 0) + 1;
      }
      
      profile.rating_scores[rating] = (profile.rating_scores[rating] || 0) + increment;
      profile.rating_totals[rating] = (profile.rating_totals[rating] || 0) + 1;
      
      return profile;
    },

    // Media loading proxy function - allows loading remote content
    fetchMedia: (url) => ipcRenderer.invoke('fetch-media', url)
  }
);