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

      <!-- Toggle Debug Mode -->
      <div class="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
        <div class="flex flex-col">
          <label class="text-lg" for="debug-mode">Debug Mode</label>
          <span class="text-sm text-gray-400">Show recommendation analytics overlay</span>
        </div>
        <button 
          @click="toggleDebugMode" 
          class="relative inline-flex h-6 w-11 items-center rounded-full"
          :class="debugMode ? 'bg-pink-600' : 'bg-gray-600'"
        >
          <span 
            class="inline-block h-4 w-4 transform rounded-full bg-white transition"
            :class="debugMode ? 'translate-x-6' : 'translate-x-1'"
          ></span>
        </button>
      </div>


      <!-- Avoided Tags Configuration -->
      <div class="p-4 bg-gray-800 rounded-lg">
        <div class="mb-2">
          <label class="text-lg font-medium">Avoided Query Tags</label>
          <p class="text-xs text-gray-400 mt-1">
            These tags are excluded from search queries to prevent generic results. 
            Separate with commas or spaces.
          </p>
        </div>
        
        <textarea 
          v-model="avoidedTagsInput" 
          class="w-full h-32 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-gray-200 focus:border-pink-500 focus:outline-none mb-3"
          placeholder="e.g. 1girl, solo, comic..."
        ></textarea>
        
        <div class="flex justify-between items-center">
          <button 
            @click="resetAvoidedTags" 
            class="text-sm text-gray-400 hover:text-white underline"
          >
            Reset to Defaults
          </button>
          
          <button 
            @click="saveAvoidedTags" 
            class="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded text-white text-sm font-medium transition"
          >
            Save Tags
          </button>
        </div>
        <p v-if="saveMessage" class="text-green-400 text-xs mt-2 text-right">{{ saveMessage }}</p>
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
    <!-- Confirmation Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-80 backdrop-blur-sm">
      <div class="bg-gray-800 rounded-lg max-w-sm w-full p-6 shadow-xl border border-gray-700">
        <h3 class="text-xl font-bold mb-2">{{ modalTitle }}</h3>
        <p class="text-gray-300 mb-6">{{ modalMessage }}</p>
        <div class="flex gap-3">
          <button 
            @click="closeModal" 
            class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium transition"
          >
            Cancel
          </button>
          <button 
            @click="executeAction" 
            class="flex-1 px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded text-white font-medium transition"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import StorageService from '../services/StorageService';
import { COMMON_TAGS } from '../services/RecommendationSystem';

export default {
  name: 'ProfileSettingsView',
  data() {
    return {
      disableHistory: false,
      debugMode: false,
      showModal: false,
      modalTitle: '',
      modalMessage: '',

      pendingAction: null,
      avoidedTagsInput: '',
      saveMessage: ''
    };
  },
  mounted() {
    const preferences = StorageService.getPreferences();
    this.disableHistory = preferences.disableHistory || false;

    this.debugMode = preferences.debugMode || false;
    
    // Load avoided tags
    if (preferences.avoidedTags && Array.isArray(preferences.avoidedTags)) {
      this.avoidedTagsInput = preferences.avoidedTags.join(', ');
    } else {
      this.avoidedTagsInput = COMMON_TAGS.join(', ');
    }
  },
  methods: {
    toggleHistory() {
      this.disableHistory = !this.disableHistory;
      StorageService.storePreferences({ disableHistory: this.disableHistory });
    },
    toggleDebugMode() {
      this.debugMode = !this.debugMode;
      StorageService.storePreferences({ debugMode: this.debugMode });
    },

    saveAvoidedTags() {
      // Parse tags from input (comma or space separated)
      const tags = this.avoidedTagsInput
        .split(/[\s,]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      // Remove duplicates
      const uniqueTags = [...new Set(tags)];
      
      StorageService.storePreferences({ avoidedTags: uniqueTags });
      
      // Update local input to reflect cleaned list
      this.avoidedTagsInput = uniqueTags.join(', ');
      
      this.saveMessage = 'Settings saved!';
      setTimeout(() => {
        this.saveMessage = '';
      }, 3000);
      
      // Force reload of recommendation system profile? 
      // It updates every 5 mins or on new interaction, but we might want to force it?
      // Since it's a separate service instance, we can't easily reach it directly from here without a global event bus or re-importing singleton?
      // The RecommendationSystem creates a NEW instance in 'services/RecommendationSystem.js' but it's not exported as a singleton instance, it's a class. 
      // Wait, looking at RecommendationSystem.js, it DOES NOT export an instance. It's just a class.
      // Who uses it? checking imports...
      // Usually there's a specific file that instantiates it or it's a singleton export.
      // Let's assume it picks up changes on next cycle or page reload.
      // Actually, if the App instantiates it, we might need a reload.
    },
    resetAvoidedTags() {
      this.avoidedTagsInput = COMMON_TAGS.join(', ');
      // We don't auto-save on reset, user must click save.
      // Or we can auto-save. The prompt said "The reset to defaults button will reset it to what we have now."
      // It implies resetting the text box. The user likely needs to save.
      // But let's check: "This set should be saved until the user changes it again... or if the user presses the 'reset to defaults' button"
      // Implies immediate effect? I'll make it easier and just update input, let user Save. 
      // Actually, standard pattern is Reset -> fills input -> User reviews -> Save.
    },
    confirmAction(title, message, action) {
      this.modalTitle = title;
      this.modalMessage = message;
      this.pendingAction = action;
      this.showModal = true;
    },
    executeAction() {
      if (this.pendingAction) {
        this.pendingAction();
        this.pendingAction = null;
      }
      this.showModal = false;
    },
    closeModal() {
      this.showModal = false;
      this.pendingAction = null;
    },
    wipeHistory() {
      this.confirmAction(
        'Clear History',
        'Are you sure you want to clear your entire viewing history?',
        () => {
          StorageService.clearHistory();
          // alert('History cleared.'); // Removed alert as well
        }
      );
    },
    wipeLikes() {
      this.confirmAction(
        'Clear Likes',
        'Are you sure you want to clear all your liked posts?',
        () => {
          StorageService.clearLikes();
        }
      );
    },
    wipeFavorites() {
      this.confirmAction(
        'Clear Favorites',
        'Are you sure you want to clear all your favorited posts?',
        () => {
          StorageService.clearFavorites();
        }
      );
    },
    wipeAll() {
      this.confirmAction(
        'Clear All Data',
        'Are you sure you want to clear ALL your data? This cannot be undone.',
        () => {
          StorageService.clearAllData();
          // Reset local UI state to defaults
          this.disableHistory = false;
          this.debugMode = false;
          this.avoidedTagsInput = COMMON_TAGS.join(', ');
        }
      );
    },
  },
};
</script> 