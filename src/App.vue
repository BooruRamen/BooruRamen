<template>
  <div class="min-h-screen bg-black text-white">
    <div class="h-screen relative overflow-hidden">
    
      <!-- Post details sidebar -->
      <div 
        class="absolute top-0 left-0 w-80 h-full bg-transparent backdrop-blur-sm border-r border-gray-700 overflow-y-auto z-50 transition-transform duration-300 ease-in-out"
        :style="{ transform: showPostDetails ? 'translateX(0)' : 'translateX(-100%)' }"
      >
        <div class="p-4 pb-20">
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
              <p class="capitalize">{{ getRatingFromCode(currentPost.rating) }}</p>
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
        v-if="currentPost"
        @click="togglePostDetails" 
        class="absolute top-4 left-0 z-30 p-2 rounded-r-md bg-black hover:bg-gray-900 transition-all duration-300 ease-in-out"
        :style="{ transform: showPostDetails ? 'translateX(320px)' : 'translateX(0)' }"
      >
        <span class="text-xl font-bold">{{ showPostDetails ? '<<' : '>>' }}</span>
      </button>
      
      <!-- Main content area -->
      <div class="h-full w-full relative overflow-hidden pb-14">
        <router-view 
          :key="routerViewKey"
          @current-post-changed="updateCurrentPost"
          @video-state-change="handleVideoStateChange"
          :auto-scroll="settings.autoScroll"
          :auto-scroll-seconds="settings.autoScrollSeconds"
          :disable-scroll-animation="settings.disableScrollAnimation"
        ></router-view>
      </div>
        
      <!-- Custom Video Controls -->
      <div 
        v-if="isCurrentPostVideo && currentPost" 
        class="fixed bottom-14 left-0 right-0 bg-black bg-opacity-60 backdrop-blur-sm py-2 px-4 flex items-center gap-4 transition-opacity duration-300 z-40"
        :class="{ 'opacity-0': !showVideoControls && !isVideoControlsHovered, 'opacity-100': showVideoControls || isVideoControlsHovered }"
        @mouseenter="isVideoControlsHovered = true"
        @mouseleave="isVideoControlsHovered = false"
      >
        <button @click="togglePlayPause" class="text-white p-2 w-8 h-8 flex items-center justify-center">
          <svg v-if="isPlaying" viewBox="0 0 24 24" class="w-6 h-6 fill-white">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="w-6 h-6 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        
        <!-- Progress bar - Updated with drag functionality -->
        <div class="flex-grow relative h-2 bg-gray-700 rounded cursor-pointer" 
          @click="seekVideo"
          @mousedown="startProgressDrag"
          ref="progressBar">
          <div 
            class="absolute top-0 left-0 h-full bg-pink-600 rounded transition-[width]" 
            :class="{ 'transition-none': isProgressDragging }"
            :style="{ width: `${videoProgress}%` }"
          ></div>
        </div>
        
        <!-- Volume control section - Modified for better hover behavior -->
        <div class="flex items-center group relative">
          <!-- Improved hover area for volume slider -->
          <div 
            class="absolute bottom-full w-8 h-28 group-hover:block cursor-pointer"
            style="left: 50%; transform: translateX(-50%);"
            @mouseenter="isVolumeSliderHovered = true"
            @mouseleave="isVolumeSliderHovered = false"
          >
            <!-- Vertical volume slider - positioned above the mute button -->
            <div 
              class="absolute bottom-2 left-1/2 transform -translate-x-1/2 h-24 w-2 bg-gray-700 rounded cursor-pointer"
              :class="{ 'hidden': !isVolumeSliderHovered && !isVolumeHovered }"
              @mousedown="startVolumeChange"
              @click="changeVolumeVertical"
              ref="volumeSlider"
            >
              <div 
                class="absolute bottom-0 left-0 w-full bg-pink-600 rounded" 
                :style="{ height: `${volumeLevel * 100}%` }"
              ></div>
            </div>
          </div>
          
          <!-- Mute button with improved hover behavior -->
          <button 
            @click="toggleMute" 
            @mouseenter="isVolumeHovered = true"
            @mouseleave="isVolumeHovered = false"
            class="text-white p-2 w-8 h-8 flex items-center justify-center"
          >
            <svg v-if="isMuted || volumeLevel === 0" viewBox="0 0 24 24" class="w-6 h-6 fill-white">
              <path d="M12 4L6 10H2v4h4l6 6z" />
              <line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2" />
            </svg>
            <svg v-else-if="volumeLevel < 0.5" viewBox="0 0 24 24" class="w-6 h-6 fill-white">
              <path d="M12 4L6 10H2v4h4l6 6z" />
              <path d="M15 12c0-1.7-1-3-2-3.5" stroke="white" stroke-width="2" fill="none" />
            </svg>
            <svg v-else viewBox="0 0 24 24" class="w-6 h-6 fill-white">
              <path d="M12 4L6 10H2v4h4l6 6z" />
              <path d="M15 12c0-1.7-1-3-2-3.5" stroke="white" stroke-width="2" fill="none" />
              <path d="M18 8c1 1.5 1.5 3 1.5 4s-.5 2.5-1.5 4" stroke="white" stroke-width="2" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Settings sidebar -->
      <div 
        class="absolute top-0 right-0 w-80 h-full bg-transparent backdrop-blur-sm border-l border-gray-700 overflow-y-auto z-50 transition-transform duration-300 ease-in-out"
        :style="{ transform: showSettingsSidebar ? 'translateX(0)' : 'translateX(100%)' }"
      >
      <div class="p-4 pb-20">
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
      
      <!-- Floating post action buttons - repositioned to appear below sidebar but above content -->
      <div 
        class="fixed right-4 bottom-24 flex flex-col items-center gap-4 z-15" 
        v-if="currentPost"
      >
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
    <BottomNavBar @navigate-feed="navigateToFeed" />
  </div>
</template>

<script>
import { X, Settings, Heart, ThumbsDown, Star } from 'lucide-vue-next';
import StorageService from './services/StorageService.js';
import BottomNavBar from './components/BottomNavBar.vue';

export default {
  name: 'App',
  components: {
    X,
    Settings,
    Heart,
    ThumbsDown,
    Star,
    BottomNavBar,
  },
  data() {
    const savedSettings = StorageService.loadAppSettings();
    const defaultSettings = {
      autoScroll: false,
      autoScrollSeconds: 5,
      autoScrollSpeed: 'medium',
      disableHistory: false,
      mediaType: { images: true, videos: true },
      ratings: ['general', 'sensitive'],
      whitelistTags: [],
      blacklistTags: [],
    };

    return {
      currentPost: null,
      currentVideoElement: null,
      showPostDetails: false,
      linkCopied: false,
      showSettingsSidebar: false,
      settings: savedSettings ? savedSettings.settings : defaultSettings,
      newWhitelistTag: '',
      newBlacklistTag: '',
      exploreMode: savedSettings ? savedSettings.exploreMode : false,
      routerViewKey: 0,
      
      // Video player state
      isPlaying: true,
      videoProgress: 0,
      volumeLevel: 1,
      isMuted: false,
      showVideoControls: true,
      isVideoControlsHovered: false,
      isProgressDragging: false,
      isVolumeSliderHovered: false,
      isVolumeHovered: false,
      
      // Sidebar filter state
      // ... (keep this)
      hasRecommendations: false,
    };
  },
  watch: {
    currentPost(newPost) {
      if (!newPost) {
        this.showPostDetails = false;
      }
    },
    $route(to, from) {
      // Hide post details and video controls when leaving the viewer
      if (to.name !== 'Viewer') {
        this.currentPost = null;
        this.currentVideoElement = null;
      }
    }
  },
  computed: {
    isCurrentPostVideo() {
      if (!this.currentPost) return false;
      const ext = this.currentPost.file_ext;
      return ['mp4', 'webm'].includes(ext);
    },
    // ... (keep other computed properties)
  },
  methods: {
    navigateToFeed() {
      // Prevents navigation if already on the feed with the correct query
      if (this.$route.name === 'Home' && JSON.stringify(this.$route.query) === JSON.stringify(this.generateQueryFromSettings())) {
        return;
      }
      this.$router.push({ name: 'Home', query: this.generateQueryFromSettings() });
    },
    updateCurrentPost(post, videoEl) {
      if (post) {
        const interactions = StorageService.getPostInteractions(post.id);
        post.liked = interactions.some(i => i.type === 'like' && i.value > 0);
        post.disliked = interactions.some(i => i.type === 'dislike' && i.value > 0);
        post.favorited = interactions.some(i => i.type === 'favorite' && i.value > 0);
      }
      this.currentPost = post;
      this.currentVideoElement = videoEl;

      if (videoEl) {
        this.isPlaying = !videoEl.paused;
        this.isMuted = videoEl.muted;
        this.volumeLevel = videoEl.volume;
        if (videoEl.duration > 0) {
            this.videoProgress = (videoEl.currentTime / videoEl.duration) * 100;
        } else {
            this.videoProgress = 0;
        }
      }

      // If we load with a query, sync our settings state to it.
      // this.syncSettingsFromQuery(this.$route.query); // This was causing the bug
    },
    getRatingFromCode(rating) {
      const ratingMap = { 'g': 'General', 's': 'Sensitive', 'q': 'Questionable', 'e': 'Explicit' };
      return ratingMap[rating] || 'Unknown';
    },
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    copyPostLink(post) {
        const url = `https://danbooru.donmai.us/posts/${post.id}`;
        navigator.clipboard.writeText(url).then(() => {
            this.linkCopied = true;
            setTimeout(() => {
                this.linkCopied = false;
            }, 1500);
        });
    },
    togglePostDetails() {
      this.showPostDetails = !this.showPostDetails;
    },
    
    // Settings methods
    toggleRating(rating) {
      const index = this.settings.ratings.indexOf(rating);
      if (index > -1) {
        this.settings.ratings.splice(index, 1);
      } else {
        this.settings.ratings.push(rating);
      }
    },
    addWhitelistTag() {
      if (this.newWhitelistTag && !this.settings.whitelistTags.includes(this.newWhitelistTag)) {
        this.settings.whitelistTags.push(this.newWhitelistTag);
        this.newWhitelistTag = '';
      }
    },
    removeWhitelistTag(index) {
      this.settings.whitelistTags.splice(index, 1);
    },
    addBlacklistTag() {
      if (this.newBlacklistTag && !this.settings.blacklistTags.includes(this.newBlacklistTag)) {
        this.settings.blacklistTags.push(this.newBlacklistTag);
        this.newBlacklistTag = '';
      }
    },
    removeBlacklistTag(index) {
      this.settings.blacklistTags.splice(index, 1);
    },
    toggleExploreMode() {
      this.exploreMode = !this.exploreMode;
      this.saveSettingsToStorage();
    },

    saveSettingsToStorage() {
      StorageService.saveAppSettings({
        settings: this.settings,
        exploreMode: this.exploreMode
      });
    },

    syncSettingsFromQuery(query) {
      this.settings.ratings = query.ratings ? query.ratings.split(',') : ['general', 'sensitive'];
      this.settings.mediaType.images = query.images !== '0';
      this.settings.mediaType.videos = query.videos !== '0';
      this.settings.whitelistTags = query.whitelist ? query.whitelist.split(',') : [];
      this.settings.blacklistTags = query.blacklist ? query.blacklist.split(',') : [];
      this.exploreMode = query.explore === '1';
    },

    generateQueryFromSettings() {
      const query = {};
      
      if (this.settings.ratings.length > 0) {
        query.ratings = this.settings.ratings.slice().sort().join(',');
      }
      
      query.images = this.settings.mediaType.images ? '1' : '0';
      query.videos = this.settings.mediaType.videos ? '1' : '0';

      if (this.settings.whitelistTags.length > 0) {
        query.whitelist = this.settings.whitelistTags.slice().sort().join(',');
      }
      
      if (this.settings.blacklistTags.length > 0) {
        query.blacklist = this.settings.blacklistTags.slice().sort().join(',');
      }
      
      query.explore = this.exploreMode ? '1' : '0';

      return query;
    },

    applySettings() {
      this.showSettingsSidebar = false;
      this.saveSettingsToStorage();

      const currentRouteName = this.$route.name;

      if (currentRouteName === 'Home') {
        const newQuery = this.generateQueryFromSettings();
        if (JSON.stringify(newQuery) !== JSON.stringify(this.$route.query)) {
          this.$router.push({ name: 'Home', query: newQuery });
        }
      } else if (['History', 'Likes', 'Favorites'].includes(currentRouteName)) {
        this.routerViewKey++;
      }
    },

    handleVideoStateChange(state) {
      if (state.isPlaying !== undefined) this.isPlaying = state.isPlaying;
      if (state.progress !== undefined) this.videoProgress = state.progress;
      if (state.volume !== undefined) this.volumeLevel = state.volume;
      if (state.muted !== undefined) this.isMuted = state.muted;
    },

    // All video methods remain
    togglePlayPause() {
      if (!this.currentVideoElement) return;
      if (this.currentVideoElement.paused) {
        this.currentVideoElement.play();
      } else {
        this.currentVideoElement.pause();
      }
    },
    
    seekVideo(event) {
      if (!this.currentVideoElement || !this.currentVideoElement.duration) return;
      const progressBar = this.$refs.progressBar;
      const rect = progressBar.getBoundingClientRect();
      const percent = (event.clientX - rect.left) / rect.width;
      this.currentVideoElement.currentTime = this.currentVideoElement.duration * percent;
    },

    startProgressDrag(e) {
      if (!this.currentVideoElement || !this.currentVideoElement.duration) return;
      this.isProgressDragging = true;
      document.addEventListener('mousemove', this.handleProgressDrag);
      document.addEventListener('mouseup', this.stopProgressDrag);
    },

    handleProgressDrag(e) {
      if (!this.isProgressDragging || !this.currentVideoElement) return;
      const progressBar = this.$refs.progressBar;
      const rect = progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.videoProgress = percent * 100;
      this.currentVideoElement.currentTime = this.currentVideoElement.duration * percent;
    },

    stopProgressDrag() {
      this.isProgressDragging = false;
      document.removeEventListener('mousemove', this.handleProgressDrag);
      document.removeEventListener('mouseup', this.stopProgressDrag);
    },

    toggleMute() {
      if (!this.currentVideoElement) return;
      this.currentVideoElement.muted = !this.currentVideoElement.muted;
    },
    
    changeVolumeVertical(event) {
      if (!this.currentVideoElement) return;
      const slider = this.$refs.volumeSlider;
      const rect = slider.getBoundingClientRect();
      const percent = 1 - (event.clientY - rect.top) / rect.height;
      const newVolume = Math.max(0, Math.min(1, percent));
      this.currentVideoElement.volume = newVolume;
      this.currentVideoElement.muted = newVolume === 0;
    },

    startVolumeChange(e) {
      if (!this.currentVideoElement) return;
      this.isVolumeDragging = true;
      // Prevent text selection
      e.preventDefault();
      document.body.classList.add('user-select-none');

      // Add listeners
      document.addEventListener('mousemove', this.handleVolumeChange);
      document.addEventListener('mouseup', this.stopVolumeChange);
    },

    handleVolumeChange(e) {
      if (!this.isVolumeDragging || !this.currentVideoElement) return;
      this.changeVolumeVertical(e);
    },

    stopVolumeChange() {
      this.isVolumeDragging = false;
      document.body.classList.remove('user-select-none');
      document.removeEventListener('mousemove', this.handleVolumeChange);
      document.removeEventListener('mouseup', this.stopVolumeChange);
    },

    // All sidebar/filter methods remain
    // ...

    handleKeydown(e) {
      // ... (implementation remains)
    },
    toggleLike(post) {
      if (!post) return;
      if (post.liked) {
        // Unlike the post
        post.liked = false;
        StorageService.storeInteraction({ postId: post.id, type: 'like', value: 0, metadata: { post } });
      } else {
        // Like the post
        post.liked = true;
        StorageService.storeInteraction({ postId: post.id, type: 'like', value: 1, metadata: { post } });
        if (post.disliked) {
          // If it was disliked, remove the dislike
          post.disliked = false;
          StorageService.storeInteraction({ postId: post.id, type: 'dislike', value: 0, metadata: { post } });
        }
      }
    },
    toggleDislike(post) {
      if (!post) return;
      if (post.disliked) {
        // Undislike the post
        post.disliked = false;
        StorageService.storeInteraction({ postId: post.id, type: 'dislike', value: 0, metadata: { post } });
      } else {
        // Dislike the post
        post.disliked = true;
        StorageService.storeInteraction({ postId: post.id, type: 'dislike', value: 1, metadata: { post } });
        if (post.liked) {
          // If it was liked, remove the like
          post.liked = false;
          StorageService.storeInteraction({ postId: post.id, type: 'like', value: 0, metadata: { post } });
        }
      }
    },
    toggleFavorite(post) {
      if (!post) return;
      post.favorited = !post.favorited;
      StorageService.storeInteraction({ postId: post.id, type: 'favorite', value: post.favorited ? 1 : 0, metadata: { post } });
    },
  },
  mounted() {
    window.addEventListener('keydown', this.handleKeydown);
    // On initial load, if we are on the Home page, make sure the URL
    // reflects the currently loaded (or default) settings.
    if (this.$route.name === 'Home') {
      const currentQuery = this.generateQueryFromSettings();
      if (JSON.stringify(this.$route.query) !== JSON.stringify(currentQuery)) {
        this.$router.replace({ name: 'Home', query: currentQuery });
      }
    }

    const savedSettings = StorageService.loadAppSettings();
    if (savedSettings) {
      this.settings = savedSettings.settings;
      this.exploreMode = savedSettings.exploreMode;
    }
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
  },
};
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
.fixed.flex.flex-col button {
  animation: fadeIn 0.3s ease-out forwards;
}

/* Stagger the animations for each button */
.fixed.flex.flex-col button:nth-child(1) {
  animation-delay: 0s;
}
.fixed.flex.flex-col button:nth-child(2) {
  animation-delay: 0.1s;
}
.fixed.flex.flex-col button:nth-child(3) {
  animation-delay: 0.2s;
}

/* Add a box-shadow to the buttons to make them stand out against any background */
.fixed.flex.flex-col button {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Video controls styling */
.video-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
}

.video-progress-filled {
  background: #EC4899;
  height: 100%;
}

/* Add a shadow above the video controls for better visibility */
.fixed.bottom-0 {
  box-shadow: 0 -4px 6px rgba(0, 0, 0, 0.1);
}

/* Add more refined video control styling */
.fixed.bottom-0 {
  box-shadow: 0 -4px 6px rgba(0, 0, 0, 0.1);
}

/* Add hover effects for video control buttons */
.fixed.bottom-0 button {
  transition: transform 0.2s ease;
  border-radius: 50%;
}

.fixed.bottom-0 button:hover {
  transform: scale(1.15);
  background-color: rgba(255, 255, 255, 0.1);
}

/* Improved progress bar appearance */
.flex-grow.relative.h-2 {
  height: 4px;
  overflow: hidden;
  transition: height 0.2s ease;
}

.flex-grow.relative.h-2:hover {
  height: 6px;
}

/* Volume control styling */
.group:hover .hidden.group-hover\:block {
  display: block;
}

/* Improved progress and volume bars */
.flex-grow.relative.h-2,
.group-hover\:block.w-24.h-2 {
  height: 4px;
  overflow: hidden;
  transition: height 0.2s ease;
}

.flex-grow.relative.h-2:hover,
.group-hover\:block.w-24.h-2:hover {
  height: 6px;
}

/* Make volume slider handle more visible when dragging */
.group-hover\:block.w-24.h-2 {
  position: relative;
  height: 4px;
  overflow: visible;
  transition: height 0.2s ease;
}

.group-hover\:block.w-24.h-2:hover,
.group-hover\:block.w-24.h-2:active {
  height: 6px;
}

/* Change volume slider drag handle to appear at current position */
.group-hover\:block.w-24.h-2 .bg-pink-600::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translate(50%, -50%);
  width: 12px;
  height: 12px;
  background-color: #EC4899;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0,0,0,0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.group-hover\:block.w-24.h-2:hover .bg-pink-600::after {
  opacity: 1;
}

.group-hover\:block.w-24.h-2:active .bg-pink-600::after {
  opacity: 1;
}

/* Remove the old right-edge-only handle style */
.group-hover\:block.w-24.h-2:active::after {
  content: none;
}

/* Prevent text selection during volume dragging */
.user-select-none {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
</style>

