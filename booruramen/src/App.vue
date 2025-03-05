<template>
  <div class="min-h-screen bg-black text-white">
    <div class="h-screen relative overflow-hidden">
    
      <!-- Post details sidebar -->
      <div 
        class="absolute top-0 left-0 w-80 h-full bg-transparent backdrop-blur-sm border-r border-gray-700 overflow-y-auto z-20 transition-transform duration-300 ease-in-out"
        :style="{ transform: showPostDetails ? 'translateX(0)' : 'translateX(-100%)' }"
      >
        <div class="p-4">
          <h2 class="text-xl font-bold mb-4">Post Details</h2>
          
          <div class="space-y-4" v-if="currentPost">
            <div>
              <h3 class="text-sm font-medium text-gray-400">ID</h3>
              <p>{{ currentPost.id }}</p>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Uploader</h3>
              <p>{{ currentPost.uploader_name }}</p>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Rating</h3>
              <p class="capitalize">{{ currentPost.rating }}</p>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Score</h3>
              <p>{{ currentPost.score }}</p>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Media Info</h3>
              <p>{{ currentPost.file_ext.toUpperCase() }} - {{ formatFileSize(currentPost.file_size) }}</p>
              <p>{{ currentPost.image_width }}×{{ currentPost.image_height }}</p>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Tags</h3>
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in currentPost.tag_string.split(' ')" 
                  :key="tag"
                  class="bg-gray-700 px-2 py-0.5 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <div v-if="currentPost.tag_string_artist">
              <h3 class="text-sm font-medium text-gray-400">Artist Tags</h3>
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in currentPost.tag_string_artist.split(' ')" 
                  :key="tag"
                  class="bg-pink-900 px-2 py-0.5 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <div v-if="currentPost.tag_string_character">
              <h3 class="text-sm font-medium text-gray-400">Character Tags</h3>
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in currentPost.tag_string_character.split(' ')" 
                  :key="tag"
                  class="bg-green-900 px-2 py-0.5 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <div v-if="currentPost.tag_string_copyright">
              <h3 class="text-sm font-medium text-gray-400">Copyright Tags</h3>
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in currentPost.tag_string_copyright.split(' ')" 
                  :key="tag"
                  class="bg-blue-900 px-2 py-0.5 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <div v-if="currentPost.tag_string_meta">
              <h3 class="text-sm font-medium text-gray-400">Meta Tags</h3>
              <div class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in currentPost.tag_string_meta.split(' ')" 
                  :key="tag"
                  class="bg-purple-900 px-2 py-0.5 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <div>
              <h3 class="text-sm font-medium text-gray-400">Created</h3>
              <p>{{ new Date(currentPost.created_at).toLocaleString() }}</p>
            </div>
            
            <div>
              <a 
                :href="`https://danbooru.donmai.us/posts/${currentPost.id}`" 
                target="_blank" 
                rel="noopener noreferrer"
                class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-2 rounded-md mt-4"
              >
                View in Browser
              </a>
              <button 
                @click="copyPostLink(currentPost)"
                class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-2 rounded-md mt-2 relative"
              >
                {{ linkCopied ? 'Copied!' : 'Copy Link' }}
                <span 
                  v-if="linkCopied" 
                  class="absolute top-0 right-0 bottom-0 left-0 bg-green-600 rounded-md flex items-center justify-center"
                  style="animation: fadeOut 1.5s forwards;"
                >
                  Copied!
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Floating toggle button for post details sidebar -->
      <button 
        @click="togglePostDetails" 
        class="absolute top-4 left-0 z-30 p-2 rounded-r-md bg-black hover:bg-gray-900 transition-all duration-300 ease-in-out"
        :style="{ transform: showPostDetails ? 'translateX(320px)' : 'translateX(0)' }"
      >
        <span class="text-xl font-bold">{{ showPostDetails ? '<<' : '>>' }}</span>
      </button>
      
      <!-- Main content area -->
      <div class="h-full w-full relative overflow-hidden">
        <!-- Post feed -->
        <div class="h-full overflow-y-auto snap-y snap-mandatory" ref="feedContainer">
          <div v-if="loading" class="h-full flex items-center justify-center">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-600"></div>
          </div>
          
          <div v-else-if="posts.length === 0" class="h-full flex items-center justify-center">
            <div class="text-center">
              <p class="text-xl">No posts found</p>
              <p class="text-gray-400 mt-2">Try adjusting your filters</p>
            </div>
          </div>
          
          <div 
            v-for="post in posts" 
            :key="post.id"
            class="h-full w-full snap-start flex items-center justify-center relative"
          >
            <!-- Post media -->
            <div class="relative max-h-full max-w-full">
              <img 
                v-if="getFileExtension(post) === 'jpg' || getFileExtension(post) === 'jpeg' || getFileExtension(post) === 'png' || getFileExtension(post) === 'gif'" 
                :src="post.file_url" 
                :alt="post.tags" 
                class="max-h-[calc(100vh-0px)] max-w-full object-contain"
              />
              <video 
                v-else-if="getFileExtension(post) === 'mp4' || getFileExtension(post) === 'webm' || isVideoPost(post)" 
                :src="post.file_url" 
                controls 
                autoplay 
                loop 
                muted 
                class="max-h-[calc(100vh-0px)] max-w-full"
              ></video>
              <div 
                v-else
                class="flex items-center justify-center bg-gray-900 p-4 rounded"
              >
                <p>Unable to display media. <a :href="post.file_url" target="_blank" class="text-pink-500 underline">Open directly</a></p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Floating post action buttons - fixed position instead of per-post -->
        <div class="fixed right-4 bottom-24 flex flex-col items-center gap-4 z-30" v-if="currentPost">
          <button 
            @click="toggleLike(currentPost)"
            class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-pink-600 transition-colors backdrop-blur-sm"
            :class="{ 'bg-pink-600': currentPost.liked }"
          >
            <Heart :fill="currentPost.liked ? 'currentColor' : 'none'" class="h-6 w-6" />
          </button>
          
          <button 
            @click="toggleDislike(currentPost)"
            class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-gray-900 transition-colors backdrop-blur-sm"
            :class="{ 'bg-gray-700': currentPost.disliked }"
          >
            <ThumbsDown :fill="currentPost.disliked ? 'currentColor' : 'none'" class="h-6 w-6" />
          </button>
          
          <button 
            @click="toggleFavorite(currentPost)"
            class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-yellow-600 transition-colors backdrop-blur-sm"
            :class="{ 'bg-yellow-600': currentPost.favorited }"
          >
            <Star :fill="currentPost.favorited ? 'currentColor' : 'none'" class="h-6 w-6" />
          </button>
        </div>
      </div>

      <!-- Settings sidebar -->
      <div 
        class="absolute top-0 right-0 w-80 h-full bg-transparent backdrop-blur-sm border-l border-gray-700 overflow-y-auto z-20 transition-transform duration-300 ease-in-out"
        :style="{ transform: showSettingsSidebar ? 'translateX(0)' : 'translateX(100%)' }"
      >
      <div class="p-4">
          <h2 class="text-xl font-bold mb-4">Settings</h2>
          
          <!-- Auto-scroll toggle -->
          <div class="mb-4">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">Auto-scroll</label>
              <button 
                @click="settings.autoScroll = !settings.autoScroll" 
                class="relative inline-flex h-6 w-11 items-center rounded-full"
                :class="settings.autoScroll ? 'bg-pink-600' : 'bg-gray-600'"
              >
                <span 
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                  :class="settings.autoScroll ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>
            <div class="mt-2">
              <label class="text-sm text-gray-400 block mb-1">Seconds between scrolls</label>
              <input 
                v-model.number="settings.autoScrollSeconds" 
                type="number" 
                min="1" 
                max="60"
                class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-600"
              />
            </div>
          </div>

          <!-- Disable scroll animation toggle -->
          <div class="mb-4">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">Disable auto-scroll animation</label>
              <button 
                @click="settings.disableScrollAnimation = !settings.disableScrollAnimation" 
                class="relative inline-flex h-6 w-11 items-center rounded-full"
                :class="settings.disableScrollAnimation ? 'bg-pink-600' : 'bg-gray-600'"
              >
                <span 
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                  :class="settings.disableScrollAnimation ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>
          </div>
          
          <!-- Media type selection -->
          <div class="mb-4">
            <label class="text-sm font-medium block mb-2">Media Type</label>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-sm">Images</label>
                <button 
                  @click="settings.mediaType.images = !settings.mediaType.images" 
                  class="relative inline-flex h-6 w-11 items-center rounded-full"
                  :class="settings.mediaType.images ? 'bg-pink-600' : 'bg-gray-600'"
                >
                  <span 
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                    :class="settings.mediaType.images ? 'translate-x-6' : 'translate-x-1'"
                  ></span>
                </button>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm">Videos</label>
                <button 
                  @click="settings.mediaType.videos = !settings.mediaType.videos" 
                  class="relative inline-flex h-6 w-11 items-center rounded-full"
                  :class="settings.mediaType.videos ? 'bg-pink-600' : 'bg-gray-600'"
                >
                  <span 
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                    :class="settings.mediaType.videos ? 'translate-x-6' : 'translate-x-1'"
                  ></span>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Rating selection -->
          <div class="mb-4">
            <label class="text-sm font-medium block mb-2">Rating</label>
            <div class="space-y-2">
              <div v-for="rating in ['general', 'sensitive', 'questionable', 'explicit']" :key="rating" class="flex items-center justify-between">
                <label class="text-sm capitalize">{{ rating }}</label>
                <button 
                  @click="toggleRating(rating)" 
                  class="relative inline-flex h-6 w-11 items-center rounded-full"
                  :class="settings.ratings.includes(rating) ? 'bg-pink-600' : 'bg-gray-600'"
                >
                  <span 
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                    :class="settings.ratings.includes(rating) ? 'translate-x-6' : 'translate-x-1'"
                  ></span>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Tag management -->
          <div class="mb-4">
            <label class="text-sm font-medium block mb-2">Whitelist Tags</label>
            <div class="flex mb-2">
              <input 
                v-model="newWhitelistTag" 
                @keyup.enter="addWhitelistTag"
                type="text" 
                placeholder="Add tag..." 
                class="flex-1 bg-gray-700 border border-gray-600 rounded-l px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-600"
              />
              <button 
                @click="addWhitelistTag" 
                class="bg-pink-600 px-3 py-1.5 rounded-r text-sm"
              >
                Add
              </button>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              <div 
                v-for="(tag, index) in settings.whitelistTags" 
                :key="index"
                class="bg-gray-700 px-2 py-1 rounded text-xs flex items-center"
              >
                {{ tag }}
                <button @click="removeWhitelistTag(index)" class="ml-1.5 text-gray-400 hover:text-white">
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          
          <div class="mb-4">
            <label class="text-sm font-medium block mb-2">Blacklist Tags</label>
            <div class="flex mb-2">
              <input 
                v-model="newBlacklistTag" 
                @keyup.enter="addBlacklistTag"
                type="text" 
                placeholder="Add tag..." 
                class="flex-1 bg-gray-700 border border-gray-600 rounded-l px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-600"
              />
              <button 
                @click="addBlacklistTag" 
                class="bg-pink-600 px-3 py-1.5 rounded-r text-sm"
              >
                Add
              </button>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              <div 
                v-for="(tag, index) in settings.blacklistTags" 
                :key="index"
                class="bg-gray-700 px-2 py-1 rounded text-xs flex items-center"
              >
                {{ tag }}
                <button @click="removeBlacklistTag(index)" class="ml-1.5 text-gray-400 hover:text-white">
                  <X class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          
          <!-- Recommendations section - Added from recommendation-ui.html -->
          <div class="mb-4 border-t border-gray-700 pt-4">
            <h3 class="text-sm font-medium block mb-2">Recommendations</h3>
            
            <!-- Explore Mode Toggle -->
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm">Explore Mode</label>
              <button 
                @click="toggleExploreMode" 
                class="relative inline-flex h-6 w-11 items-center rounded-full"
                :class="exploreMode ? 'bg-pink-600' : 'bg-gray-600'"
              >
                <span 
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                  :class="exploreMode ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>
            </div>
            <p class="text-xs text-gray-400 mb-3">Explore mode shows more diverse content to help improve recommendations</p>
            
            <!-- Recommended Tags Section -->
            <div v-if="hasRecommendations" class="mb-3">
              <h4 class="text-xs font-medium text-gray-400 mb-1">Recommended Tags</h4>
              <div class="flex flex-wrap gap-1">
                <span 
                  v-for="tag in recommendedTags" 
                  :key="tag"
                  class="bg-pink-800 px-2 py-0.5 rounded text-xs inline-flex items-center"
                >
                  {{ tag }}
                  <button 
                    @click="settings.whitelistTags.push(tag); newWhitelistTag = ''" 
                    class="ml-1 text-xs hover:text-white"
                  >
                    + Add
                  </button>
                </span>
              </div>
              <p v-if="recommendedTags.length === 0" class="text-xs text-gray-400">
                Interact with more posts to get recommendations
              </p>
            </div>
            
            <!-- Recommendation Status -->
            <div class="text-xs text-gray-400 mb-2">
              <p v-if="hasRecommendations">Recommendations active</p>
              <p v-else>Recommendations will activate after more interactions</p>
            </div>
            
            <!-- Reset Recommendations Button -->
            <button 
              @click="recommendationSystem.updateUserProfile(); posts = []; settings.page = 1; fetchPosts()" 
              class="w-full bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded-md text-xs"
            >
              Reset Recommendations
            </button>
          </div>
          
          <button 
            @click="applySettings" 
            class="w-full bg-pink-600 hover:bg-pink-700 text-white py-2 rounded-md mt-4"
          >
            Apply Settings
          </button>
        </div>
      </div>
      
      <!-- Floating toggle button for settings sidebar -->
      <button 
        @click="showSettingsSidebar = !showSettingsSidebar" 
        class="absolute top-4 right-0 z-30 p-2 rounded-l-md bg-black hover:bg-gray-900 transition-all duration-300 ease-in-out"
        :style="{ transform: showSettingsSidebar ? 'translateX(-320px)' : 'translateX(0)' }"
      >
        <Settings class="h-6 w-6" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, onUnmounted } from 'vue';
import { Heart, ThumbsDown, Star, Settings, X } from 'lucide-vue-next';
import StorageService from './services/StorageService';
import recommendationSystem from './services/RecommendationSystem';

// State
const posts = ref([]);
const loading = ref(true);
const showSettingsSidebar = ref(false);
const showPostDetails = ref(false);
const currentPostIndex = ref(0);
const feedContainer = ref(null);
const newWhitelistTag = ref('');
const newBlacklistTag = ref('');
const linkCopied = ref(false);

const exploreMode = ref(false);
const viewStartTime = ref(null);
const hasRecommendations = ref(false);

// Settings
const settings = reactive({
  autoScroll: false,
  autoScrollSeconds: 5,
  mediaType: { images: true, videos: true },
  ratings: ['general'],
  whitelistTags: [],
  blacklistTags: [],
  autoScrollInterval: null,
  page: 1,
  disableScrollAnimation: false
});

// Computed
const currentPost = computed(() => {
  return posts.value[currentPostIndex.value] || null;
});
const recommendedTags = computed(() => {
  return recommendationSystem.getRecommendedTags(3);
});

// Add this mapping function right after the computed properties
// This maps between abbreviated rating codes and full rating names
const getRatingFromCode = (ratingCode) => {
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
};

// Update the isValidPost function to normalize ratings
const normalizePostRating = (post) => {
  if (post && post.rating) {
    post.rating = getRatingFromCode(post.rating);
  }
  return post;
};

// Add this helper function back for explore mode
const buildQueryFilters = (baseQuery = '') => {
  let tagsQuery = baseQuery ? [baseQuery] : [];
  
  // Add rating filters
  if (settings.ratings.length > 0 && settings.ratings.length < 4) {
    const ratingQuery = settings.ratings.map(r => `rating:${r}`).join(' OR ');
    tagsQuery.push(`(${ratingQuery})`);
  }
  
  // Add blacklist tags
  if (settings.blacklistTags.length > 0) {
    const blacklistQuery = settings.blacklistTags.map(tag => `-${tag}`).join(' ');
    tagsQuery.push(blacklistQuery);
  }
  
  // Handle media type filtering
  const showImages = settings.mediaType.images;
  const showVideos = settings.mediaType.videos;
  
  if (!showImages && showVideos) {
    tagsQuery.push('animated');
  } else if (showImages && !showVideos) {
    tagsQuery.push('-animated');
  } else if (!showImages && !showVideos) {
    tagsQuery.push('impossible_tag_to_ensure_no_results');
  }
  
  return tagsQuery.join(' ');
};

/**
 * Check if a post is valid for display (has viewable media)
 */
const isValidPost = (post) => {
  // Only basic checks - don't be too restrictive
  if (!post || !post.file_url) {
    return false;
  }

  // If file_ext is missing, try to infer it from URL
  if (!post.file_ext && post.file_url) {
    const urlParts = post.file_url.split('.');
    if (urlParts.length > 1) {
      post.file_ext = urlParts[urlParts.length - 1].toLowerCase();
    }
  }
  
  // Ensure the post has a file_url that doesn't contain banned or restricted indicators
  if (post.file_url.includes('banned') || post.file_url.includes('download_warning')) {
    return false;
  }

  return true;
};

/**
 * More reliably detect if a post contains video content
 */
const isVideoPost = (post) => {
  // Check file_ext if available
  if (post.file_ext && ['mp4', 'webm'].includes(post.file_ext.toLowerCase())) {
    return true;
  }
  
  // Check URL for video extensions
  if (post.file_url && (post.file_url.toLowerCase().includes('.mp4') || 
                       post.file_url.toLowerCase().includes('.webm'))) {
    return true;
  }
  
  // Check if tag_string contains animated tag
  if (post.tag_string && post.tag_string.includes('animated')) {
    // Additional check to ensure it's a video and not a gif
    if (!post.file_url?.toLowerCase().includes('.gif')) {
      return true;
    }
  }
  
  return false;
};

/**
 * Get file extension reliably for a post
 */
const getFileExtension = (post) => {
  // Use the post's file_ext if available
  if (post.file_ext) {
    return post.file_ext.toLowerCase();
  }
  
  // Otherwise try to extract from URL
  if (post.file_url) {
    const urlParts = post.file_url.split('.');
    if (urlParts.length > 1) {
      return urlParts[urlParts.length - 1].toLowerCase();
    }
  }
  
  // Fallback to empty string if we can't determine
  return '';
};

const fetchPosts = async () => {
  loading.value = true;
  console.log('Fetching posts with settings:', {
    exploreMode: exploreMode.value,
    mediaType: settings.mediaType,
    ratings: settings.ratings,
    whitelistTags: settings.whitelistTags,
    blacklistTags: settings.blacklistTags,
    page: settings.page
  });
  
  try {
    if (exploreMode.value) {
      // Use the curated explore feed when in explore mode
      const fetchFunction = async (queryParams, limit) => {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        
        // Check if we're in emergency mode (meaning we should try all ratings)
        const isEmergencyMode = queryParams._emergencyMode === true;
        if (isEmergencyMode) {
          console.log("🚨 EMERGENCY MODE: Will try using all available ratings");
          // Don't set any rating parameter to get all content
        } 
        else {
          // Normal mode - Build the query for tags that count toward the 2-tag limit
          let tags = [];
          
          // When videos-only mode is active, we must include 'animated' tag
          const needsAnimatedTag = !settings.mediaType.images && settings.mediaType.videos;
          
          // Priority 1: For videos-only mode, the animated tag is essential
          if (needsAnimatedTag) {
            tags.push('animated');
          }
          
          // Priority 2: Content tag from recommendation system or whitelist
          if (queryParams.tags && tags.length < 2) {
            // Take first tag from recommendation system query
            const recTags = queryParams.tags.split(' ');
            if (recTags.length > 0 && recTags[0]) {
              // Add the first tag from recommendation system
              tags.push(recTags[0]);
              
              // Check if the recommendation included an order parameter and keep it
              const hasOrderParam = recTags.some(tag => tag.startsWith('order:'));
              
              // Add additional order parameter if it exists in the recommendation
              if (hasOrderParam && tags.length < 2) {
                const orderParam = recTags.find(tag => tag.startsWith('order:'));
                if (orderParam && !tags.includes(orderParam)) {
                  tags.push(orderParam);
                }
              }
            }
          } else if (settings.whitelistTags.length > 0 && tags.length < 2) {
            // Use whitelist tag if no recommendation
            tags.push(settings.whitelistTags[0]);
          }
          
          // Priority 3: Add order parameter if we have room and no other order tag exists
          if (tags.length < 2 && !tags.some(tag => tag.startsWith('order:'))) {
            tags.push('order:score'); // Use score instead of random to avoid timeouts
          }
          
          // CRITICAL: Handle rating filtering using combined format (doesn't count toward tag limit)
          if (settings.ratings.length > 0) {
            // Map rating full names to their single-letter codes for the API
            const ratingCodes = settings.ratings.map(rating => {
              switch(rating) {
                case 'general': return 'g';
                case 'sensitive': return 's';
                case 'questionable': return 'q';
                case 'explicit': return 'e';
                default: return rating.charAt(0).toLowerCase(); // fallback
              }
            });
            
            // Create the combined rating parameter
            const ratingParam = `rating:${ratingCodes.join(',')}`;
            
            // Remove any existing rating tags to avoid conflicts
            tags = tags.filter(tag => !tag.startsWith('rating:'));
            
            // Add the combined rating parameter (doesn't count toward the 2-tag limit)
            tags.push(ratingParam);
            console.log(`Added combined rating parameter: ${ratingParam}`);
          } else if (settings.ratings.length === 0) {
            // No ratings selected, default to general
            const defaultRatingTag = 'rating:general';
            if (!tags.includes(defaultRatingTag)) {
              tags.push(defaultRatingTag);
            }
            console.log("No ratings selected, defaulting to general rating tag");
          }
          
          // Set the tags query
          params.append('tags', tags.join(' '));
          console.log('Explore mode final query:', params.toString());
        }
        
        try {
          const response = await fetch(`https://danbooru.donmai.us/posts.json?${params.toString()}`);
          const data = await response.json();
          
          if (!Array.isArray(data)) {
            console.error('API error:', data);
            return [];
          }
          
          console.log(`Fetched ${data.length} posts before filtering`);
          
          // Log the first post to help diagnose issues
          if (data.length > 0) {
            const sample = data[0];
            console.log('Sample post:', {
              id: sample.id,
              file_url: sample.file_url?.substring(0, 50) + '...',
              file_ext: sample.file_ext,
              tag_string: sample.tag_string?.substring(0, 50) + '...',
              rating: sample.rating,
              ratings_enabled: settings.ratings,
              is_video: isVideoPost(sample)
            });
          }
          
          // Filter posts client-side based on user settings
          const filteredPosts = data.filter(post => {
            // Basic validation first
            if (!isValidPost(post)) {
              return false;
            }
            
            // Normalize the post rating to handle both short and long formats
            post.rating = getRatingFromCode(post.rating);
            
            // Apply media type filter
            if (settings.mediaType.images && !settings.mediaType.videos) {
              // Images only - make sure it's not a video
              if (isVideoPost(post)) return false;
            } else if (!settings.mediaType.images && settings.mediaType.videos) {
              // Videos only - must be a video
              if (!isVideoPost(post)) return false;
            } else if (!settings.mediaType.images && !settings.mediaType.videos) {
              // Neither enabled
              return false;
            }
            
            // Apply rating filter based on user settings WITH EMERGENCY MODE BYPASS
            if (!isEmergencyMode && settings.ratings.length > 0) {
              // Handle both full names and abbreviated codes
              const normalizedSettingRatings = settings.ratings.map(r => getRatingFromCode(r));
              
              if (!normalizedSettingRatings.includes(post.rating)) {
                console.log(`Filtering out post #${post.id} due to rating: ${post.rating} not in [${settings.ratings.join(', ')}]`);
                return false;
              }
            } else if (isEmergencyMode) {
              // In emergency mode, we bypass the rating filter but log it
              const normalizedSettingRatings = settings.ratings.map(r => getRatingFromCode(r));
              if (!normalizedSettingRatings.includes(post.rating)) {
                console.log(`⚠️ Emergency mode: Including post #${post.id} with rating ${post.rating} despite user settings`);
              }
            }
            
            // Apply blacklist filter
            if (settings.blacklistTags.some(tag => post.tag_string?.includes(tag))) {
              console.log(`Filtering out post #${post.id} due to blacklisted tag`);
              return false;
            }
            
            // Post passed all filters
            return true;
          });
          
          console.log(`After filtering: ${filteredPosts.length} posts`);
          
          // If we've filtered out all posts but the original data had posts,
          // suggest to the user to adjust their rating filters
          if (filteredPosts.length === 0 && data.length > 0) {
            // Log what ratings were available in the results
            const availableRatings = [...new Set(data.map(post => post.rating))];
            console.log(`Available ratings in results: ${availableRatings.join(', ')}`);
            console.log("Consider updating rating filters in settings to see more content");
            
            // In emergency mode, try again with a different approach
            if (isEmergencyMode) {
              // If no posts passed filters in emergency mode, something else is wrong
              // Let's try to return at least some content by ignoring all filters
              console.log("🔥 CRITICAL: All filters failed. Returning original unfiltered content.");
              return data.slice(0, Math.min(data.length, 10)); // Return up to 10 unfiltered posts
            }
          }
          
          return filteredPosts;
        } catch (error) {
          console.error('Error fetching posts:', error);
          return [];
        }
      };

      const curatedPosts = await recommendationSystem.getCuratedExploreFeed(fetchFunction, {
        fetchCount: 5, // Increased for better chances of finding videos
        postsPerFetch: 20,
        maxTotal: 50,
        selectedRatings: settings.ratings // Pass the user's selected ratings
      });
      
      console.log(`Got ${curatedPosts.length} curated posts from recommendation system`);

      // Process valid posts
      const newPosts = curatedPosts.map(post => ({
        ...post,
        liked: false,
        disliked: false,
        favorited: false
      }));

      // Replace existing posts in explore mode
      posts.value = newPosts;
      currentPostIndex.value = 0;
      
      // If no posts were found in explore mode with video filter, try a direct query
      if (newPosts.length === 0 && !settings.mediaType.images && settings.mediaType.videos) {
        console.log('No videos found in curated feed, trying direct video query...');
        
        // Make a direct query for videos
        const params = new URLSearchParams();
        
        // *** CRITICAL CHANGE: Construct query with both video and rating requirements ***
        const tags = ['animated'];
        
        // Always append tags parameter
        params.append('tags', tags.join(' '));
        params.append('limit', '20');
        
        // If only one rating is selected, use the dedicated rating parameter
        if (settings.ratings.length === 1) {
          params.append('rating', settings.ratings[0]);
        }
        
        console.log('Direct video query:', params.toString());
        
        try {
          const response = await fetch(`https://danbooru.donmai.us/posts.json?${params.toString()}`);
          const data = await response.json();
          
          if (Array.isArray(data)) {
            // Filter for actual videos and apply rating filter
            const videoOnly = data.filter(post => {
              // Normalize rating
              post.rating = getRatingFromCode(post.rating);
              
              return isVideoPost(post) && 
                isValidPost(post) &&
                (settings.ratings.length === 0 || 
                  settings.ratings.map(r => getRatingFromCode(r)).includes(post.rating));
            });
            
            if (videoOnly.length > 0) {
              console.log(`Found ${videoOnly.length} videos with direct query`);
              posts.value = videoOnly.map(post => ({
                ...post,
                liked: false,
                disliked: false,
                favorited: false
              }));
            }
          }
        } catch (error) {
          console.error('Error in direct video query:', error);
        }
      }
      
    } else {
      // Regular post fetching logic for non-explore mode
      const allNewPosts = [];
      const maxFetches = 3; // Maximum number of API calls
      let fetchCount = 0;
      
      // Prioritize different tag combinations
      const queryPriorities = [];
      
      // Priority 1: Whitelist tag + Rating
      if (settings.whitelistTags.length > 0 && settings.ratings.length > 0) {
        queryPriorities.push([settings.whitelistTags[0], `rating:${settings.ratings[0]}`]);
      }
      
      // Priority 2: Just whitelist tag
      if (settings.whitelistTags.length > 0) {
        queryPriorities.push([settings.whitelistTags[0]]);
      }
      
      // Priority 3: Just rating
      if (settings.ratings.length > 0) {
        queryPriorities.push([`rating:${settings.ratings[0]}`]);
      }
      
      // Priority 4: Recommendations if available
      if (hasRecommendations.value) {
        const recommendedTags = recommendationSystem.getRecommendedTags(1);
        if (recommendedTags.length > 0) {
          queryPriorities.push([recommendedTags[0]]);
        }
      }
      
      // Priority 5: Fallback to popular content
      queryPriorities.push(['order:rank']);
      
      // Ensure we have at least one query
      if (queryPriorities.length === 0) {
        queryPriorities.push(['order:popular']);
      }
      
      // Helper function for a single fetch
      const fetchPostsWithTags = async (tags) => {
        console.log('Fetching with tags:', tags);
        const params = new URLSearchParams();
        params.append('limit', '20');
        params.append('page', settings.page.toString());
        
        // For videos only, we need to add animated tag in the query
        if (!settings.mediaType.images && settings.mediaType.videos) {
          // Add 'animated' tag to fetch videos from the server
          if (tags.length < 2) {
            tags = [...tags, 'animated'];
          }
        }
        
        // Handle ratings using the combined format (doesn't count toward tag limit)
        // Convert user's selected ratings to the combined format: rating:g,s,q
        if (settings.ratings.length > 0) {
          // Map rating full names to their single-letter codes for the API
          const ratingCodes = settings.ratings.map(rating => {
            switch(rating) {
              case 'general': return 'g';
              case 'sensitive': return 's';
              case 'questionable': return 'q';
              case 'explicit': return 'e';
              default: return rating.charAt(0).toLowerCase(); // fallback
            }
          });
          
          // Create the combined rating parameter and add it to the query
          const ratingParam = `rating:${ratingCodes.join(',')}`;
          
          // Remove any existing rating tags to avoid conflicts
          tags = tags.filter(tag => !tag.startsWith('rating:'));
          
          // Add the combined rating parameter
          tags.push(ratingParam);
          console.log(`Added combined rating parameter: ${ratingParam}`);
        }
        
        params.append('tags', tags.join(' '));
        
        try {
          const response = await fetch(`https://danbooru.donmai.us/posts.json?${params.toString()}`);
          const data = await response.json();
          
          if (!Array.isArray(data)) {
            console.error('API error:', data);
            return [];
          }
          
          console.log(`Fetched ${data.length} posts for query: ${params.toString()}`);
          
          // Filter client-side for constraints not included in the query
          return data.filter(post => {
            // Determine if post is a video based on file_ext or URL
            const isVideo = (post.file_ext && ['mp4', 'webm'].includes(post.file_ext.toLowerCase())) ||
                            (post.file_url && (post.file_url.toLowerCase().includes('.mp4') || 
                                               post.file_url.toLowerCase().includes('.webm')));
            
            // Apply media type filter
            if (settings.mediaType.images && !settings.mediaType.videos) {
              // Only images
              if (isVideo) return false;
            } else if (!settings.mediaType.images && settings.mediaType.videos) {
              // Only videos
              if (!isVideo) return false;
            } else if (!settings.mediaType.images && !settings.mediaType.videos) {
              // Neither enabled
              return false;
            }
            
            // Filter by blacklist tags
            if (settings.blacklistTags.some(tag => post.tag_string?.includes(tag))) {
              return false;
            }
            
            return isValidPost(post);
          });
        } catch (error) {
          console.error('Error fetching posts:', error);
          return [];
        }
      };
      
      // Try each query priority until we get enough posts or reach max fetches
      for (const tags of queryPriorities) {
        if (fetchCount >= maxFetches || allNewPosts.length >= 40) break;
        
        const fetchedPosts = await fetchPostsWithTags(tags);
        
        if (fetchedPosts.length > 0) {
          allNewPosts.push(...fetchedPosts);
          fetchCount++;
        }
      }
      
      console.log(`Total posts fetched: ${allNewPosts.length}`);
      
      // Process all fetched posts
      const uniquePosts = Array.from(
        new Map(allNewPosts.map(post => [post.id, post])).values()
      );
      
      // Map to view model with interaction states
      const newPosts = uniquePosts.map(post => ({
        ...post,
        liked: false,
        disliked: false,
        favorited: false
      }));
      
      // Replace or append to existing posts
      if (settings.page === 1) {
        posts.value = newPosts;
        currentPostIndex.value = 0;
      } else {
        posts.value = [...posts.value, ...newPosts];
      }
      
      // Increment page for next fetch
      if (allNewPosts.length > 0) {
        settings.page++;
      }
    }
  } catch (error) {
    console.error('Error in fetchPosts:', error);
  } finally {
    loading.value = false;
  }
};

const toggleLike = (post) => {
  post.liked = !post.liked;
  if (post.liked && post.disliked) {
    post.disliked = false;
  }
  
  // Track this interaction for recommendations
  recommendationSystem.trackInteraction(
    post.id, 
    'like',
    post.liked ? 1 : -1,
    post
  );
};

const toggleDislike = (post) => {
  post.disliked = !post.disliked;
  if (post.disliked && post.liked) {
    post.liked = false;
  }
  
  // Track this interaction for recommendations
  recommendationSystem.trackInteraction(
    post.id, 
    'dislike',
    post.disliked ? 1 : -1,
    post
  );
};

const toggleFavorite = (post) => {
  post.favorited = !post.favorited;
  
  // Track this interaction for recommendations
  recommendationSystem.trackInteraction(
    post.id, 
    'favorite',
    post.favorited ? 1 : -1,
    post,
    true // update immediately since favorites are high-value signals
  );
};

const trackViewTime = () => {
  if (!viewStartTime.value || !currentPost.value) return;
  
  const timeSpent = Date.now() - viewStartTime.value;
  if (timeSpent > 500) { // Only track if spent at least 500ms
    recommendationSystem.trackInteraction(
      currentPost.value.id,
      'timeSpent',
      timeSpent,
      currentPost.value
    );
  }
  
  // Reset timer
  viewStartTime.value = Date.now();
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const toggleRating = (rating) => {
  if (settings.ratings.includes(rating)) {
    settings.ratings = settings.ratings.filter(r => r !== rating);
  } else {
    settings.ratings.push(rating);
  }
};

const addWhitelistTag = () => {
  if (newWhitelistTag.value.trim() && !settings.whitelistTags.includes(newWhitelistTag.value.trim())) {
    if (settings.whitelistTags.length >= 2) {
      // Remove the oldest tag if we're at the limit
      settings.whitelistTags.shift();
    }
    settings.whitelistTags.push(newWhitelistTag.value.trim());
    newWhitelistTag.value = '';
  }
};

const removeWhitelistTag = (index) => {
  settings.whitelistTags.splice(index, 1);
};

const addBlacklistTag = () => {
  if (newBlacklistTag.value.trim() && !settings.blacklistTags.includes(newBlacklistTag.value.trim())) {
    settings.blacklistTags.push(newBlacklistTag.value.trim());
    newBlacklistTag.value = '';
  }
};

const removeBlacklistTag = (index) => {
  settings.blacklistTags.splice(index, 1);
};

const applySettings = () => {
  // Make sure we have at least one rating selected
  if (settings.ratings.length === 0) {
    settings.ratings = ['general'];
  }
  
  // Make sure at least one media type is selected
  if (!settings.mediaType.images && !settings.mediaType.videos) {
    settings.mediaType.images = true;
  }
  
  // REMOVING THE AUTO-ADDITION OF RATINGS FOR VIDEO MODE
  // Only use the ratings explicitly selected by the user
  // This prevents automatically enabling all ratings when only general is selected
  
  // Clear existing posts and fetch with new settings
  posts.value = [];
  settings.page = 1;
  fetchPosts();
  showSettingsSidebar.value = false;
  
  // Handle auto-scroll
  if (settings.autoScroll) {
    startAutoScroll();
  } else {
    stopAutoScroll();
  }
};

const startAutoScroll = () => {
  if (settings.autoScrollInterval) {
    clearInterval(settings.autoScrollInterval);
  }
  
  const intervalMs = Math.max(1, settings.autoScrollSeconds) * 1000;
  
  settings.autoScrollInterval = setInterval(() => {
    if (currentPostIndex.value < posts.value.length - 1) {
      currentPostIndex.value++;
      scrollToCurrentPost();
    } else {
      // Load more posts when reaching the end
      fetchPosts();
    }
  }, intervalMs);
};

const stopAutoScroll = () => {
  if (settings.autoScrollInterval) {
    clearInterval(settings.autoScrollInterval);
    settings.autoScrollInterval = null;
  }
};

const scrollToCurrentPost = () => {
  const postElements = feedContainer.value.querySelectorAll('.snap-start');
  if (postElements[currentPostIndex.value]) {
    postElements[currentPostIndex.value].scrollIntoView({ 
      behavior: settings.disableScrollAnimation ? 'auto' : 'smooth' 
    });
  }
};

// Navigate to previous post
const prevPost = () => {
  if (currentPostIndex.value > 0) {
    currentPostIndex.value--;
    scrollToCurrentPost();
  }
};

// Navigate to next post
const nextPost = () => {
  if (currentPostIndex.value < posts.value.length - 1) {
    currentPostIndex.value++;
    scrollToCurrentPost();
  } else if (!loading.value) {
    // If we're at the end, try to fetch more posts
    fetchPosts();
  }
};

// Handle scroll events to update current post index
const handleScroll = () => {
  if (!feedContainer.value) return;
  
  const containerHeight = feedContainer.value.clientHeight;
  const scrollTop = feedContainer.value.scrollTop;
  const postIndex = Math.round(scrollTop / containerHeight);
  
  if (postIndex !== currentPostIndex.value && postIndex >= 0 && postIndex < posts.value.length) {
    // Track time spent on previous post before changing
    trackViewTime();
    
    // Update the current post index
    currentPostIndex.value = postIndex;
    
    // Start timing for new post
    viewStartTime.value = Date.now();
    
    // Track view of the new post
    if (currentPost.value) {
      recommendationSystem.trackInteraction(
        currentPost.value.id,
        'view',
        1,
        currentPost.value
      );
    }
  }
  
  // Load more posts when approaching the end
  if (posts.value.length - currentPostIndex.value < 5 && !loading.value) {
    fetchPosts();
  }
};

const toggleExploreMode = () => {
  exploreMode.value = !exploreMode.value;
  
  // Refresh posts with new mode
  posts.value = [];
  settings.page = 1;
  fetchPosts();
};

// Handle keyboard navigation
const handleKeyDown = (event) => {
  if (event.key === 'ArrowDown' || event.key === 'j') {
    nextPost();
  } else if (event.key === 'ArrowUp' || event.key === 'k') {
    prevPost();
  } else if (event.key === 'f') {
    toggleFavorite(currentPost.value);
  } else if (event.key === 'l') {
    toggleLike(currentPost.value);
  } else if (event.key === 'd') {
    toggleDislike(currentPost.value);
  }
};

// Toggle post details sidebar
const togglePostDetails = () => {
  showPostDetails.value = !showPostDetails.value;
};

const copyPostLink = (post) => {
  const url = `https://danbooru.donmai.us/posts/${post.id}`;
  
  // Check if the Clipboard API is available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => {
        linkCopied.value = true;
        setTimeout(() => {
          linkCopied.value = false;
        }, 1500);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        fallbackCopyTextToClipboard(url);
      });
  } else {
    // Fallback for browsers without clipboard API
    fallbackCopyTextToClipboard(url);
  }
};

// Fallback method to copy text to clipboard
const fallbackCopyTextToClipboard = (text) => {
  try {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make the textarea out of viewport
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    // Select and copy the text
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      linkCopied.value = true;
      setTimeout(() => {
        linkCopied.value = false;
      }, 1500);
    } else {
      console.error('Fallback: Could not copy text');
    }
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }
};

// Lifecycle hooks
onMounted(() => {
  fetchPosts();
  
  if (feedContainer.value) {
    feedContainer.value.addEventListener('scroll', handleScroll);
  }
  
  // Add keyboard event listener
  document.addEventListener('keydown', handleKeyDown);
  
  // Initialize view start time
  viewStartTime.value = Date.now();
  
  // Check if we have enough interactions to enable recommendations
  setTimeout(() => {
    const interactions = StorageService.getInteractions();
    hasRecommendations.value = interactions.length > 5;
    
    // Force user profile update
    recommendationSystem.updateUserProfile();
  }, 500);
});

// Clean up
watch(() => settings.autoScroll, (newValue) => {
  if (newValue) {
    startAutoScroll();
  } else {
    stopAutoScroll();
  }
});

// Clean up event listeners on component unmount
onUnmounted(() => {
  // Track the final view time before leaving
  trackViewTime();
  
  if (feedContainer.value) {
    feedContainer.value.removeEventListener('scroll', handleScroll);
  }
  document.removeEventListener('keydown', handleKeyDown);
  stopAutoScroll();
});
</script>

<style>
/* Add these rules to hide scrollbars while maintaining functionality */
* {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

*::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}

/* Remove the existing scrollbar styles */
::-webkit-scrollbar,
::-webkit-scrollbar-track,
::-webkit-scrollbar-thumb,
::-webkit-scrollbar-thumb:hover {
  display: none;
  width: 0;
  background: transparent;
}

/* Keep the backdrop-blur-sm style */
.backdrop-blur-sm {
  background-color: rgba(0, 0, 0, 0.5) !important;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

@keyframes fadeOut {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

/* Add a subtle animation for the action buttons */
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* Apply the animation to the fixed buttons */
.fixed.right-4.bottom-24 button {
  animation: fadeIn 0.3s ease-out forwards;
}

/* Stagger the animations for each button */
.fixed.right-4.bottom-24 button:nth-child(1) {
  animation-delay: 0s;
}
.fixed.right-4.bottom-24 button:nth-child(2) {
  animation-delay: 0.1s;
}
.fixed.right-4.bottom-24 button:nth-child(3) {
  animation-delay: 0.2s;
}
</style>

