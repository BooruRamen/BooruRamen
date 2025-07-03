/**
 * StorageService.js
 * Handles persistent storage of user data and interactions
 */

// Constants
const STORAGE_KEYS = {
  INTERACTIONS: 'booru-interactions',
  USER_PREFERENCES: 'booru-preferences',
  POST_HISTORY: 'booru-history'
};

// Maximum number of interactions to store
const MAX_INTERACTIONS = 1000;

/**
 * Get data from local storage with fallback to default value
 */
const getStoredData = (key, defaultValue) => {
  try {
    const storedData = localStorage.getItem(key);
    return storedData ? JSON.parse(storedData) : defaultValue;
  } catch (error) {
    console.error(`Error retrieving data for key ${key}:`, error);
    return defaultValue;
  }
};

/**
 * Save data to local storage
 */
const saveData = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`Error saving data for key ${key}:`, error);
    return false;
  }
};

/**
 * Store user interaction with a post
 * @param {Object} interaction - The interaction data
 * @param {string} interaction.postId - ID of the post
 * @param {string} interaction.type - Type of interaction ('view', 'like', 'dislike', 'favorite', 'timeSpent')
 * @param {number} interaction.value - Value of the interaction (1 for boolean actions, milliseconds for timeSpent)
 * @param {Object} interaction.metadata - Additional metadata for the interaction
 */
const storeInteraction = (interaction) => {
  if (!interaction.postId || !interaction.type) {
    console.error('Invalid interaction data:', interaction);
    return false;
  }

  const timestamp = Date.now();
  const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
  
  const existingIndex = interactions.findIndex(
    (i) => i.postId === interaction.postId && i.type === interaction.type
  );

  if (existingIndex > -1) {
    // Update the existing interaction
    interactions[existingIndex] = {
      ...interactions[existingIndex],
      ...interaction,
      timestamp, // Always update the timestamp
    };
  } else {
    // Add new interaction with timestamp
    interactions.push({
      ...interaction,
      timestamp,
    });
  }
  
  // Keep only the most recent interactions if we exceed the max
  if (interactions.length > MAX_INTERACTIONS) {
    interactions.splice(0, interactions.length - MAX_INTERACTIONS);
  }
  
  return saveData(STORAGE_KEYS.INTERACTIONS, interactions);
};

/**
 * Get user interactions, optionally filtered by type
 */
const getInteractions = (type = null) => {
  const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
  return type ? interactions.filter(i => i.type === type) : interactions;
};

/**
 * Get interactions by post ID
 */
const getPostInteractions = (postId) => {
    const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
    return interactions.filter(i => i.postId === postId);
};

/**
 * Store user preferences
 */
const storePreferences = (preferences) => {
  const currentPreferences = getStoredData(STORAGE_KEYS.USER_PREFERENCES, {});
  return saveData(STORAGE_KEYS.USER_PREFERENCES, { ...currentPreferences, ...preferences });
};

/**
 * Get user preferences
 */
const getPreferences = () => {
  return getStoredData(STORAGE_KEYS.USER_PREFERENCES, {});
};

/**
 * Track posts that have been viewed
 */
const trackPostView = (postId, postData) => {
  const preferences = getPreferences();
  if (preferences.disableHistory) {
    return false;
  }
  
  const history = getStoredData(STORAGE_KEYS.POST_HISTORY, {});
  
  history[postId] = {
    lastViewed: Date.now(),
    data: postData
  };
  
  return saveData(STORAGE_KEYS.POST_HISTORY, history);
};

/**
 * Check if a post has been viewed before
 */
const hasViewedPost = (postId) => {
  const history = getStoredData(STORAGE_KEYS.POST_HISTORY, {});
  return !!history[postId];
};

/**
 * Get viewed posts history
 */
const getViewedPosts = () => {
  return getStoredData(STORAGE_KEYS.POST_HISTORY, {});
};

/**
 * Get user's most interacted tags
 */
const getMostInteractedTags = (limit = 10) => {
    const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
    
    // Initialize tag counters
    const tagCounts = {};
    
    // Count positive interactions with each tag
    interactions.forEach(interaction => {
      // Only count positive interactions
      const isPositive = (
        (interaction.type === 'like' && interaction.value > 0) ||
        (interaction.type === 'favorite' && interaction.value > 0) || 
        (interaction.type === 'timeSpent' && interaction.value > 5000) // 5 seconds
      );
      
      if (isPositive && interaction.metadata && interaction.metadata.post) {
        const post = interaction.metadata.post;
        
        // Process all tags
        if (post.tag_string) {
          post.tag_string.split(' ').forEach(tag => {
            if (!tagCounts[tag]) {
              tagCounts[tag] = 0;
            }
            tagCounts[tag]++;
          });
        }
      }
    });
    
    // Convert to array, sort by count, and take top 'limit'
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
};

/**
 * Clear all stored data
 */
const clearAllData = () => {
  localStorage.removeItem(STORAGE_KEYS.INTERACTIONS);
  localStorage.removeItem(STORAGE_KEYS.USER_PREFERENCES);
  localStorage.removeItem(STORAGE_KEYS.POST_HISTORY);
  return true;
};

/**
 * Clear only the post history
 */
const clearHistory = () => {
  localStorage.removeItem(STORAGE_KEYS.POST_HISTORY);
  return true;
};

/**
 * Clear only the 'like' interactions
 */
const clearLikes = () => {
  const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
  const filteredInteractions = interactions.filter(i => i.type !== 'like');
  return saveData(STORAGE_KEYS.INTERACTIONS, filteredInteractions);
};

/**
 * Clear only the 'favorite' interactions
 */
const clearFavorites = () => {
  const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
  const filteredInteractions = interactions.filter(i => i.type !== 'favorite');
  return saveData(STORAGE_KEYS.INTERACTIONS, filteredInteractions);
};

/**
 * Export analytics data for recommendations
 */
const exportAnalytics = () => {
    const interactions = getStoredData(STORAGE_KEYS.INTERACTIONS, []);
    const preferences = getStoredData(STORAGE_KEYS.USER_PREFERENCES, {});
    const history = getStoredData(STORAGE_KEYS.POST_HISTORY, {});
    
    return {
      interactionCount: interactions.length,
      uniquePostsViewed: Object.keys(history).length,
      topTags: getMostInteractedTags(5),
      preferences
    };
};

export default {
    storeInteraction,
    getInteractions,
    getPostInteractions,
    storePreferences,
    getPreferences,
    trackPostView,
    hasViewedPost,
    getViewedPosts,
    getMostInteractedTags,
    exportAnalytics,
    clearAllData,
    clearHistory,
    clearLikes,
    clearFavorites,
  };