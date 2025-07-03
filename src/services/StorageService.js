/**
 * StorageService.js
 * Handles persistent storage of user data and interactions
 */

// Constants
const INTERACTIONS_KEY = 'booruRamenInteractions';
const PREFERENCES_KEY = 'booruRamenPreferences';
const VIEW_HISTORY_KEY = 'booruRamenViewHistory';
const APP_SETTINGS_KEY = 'booruRamenAppSettings';

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
  const interactions = getStoredData(INTERACTIONS_KEY, []);
  
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
  
  return saveData(INTERACTIONS_KEY, interactions);
};

/**
 * Get user interactions, optionally filtered by type
 */
const getInteractions = (type = null) => {
  const interactions = getStoredData(INTERACTIONS_KEY, []);
  return type ? interactions.filter(i => i.type === type) : interactions;
};

/**
 * Get interactions by post ID
 */
const getPostInteractions = (postId) => {
    const interactions = getStoredData(INTERACTIONS_KEY, []);
    return interactions.filter(i => i.postId === postId);
};

/**
 * Store user preferences
 */
const storePreferences = (preferences) => {
  const currentPreferences = getStoredData(PREFERENCES_KEY, {});
  return saveData(PREFERENCES_KEY, { ...currentPreferences, ...preferences });
};

/**
 * Get user preferences
 */
const getPreferences = () => {
  return getStoredData(PREFERENCES_KEY, {});
};

/**
 * Track posts that have been viewed
 */
const trackPostView = (postId, postData) => {
  // Only track view if history is not disabled in settings
  const settings = loadAppSettings();
  if (settings && settings.settings && settings.settings.disableHistory) {
    return;
  }
  
  const history = getStoredData(VIEW_HISTORY_KEY, {});
  
  history[postId] = {
    lastViewed: Date.now(),
    data: postData
  };
  
  return saveData(VIEW_HISTORY_KEY, history);
};

/**
 * Check if a post has been viewed before
 */
const hasViewedPost = (postId) => {
  const history = getStoredData(VIEW_HISTORY_KEY, {});
  return !!history[postId];
};

/**
 * Get viewed posts history
 */
const getViewedPosts = () => {
  return getStoredData(VIEW_HISTORY_KEY, {});
};

/**
 * Get user's most interacted tags
 */
const getMostInteractedTags = (limit = 10) => {
    const interactions = getStoredData(INTERACTIONS_KEY, []);
    
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
  localStorage.removeItem(INTERACTIONS_KEY);
  localStorage.removeItem(PREFERENCES_KEY);
  localStorage.removeItem(VIEW_HISTORY_KEY);
  return true;
};

/**
 * Clear only the post history
 */
const clearHistory = () => {
  localStorage.removeItem(VIEW_HISTORY_KEY);
  return true;
};

/**
 * Clear only the 'like' interactions
 */
const clearLikes = () => {
  const interactions = getStoredData(INTERACTIONS_KEY, []);
  const filteredInteractions = interactions.filter(i => i.type !== 'like');
  return saveData(INTERACTIONS_KEY, filteredInteractions);
};

/**
 * Clear only the 'favorite' interactions
 */
const clearFavorites = () => {
  const interactions = getStoredData(INTERACTIONS_KEY, []);
  const filtered = interactions.filter(i => i.type !== 'favorite');
  return saveData(INTERACTIONS_KEY, filtered);
};

/**
 * Export analytics data for recommendations
 */
const exportAnalytics = () => {
    const interactions = getStoredData(INTERACTIONS_KEY, []);
    const preferences = getStoredData(PREFERENCES_KEY, {});
    const history = getStoredData(VIEW_HISTORY_KEY, {});
    
    return {
      interactionCount: interactions.length,
      uniquePostsViewed: Object.keys(history).length,
      topTags: getMostInteractedTags(5),
      preferences
    };
};

const saveAppSettings = (settings) => {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save app settings:", e);
  }
};

const loadAppSettings = () => {
  try {
    const settings = localStorage.getItem(APP_SETTINGS_KEY);
    return settings ? JSON.parse(settings) : null;
  } catch (e) {
    console.error("Failed to load app settings:", e);
    return null;
  }
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
  clearAllData,
  clearHistory,
  clearLikes,
  clearFavorites,
  exportAnalytics,
  saveAppSettings,
  loadAppSettings,
};