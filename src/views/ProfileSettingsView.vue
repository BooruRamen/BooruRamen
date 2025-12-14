<template>
  <div class="p-4 text-white">
    <router-link to="/profile" class="text-pink-500 mb-4 inline-block">&lt; Back to Profile</router-link>
    <h1 class="text-2xl font-bold mb-8 text-center">Profile Settings</h1>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
      <!-- Left Column: General Settings -->
      <div class="space-y-6">
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
              Separate with spaces.
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

      <!-- Right Column: Source Management -->
      <div class="space-y-6">
        <div class="p-4 bg-gray-800 rounded-lg h-full"> 
           <h2 class="text-lg font-medium mb-3">Booru Sources</h2>
           <p class="text-xs text-gray-400 mb-4">Select one or more sources to search from. Aggregating multiple sources may be slower.</p>
           
           <div class="space-y-2 mb-4">
               <!-- Predefined Sources -->
               <div v-for="source in predefinedSources" :key="source.name">
                   <div class="mb-2">
                       <div class="flex items-center justify-between bg-gray-900 p-2 rounded">
                           <div class="flex items-center gap-2">
                               <span class="text-sm font-medium">{{ source.name }}</span>
                               <span class="text-xs text-gray-500">({{ source.type }})</span>
                           </div>
                           <div class="flex items-center gap-3">
                               <button 
                                @click="toggleAuth(source)"
                                class="text-gray-500 hover:text-white"
                                title="Configure Authentication"
                               >
                                 <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2">
                                   <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                                 </svg>
                               </button>
                               <button 
                                @click="toggleSource(source)"
                                class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                                :class="isSourceActive(source) ? 'bg-pink-600 border-pink-600' : 'border-gray-600 hover:border-gray-500'"
                               >
                                  <svg v-if="isSourceActive(source)" viewBox="0 0 24 24" class="w-3 h-3 fill-white" stroke="currentColor" stroke-width="3">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                               </button>
                           </div>
                       </div>
                       <div v-if="editingAuth === source.url" class="bg-gray-800 p-2 rounded mt-2 text-xs space-y-2 border border-gray-700">
                          <p class="text-gray-400">Authentication (Optional)</p>
                          <input v-model="source.userId" placeholder="User ID" class="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white" />
                          <input v-model="source.apiKey" placeholder="API Key" type="password" class="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white" />
                          <div class="flex justify-end mt-2">
                            <button 
                                @click="testAuth(source)" 
                                class="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition-colors"
                                :disabled="isTestingAuth"
                            >
                                <span v-if="isTestingAuth">Testing...</span>
                                <span v-else>Test Connection</span>
                                <Check v-if="authTestResult && authTestResult.url === source.url && authTestResult.success" class="w-3 h-3 text-green-500" />
                                <AlertCircle v-if="authTestResult && authTestResult.url === source.url && !authTestResult.success" class="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                          <p v-if="authTestResult && authTestResult.url === source.url" class="text-xs mt-1" :class="authTestResult.success ? 'text-green-400' : 'text-red-400'">
                              {{ authTestResult.message }}
                          </p>
                       </div>
                   </div>
               </div>
               
               <!-- Custom Sources -->
                <div v-for="(source, idx) in customSources" :key="source.name" class="flex items-center justify-between bg-gray-900 p-2 rounded relative group">
                   <div class="flex items-center gap-2">
                       <span class="text-sm font-medium">{{ source.name }}</span>
                       <span class="text-xs text-gray-500">({{ source.type }})</span>
                   </div>
                   <div class="flex items-center gap-3">
                       <button 
                        @click="toggleSource(source)"
                        class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                        :class="isSourceActive(source) ? 'bg-pink-600 border-pink-600' : 'border-gray-600 hover:border-gray-500'"
                       >
                          <svg v-if="isSourceActive(source)" viewBox="0 0 24 24" class="w-3 h-3 fill-white" stroke="currentColor" stroke-width="3">
                              <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                       </button>
                       <button @click="removeCustomSource(idx)" class="text-gray-500 hover:text-red-500">
                          <X class="h-4 w-4" />
                       </button>
                   </div>
               </div>
           </div>

           <!-- Add Custom Source -->
           <button 
              @click="showAddSource = !showAddSource"
              class="text-xs text-pink-500 hover:text-pink-400 mb-2 block"
           >
              {{ showAddSource ? '- Cancel' : '+ Add Custom Source' }}
           </button>
           
           <div v-if="showAddSource" class="bg-gray-900 p-3 rounded mb-3 space-y-2">
              <input v-model="newSource.name" placeholder="Name (e.g. MyBooru)" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white" />
              <input v-model="newSource.url" placeholder="URL (e.g. https://site.com)" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white" />
              <select v-model="newSource.type" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white">
                  <option value="danbooru">Danbooru Type</option>
                  <option value="gelbooru">Gelbooru Type</option>
                  <option value="moebooru">Moebooru Type</option>
              </select>
              <button @click="addCustomSource" class="w-full bg-pink-600 hover:bg-pink-700 text-white rounded py-1.5 text-xs font-medium">Add Source</button>
           </div>

            <div class="flex justify-between items-center mt-4">
               <span class="text-green-400 text-xs">{{ sourceSaveMessage }}</span>
               <div class="flex gap-2">
                   <button @click="testConnection" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-medium transition">
                      Test Connection
                   </button>
                   <button @click="saveSources" class="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded text-white text-sm font-medium transition">
                      Save Sources
                   </button>
               </div>
           </div>
           
           <!-- Connection Test Results -->
           <div v-if="testResults.length > 0" class="mt-4 p-3 bg-gray-900 rounded border border-gray-700">
               <h4 class="text-sm font-bold text-gray-300 mb-2">Connection Test Results</h4>
               <div v-for="(res, idx) in testResults" :key="idx" class="flex items-start gap-2 mb-1 last:mb-0 text-xs">
                   <Check v-if="res.success" class="text-green-500 w-4 h-4 mt-0.5" />
                   <X v-else class="text-red-500 w-4 h-4 mt-0.5" />
                   <div>
                       <span class="font-bold text-gray-400">{{ res.source }}: </span>
                       <span :class="res.success ? 'text-green-400' : 'text-red-400'">{{ res.message }}</span>
                   </div>
               </div>
           </div>
        </div>
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

import BooruService from '../services/BooruService';
import { DanbooruAdapter, GelbooruAdapter, MoebooruAdapter } from '../services/BooruAdapters';
import { X, Check, AlertCircle } from 'lucide-vue-next';

export default {
  name: 'ProfileSettingsView',
  components: {
    X, Check, AlertCircle
  },
  data() {
    return {
      disableHistory: false,
      debugMode: false,
      showModal: false,
      modalTitle: '',
      modalMessage: '',

      pendingAction: null,
      avoidedTagsInput: '',

      saveMessage: '',

      // Source Management
      predefinedSources: [],
      customSources: [],
      activeSources: [],
      showAddSource: false,
      newSource: { name: '', url: '', type: 'gelbooru' },
      sourceSaveMessage: '',
      editingAuth: null, // Source URL for currently editing auth
      isTestingAuth: false,
      authTestResult: null, // { url: string, success: boolean, message: string }
      testResults: [] // { source: string, success: boolean, message: string }[]
    };
  },
  mounted() {
    const preferences = StorageService.getPreferences();
    this.disableHistory = preferences.disableHistory || false;

    this.debugMode = preferences.debugMode || false;
    
    // Load avoided tags
    if (preferences.avoidedTags && Array.isArray(preferences.avoidedTags)) {
      this.avoidedTagsInput = preferences.avoidedTags.join(' ');
    } else {
      this.avoidedTagsInput = COMMON_TAGS.join(' ');
    }

    // Load Sources
    const defaultSources = [
      { name: 'Danbooru', type: 'danbooru', url: 'https://danbooru.donmai.us' },
      { name: 'Safebooru', type: 'gelbooru', url: 'https://safebooru.org' },
      { name: 'Gelbooru', type: 'gelbooru', url: 'https://gelbooru.com' },
      { name: 'Konachan', type: 'moebooru', url: 'https://konachan.com' },
      { name: 'Yande.re', type: 'moebooru', url: 'https://yande.re' },
    ];
    this.predefinedSources = defaultSources;
    this.customSources = preferences.customSources || [];
    this.activeSources = preferences.activeSources || (preferences.activeSource ? [preferences.activeSource] : [defaultSources[0]]);

    // Load saved credentials for predefined sources
    const sourceConfigs = preferences.sourceConfigs || {};
    this.predefinedSources.forEach(source => {
        if (sourceConfigs[source.url]) {
            source.userId = sourceConfigs[source.url].userId;
            source.apiKey = sourceConfigs[source.url].apiKey;
        }
    });
    
    // Also sync from active sources if something was missed (legacy support)
    this.activeSources.forEach(active => {
        const predefined = this.predefinedSources.find(p => p.url === active.url);
        if (predefined && (!predefined.userId || !predefined.apiKey)) {
             if (active.userId) predefined.userId = active.userId;
             if (active.apiKey) predefined.apiKey = active.apiKey;
        }
    });
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
      this.avoidedTagsInput = uniqueTags.join(' ');
      
      this.saveMessage = 'Settings saved!';
      setTimeout(() => {
        this.saveMessage = '';
      }, 3000);
    },

    // Source Methods
    isSourceActive(source) {
       return this.activeSources.some(s => s.url === source.url);
    },

    toggleSource(source) {
       const index = this.activeSources.findIndex(s => s.url === source.url);
       if (index > -1) {
           // Prevent removing the last source
           if (this.activeSources.length > 1) {
               this.activeSources.splice(index, 1);
           }
       } else {
           this.activeSources.push(source);
       }
    },

    addCustomSource() {
        if (this.newSource.name && this.newSource.url) {
            this.customSources.push({ ...this.newSource, userId: '', apiKey: '' });
            this.newSource = { name: '', url: '', type: 'gelbooru' };
            this.showAddSource = false;
        }
    },
    toggleAuth(source) {
        if (this.editingAuth === source.url) {
            this.editingAuth = null;
        } else {
            this.editingAuth = source.url;
        }
    },

    removeCustomSource(index) {
        const sourceToRemove = this.customSources[index];
        this.customSources.splice(index, 1);
        
        // Also remove from active sources if present
        const activeIndex = this.activeSources.findIndex(s => s.url === sourceToRemove.url);
        if (activeIndex > -1 && this.activeSources.length > 1) {
            this.activeSources.splice(activeIndex, 1);
        }
    },

    async saveSources() {
        const preferences = StorageService.getPreferences();
        
        // Ensure activeSources have updated credentials from predefined/custom inputs
        // (Since we v-model on component data, we just need to make sure activeSources are refreshed with current state)
        // If a predefined source was toggled ON, it's in activeSources. We need to ensure its userId/apiKey are up to date.
        this.activeSources = this.activeSources.map(active => {
             const updatedPredefined = this.predefinedSources.find(p => p.url === active.url);
             const updatedCustom = this.customSources.find(c => c.url === active.url);
             const source = updatedPredefined || updatedCustom || active;
             return { ...active, userId: source.userId, apiKey: source.apiKey };
        });

        // Collect credentials for predefined sources to persist even if inactive
        const sourceConfigs = preferences.sourceConfigs || {};
        this.predefinedSources.forEach(s => {
             if (s.userId || s.apiKey) {
                 sourceConfigs[s.url] = { userId: s.userId, apiKey: s.apiKey };
             }
        });

        StorageService.storePreferences({
             customSources: this.customSources,
             activeSources: this.activeSources,
             sourceConfigs: sourceConfigs
        });

        BooruService.setActiveSources(this.activeSources);
        
        this.sourceSaveMessage = 'Sources saved!';
        setTimeout(() => this.sourceSaveMessage = '', 3000);
    },
    
    async testConnection() {
        this.testResults = [];
        this.testResults = await BooruService.testConnection();
    },
    resetAvoidedTags() {
      this.avoidedTagsInput = COMMON_TAGS.join(' ');
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
          // Force reload to completely reset application state (including App.vue settings)
          window.location.reload();
        }
      );
    },
    async testAuth(source) {
        this.isTestingAuth = true;
        this.authTestResult = null;
        
        try {
            // Create a temporary adapter to test connection
            let adapter;
            const credentials = { userId: source.userId, apiKey: source.apiKey };
            
            if (source.type === 'gelbooru') {
                adapter = new GelbooruAdapter(source.url, credentials);
            } else if (source.type === 'moebooru') {
                adapter = new MoebooruAdapter(source.url); // Moebooru doesn't use this auth style typically
            } else {
                adapter = new DanbooruAdapter(source.url);
            }

            console.log(`Testing connection to ${source.url}...`);
            await adapter.verifyConnection();
            
            this.authTestResult = { 
                 url: source.url, 
                 success: true, 
                 message: `Connected successfully!` 
            };
        } catch (error) {
            console.error('Test connection failed:', error);
            this.authTestResult = { 
                url: source.url, 
                success: false, 
                message: `Failed: ${error.message}` 
            };
        } finally {
            this.isTestingAuth = false;
        }
    },
  },
};
</script> 