<template>
  <div class="p-4 text-white">
    <router-link to="/profile" class="text-pink-500 mb-4 inline-block">&lt; Back to Profile</router-link>
    <h1 class="text-2xl font-bold mb-8 text-center">Profile Settings</h1>
    
    <div class="space-y-6 max-w-md mx-auto">
      <!-- Toggle History -->
      <div class="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
        <label class="text-lg" for="disable-history">Disable View History</label>
        <button 
          @click="toggleHistory" 
          class="relative inline-flex h-6 w-11 items-center rounded-full"
          :class="disableHistory ? 'bg-pink-600' : 'bg-gray-600'"
        >
          <span 
            class="inline-block h-4 w-4 transform rounded-full bg-white transition"
            :class="disableHistory ? 'translate-x-6' : 'translate-x-1'"
          ></span>
        </button>
      </div>

      <!-- Clear Buttons -->
      <div class="space-y-4">
        <button @click="wipeHistory" class="w-full text-center bg-red-800 hover:bg-red-700 py-3 rounded-md text-lg">
          Clear History
        </button>
        <button @click="wipeLikes" class="w-full text-center bg-red-800 hover:bg-red-700 py-3 rounded-md text-lg">
          Clear Likes
        </button>
        <button @click="wipeFavorites" class="w-full text-center bg-red-800 hover:bg-red-700 py-3 rounded-md text-lg">
          Clear Favorites
        </button>
        <button @click="wipeAll" class="w-full text-center bg-red-800 hover:bg-red-700 py-3 rounded-md text-lg">
          Clear All Data
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import StorageService from '../services/StorageService';

export default {
  name: 'ProfileSettingsView',
  data() {
    return {
      disableHistory: false,
    };
  },
  mounted() {
    const preferences = StorageService.getPreferences();
    this.disableHistory = preferences.disableHistory || false;
  },
  methods: {
    toggleHistory() {
      this.disableHistory = !this.disableHistory;
      StorageService.storePreferences({ disableHistory: this.disableHistory });
    },
    wipeHistory() {
      if (confirm('Are you sure you want to clear your entire viewing history?')) {
        StorageService.clearHistory();
        alert('History cleared.');
      }
    },
    wipeLikes() {
      if (confirm('Are you sure you want to clear all your liked posts?')) {
        StorageService.clearLikes();
        alert('Likes cleared.');
      }
    },
    wipeFavorites() {
      if (confirm('Are you sure you want to clear all your favorited posts?')) {
        StorageService.clearFavorites();
        alert('Favorites cleared.');
      }
    },
    wipeAll() {
      if (confirm('Are you sure you want to clear ALL your data? This cannot be undone.')) {
        StorageService.clearAllData();
        alert('All data cleared.');
      }
    },
  },
};
</script> 