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
                View on Danbooru
              </a>
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
                v-if="post.file_ext === 'jpg' || post.file_ext === 'png' || post.file_ext === 'gif'" 
                :src="post.file_url" 
                :alt="post.tags" 
                class="max-h-[calc(100vh-0px)] max-w-full object-contain"
              />
              <video 
                v-else-if="post.file_ext === 'mp4' || post.file_ext === 'webm'" 
                :src="post.file_url" 
                controls 
                autoplay 
                loop 
                muted 
                class="max-h-[calc(100vh-0px)] max-w-full"
              ></video>
            </div>
            
            <!-- Post actions -->
            <div class="absolute right-4 bottom-24 flex flex-col items-center gap-4">
              <button 
                @click="toggleLike(post)"
                class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-pink-600 transition-colors"
                :class="{ 'bg-pink-600': post.liked }"
              >
                <Heart :fill="post.liked ? 'currentColor' : 'none'" class="h-6 w-6" />
              </button>
              
              <button 
                @click="toggleDislike(post)"
                class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-gray-900 transition-colors"
                :class="{ 'bg-gray-700': post.disliked }"
              >
                <ThumbsDown :fill="post.disliked ? 'currentColor' : 'none'" class="h-6 w-6" />
              </button>
              
              <button 
                @click="toggleFavorite(post)"
                class="p-3 rounded-full bg-black bg-opacity-70 hover:bg-yellow-600 transition-colors"
                :class="{ 'bg-yellow-600': post.favorited }"
              >
                <Star :fill="post.favorited ? 'currentColor' : 'none'" class="h-6 w-6" />
              </button>
            </div>
          </div>
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
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { Heart, ThumbsDown, Star, Settings, X } from 'lucide-vue-next';

// State
const posts = ref([]);
const loading = ref(true);
const showSettingsSidebar = ref(false);
const showPostDetails = ref(false);
const currentPostIndex = ref(0);
const feedContainer = ref(null);
const newWhitelistTag = ref('');
const newBlacklistTag = ref('');

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

// Methods
const fetchPosts = async () => {
  loading.value = true;
  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('limit', '20');
    params.append('page', settings.page);
    
    // Build a complete tags query, but exclude media type filters
    let tagsQuery = [];
    
    // Add rating filters
    if (settings.ratings.length > 0 && settings.ratings.length < 4) {
      const ratingQuery = settings.ratings.map(r => `rating:${r}`).join(' OR ');
      tagsQuery.push(`(${ratingQuery})`);
    }
    
    // Add whitelist tags
    if (settings.whitelistTags.length > 0) {
      const whitelistQuery = settings.whitelistTags.join(' ');
      tagsQuery.push(whitelistQuery);
    }
    
    // Add blacklist tags
    if (settings.blacklistTags.length > 0) {
      const blacklistQuery = settings.blacklistTags.map(tag => `-${tag}`).join(' ');
      tagsQuery.push(blacklistQuery);
    }
    
    // Join all tag queries and append once
    if (tagsQuery.length > 0) {
      params.append('tags', tagsQuery.join(' '));
    }
    
    console.log('Query URL:', `https://danbooru.donmai.us/posts.json?${params.toString()}`);
    
    // Fetch from Danbooru API
    const response = await fetch(`https://danbooru.donmai.us/posts.json?${params.toString()}`);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      // Apply media type filtering on the client side
      let filteredData = data;

      const showImages = settings.mediaType.images;
      const showVideos = settings.mediaType.videos;

      if (showImages && !showVideos) {
        filteredData = data.filter(post => 
          ['jpg', 'png', 'gif'].includes(post.file_ext?.toLowerCase())
        );
      } else if (!showImages && showVideos) {
        filteredData = data.filter(post => 
          ['mp4', 'webm'].includes(post.file_ext?.toLowerCase())
        );
      } else if (!showImages && !showVideos) {
        // If neither is selected, show nothing
        filteredData = [];
      }
      
      // Process filtered posts
      const newPosts = filteredData.map(post => ({
        ...post,
        liked: false,
        disliked: false,
        favorited: false
      }));
      
      // If we're on page 1, replace posts; otherwise append
      if (settings.page === 1) {
        posts.value = newPosts;
      } else {
        posts.value = [...posts.value, ...newPosts];
      }
      
      // Only increment page if we got some results
      if (filteredData.length > 0) {
        settings.page++;
      } else if (data.length > 0) {
        // If we got API results but filtered all of them out, try another page
        settings.page++;
        fetchPosts(); // Recursive call to fetch more
        return;
      }
      
      console.log(`Filtered ${data.length} posts to ${filteredData.length} posts`);
    } else {
      console.log('API returned non-array response:', data);
    }
  } catch (error) {
    console.error('Error fetching posts:', error);
  } finally {
    loading.value = false;
  }
};

const toggleLike = (post) => {
  post.liked = !post.liked;
  if (post.liked && post.disliked) {
    post.disliked = false;
  }
};

const toggleDislike = (post) => {
  post.disliked = !post.disliked;
  if (post.disliked && post.liked) {
    post.liked = false;
  }
};

const toggleFavorite = (post) => {
  post.favorited = !post.favorited;
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

// Handle scroll events to update current post index
const handleScroll = () => {
  if (!feedContainer.value) return;
  
  const containerHeight = feedContainer.value.clientHeight;
  const scrollTop = feedContainer.value.scrollTop;
  const postIndex = Math.round(scrollTop / containerHeight);
  
  if (postIndex !== currentPostIndex.value) {
    currentPostIndex.value = postIndex;
  }
  
  // Load more posts when approaching the end
  if (posts.value.length - currentPostIndex.value < 5 && !loading.value) {
    fetchPosts();
  }
};

// Toggle post details sidebar
const togglePostDetails = () => {
  showPostDetails.value = !showPostDetails.value;
};

// Lifecycle hooks
onMounted(() => {
  fetchPosts();
  
  if (feedContainer.value) {
    feedContainer.value.addEventListener('scroll', handleScroll);
  }
});

// Clean up
watch(() => settings.autoScroll, (newValue) => {
  if (newValue) {
    startAutoScroll();
  } else {
    stopAutoScroll();
  }
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
</style>

