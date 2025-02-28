const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Database operations
    getSetting: (key, defaultValue) => ipcRenderer.invoke('get-setting', key, defaultValue),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
    setSettingsBatch: (settingsObj) => ipcRenderer.invoke('set-settings-batch', settingsObj),
    isSeen: (postId) => ipcRenderer.invoke('is-seen', postId),
    arePostsSeen: (postIds) => ipcRenderer.invoke('are-posts-seen', postIds),
    markAsSeen: (postId, tags, rating) => ipcRenderer.invoke('mark-as-seen', postId, tags, rating),
    markPostStatus: (postId, status, tags, rating) => 
      ipcRenderer.invoke('mark-post-status', postId, status, tags, rating),
    checkDatabaseStatus: () => ipcRenderer.invoke('check-database-status'),
    
    // User profile operations
    loadUserProfile: () => ipcRenderer.invoke('load-user-profile'),
    saveUserProfile: (profile) => ipcRenderer.invoke('save-user-profile', profile),
    buildUserProfile: () => ipcRenderer.invoke('build-user-profile'),
    
    // Helper functions for math operations
    sigmoid: (x) => 1 / (1 + Math.exp(-x)),
    
    // Prediction function - MOVED TO RENDERER
    
    // Methods for updating user profile incrementally - MOVED TO RENDERER
    
    // Media loading proxy function - allows loading remote content
    fetchMedia: (url) => ipcRenderer.invoke('fetch-media', url)
  }
);