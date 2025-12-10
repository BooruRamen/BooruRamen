<template>
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
            class="max-h-[calc(100vh-56px)] max-w-full object-contain"
          />
          <video 
            v-else-if="getFileExtension(post) === 'mp4' || getFileExtension(post) === 'webm' || isVideoPost(post)" 
            :src="post.file_url" 
            :ref="(el) => { 
              if (el) {
                videoElements[post.id] = el;
                el.volume = volume;
                el.muted = isMuted;
              }
            }"
            autoplay 
            loop 
            :muted="isMuted" 
            class="max-h-[calc(100vh-56px)] max-w-full"
            @click="togglePlayPause"
            @play="onVideoPlay"
            @pause="onVideoPause"
            @timeupdate="onVideoTimeUpdate"
            @volumechange="onVideoVolumeChange"
          ></video>
          <div 
            v-else
            class="flex items-center justify-center bg-gray-900 p-4 rounded"
          >
            <p>Unable to display media. <a :href="post.file_url" target="_blank" class="text-pink-500 underline">Open directly</a></p>
          </div>
        </div>
      </div>
      
      <!-- Pagination loading spinner -->
      <div v-if="isFetching && !loading" class="h-full w-full snap-start flex items-center justify-center relative">
         <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-600"></div>
      </div>
    </div>
    
    <!-- Debug Overlay -->
    <div 
      v-if="debugMode && posts[currentPostIndex]" 
      class="absolute top-4 left-1/2 transform -translate-x-1/2 p-4 bg-black bg-opacity-70 text-white text-xs z-40 pointer-events-none rounded-lg border border-gray-700 backdrop-blur-sm"
    >
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-pink-500 mb-1">Recommendation Insights</h3>
          
          <!-- Score -->
          <p class="mb-1">
            <span class="text-gray-400">Likelihood:</span> 
            <span class="font-mono text-yellow-400">
              {{ (recommendationSystem.getPostScoreDetails(posts[currentPostIndex]).totalScore * 10).toFixed(2) }}%
            </span>
          </p>
          
          <!-- Search Criteria -->
          <p class="mb-2 max-w-md truncate">
            <span class="text-gray-400">Source:</span> 
            <span class="font-mono text-blue-300">{{ posts[currentPostIndex]._searchCriteria || 'N/A' }}</span>
          </p>
          
          <!-- Contributors -->
          <div>
             <span class="text-gray-400 block mb-1">Top Contributors:</span>
             <div class="space-y-1">
               <div 
                  v-for="(contrib, idx) in recommendationSystem.getPostScoreDetails(posts[currentPostIndex]).contributingTags" 
                  :key="idx"
                  class="flex items-center gap-2"
                >
                  <span class="bg-gray-700 px-1 rounded">{{ contrib.tag }}</span>
                  <span class="text-green-400">+{{ (contrib.score * 100).toFixed(1) }}</span>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import DanbooruService from '../services/DanbooruService';
import StorageService from '../services/StorageService';
import recommendationSystem from '../services/RecommendationSystem';

export default {
  name: 'FeedView',
  props: {
    autoScroll: {
      type: Boolean,
      default: false
    },
    autoScrollSeconds: {
      type: Number,
      default: 5
    },
    disableScrollAnimation: {
      type: Boolean,
      default: false
    },
    volume: {
      type: Number,
      default: 1
    },
    isMuted: {
      type: Boolean,
      default: false
    },
  },
  data() {
    return {
      posts: [],
      loading: true,
      page: 1,
      currentPostIndex: 0,
      tags: 'rating:general',
      sort: 'score',
      sortOrder: 'desc',
      isFetching: false,
      lastPostY: 0,
      observer: null,
      videoElements: {},
      autoScrollInterval: null,
      debugMode: false,
    }
  },
  beforeUpdate() {
    this.videoElements = {};
  },
  created() {
    this.recommendationSystem = recommendationSystem;
    const preferences = StorageService.getPreferences();
    this.debugMode = preferences.debugMode || false;
  },
  methods: {
    buildTagsFromRouteQuery(overrideQuery = null) {
      const query = overrideQuery || this.$route.query;
      const tags = [];

      const ratings = query.ratings ? query.ratings.split(',') : ['general'];
      if (ratings.length > 0) {
        tags.push(`rating:${ratings.join(',')}`);
      }

      const wantsImages = 'images' in query ? query.images === '1' : true;
      const wantsVideos = 'videos' in query ? query.videos === '1' : true;

      if (wantsVideos && !wantsImages) {
        tags.push('filetype:mp4,webm');
      } else if (!wantsVideos && wantsImages) {
        tags.push('-filetype:mp4,webm');
      }

      if (query.whitelist) {
        tags.push(...query.whitelist.split(','));
      }
      if (query.blacklist) {
        tags.push(...query.blacklist.split(',').map(t => `-${t}`));
      }
      
      return tags.join(' ');
    },

    async fetchPosts(newSearch = false) {
      if (this.isFetching) return;
      this.isFetching = true;
      if (newSearch || this.posts.length === 0) {
        this.loading = true;
      }

      // Get view history to exclude seen posts
      const viewedHistory = StorageService.getViewedPosts();
      // Create a set of IDs to exclude (viewed history + currently loaded posts)
      const blockedIds = new Set([
        ...Object.keys(viewedHistory).map(id => parseInt(id)), // Ensure IDs are numbers if needed, but strings work for comparisons usually. API returns numbers.
        ...this.posts.map(p => p.id)
      ]);
      
      console.log(`FetchPosts: Blocked ${Object.keys(viewedHistory).length} from history, ${this.posts.length} from current. Total blocked: ${blockedIds.size}`);

      if (newSearch) {
        this.page = 1;
        this.posts = [];
        this.currentPostIndex = -1;
        if (this.$refs.feedContainer) {
          this.$refs.feedContainer.scrollTop = 0;
        }
      }

      const exploreMode = this.$route.query.explore === '1';

      try {
        let newPosts = [];
        
        if (exploreMode) {
          const targetCount = 5; // Relaxed target for explore mode
          let attempts = 0;
          const maxAttempts = 15;

          const fetchFunction = (queryParams, limit) => {
            let combinedTags = queryParams.tags || '';

            // Manually add media type filters
            const wantsImages = 'images' in this.$route.query ? this.$route.query.images === '1' : true;
            const wantsVideos = 'videos' in this.$route.query ? this.$route.query.videos === '1' : true;

            if (wantsVideos && !wantsImages) {
              combinedTags += ' filetype:mp4,webm';
            } else if (!wantsVideos && wantsImages) {
              combinedTags += ' -filetype:mp4,webm';
            }

            return DanbooruService.getPosts({ 
              tags: combinedTags.trim(), 
              limit, 
              page: this.page, 
              sort: this.sort, 
              sortOrder: this.sortOrder 
            });
          };

          const { ratings, whitelist, blacklist } = this.$route.query;

          // Loop until we find news posts or hit max attempts
          while (newPosts.length < targetCount && attempts < maxAttempts) {
            attempts++;
            
            const batch = await this.recommendationSystem.getCuratedExploreFeed(fetchFunction, {
              postsPerFetch: 20,
              selectedRatings: ratings ? ratings.split(',') : ['general'],
              whitelist: whitelist ? whitelist.split(',') : [],
              blacklist: blacklist ? blacklist.split(',') : [],
              existingPostIds: blockedIds, // Pass the blocked IDs here
            });
            
            if (batch.length > 0) {
              newPosts = [...newPosts, ...batch];
              // Add found IDs to blockedIds so subsequent iterations (if any) don't pick them up
              batch.forEach(p => blockedIds.add(p.id));
            }
            
            // If we haven't met our target, move to next page of results
            if (newPosts.length < targetCount) {
               this.page++;
            }
          }

        } else {
          // Normal mode with deduplication
          const tagsForApi = this.buildTagsFromRouteQuery();
          const targetCount = 10;
          let fetchedCount = 0;
          let attempts = 0;
          const maxAttempts = 5; // Prevent infinite loops
          
          while (newPosts.length < targetCount && attempts < maxAttempts) {
            attempts++;
            
            // Fetch a batch of posts
            const rawPosts = await DanbooruService.getPosts({
              tags: tagsForApi,
              page: this.page,
              limit: 20, // Fetch more than needed to account for filtering
              sort: this.sort,
              sortOrder: this.sortOrder,
            });
            
            if (!rawPosts || rawPosts.length === 0) {
              break; // No more posts available
            }
            
            // Filter out blocked posts
            const filteredBatch = rawPosts.filter(p => !blockedIds.has(p.id));
            
            // Add unique posts to our result
            for (const post of filteredBatch) {
              if (newPosts.length < targetCount) {
                // Attach search criteria for debug mode
                post._searchCriteria = tagsForApi;
                newPosts.push(post);
                blockedIds.add(post.id); // Add to blocked so we don't add duplicates within the loop (though API shouldn't return dupes on same page)
              }
            }
            
            // Always increment page to move forward in the API
            this.page++;
            
            // If we got fewer posts than requested from API (ignoring filter), we reached the end
            if (rawPosts.length < 20) {
              break;
            }
          }
        }
        
        if (newPosts && newPosts.length > 0) {
          this.posts = [...this.posts, ...newPosts];
          // Page increment is handled inside the loop for normal mode, 
          // but for explore mode we might want to just increment it once or let the system handle it.
          // In explore mode 'page' isn't really used the same way since it generates random queries.
          // But to be safe and consistent with original code if it used it:
          if (exploreMode) this.page++; 
        } else if (!exploreMode && newPosts.length === 0 && this.posts.length > 0) {
            // If we found no new posts in normal mode but have existing posts, 
            // we might have filtered everything out. 
            console.log("No new unique posts found in this batch.");
        }
      } catch (error) {
        console.error('Failed to fetch posts:', error);
      } finally {
        this.isFetching = false;
        this.loading = false;
        this.$nextTick(() => {
          this.observePosts();
        });
      }
    },
    handleScroll() {
      this.determineCurrentPost();
      const container = this.$refs.feedContainer;
      // Fetch more posts when we are 1 page away from the bottom (pre-fetching)
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - container.clientHeight) {
        this.fetchPosts();
      }
    },
    determineCurrentPost() {
      const container = this.$refs.feedContainer;
      if (!container) return;

      const postElements = [...container.querySelectorAll('.snap-start')];
      const containerMidY = container.getBoundingClientRect().top + container.clientHeight / 2;

      let closestPostIndex = -1;
      let minDistance = Infinity;

      postElements.forEach((postEl, index) => {
        const postMidY = postEl.getBoundingClientRect().top + postEl.clientHeight / 2;
        const distance = Math.abs(containerMidY - postMidY);

        if (distance < minDistance) {
          minDistance = distance;
          closestPostIndex = index;
        }
      });

      if (closestPostIndex !== -1 && this.currentPostIndex !== closestPostIndex) {
        this.currentPostIndex = closestPostIndex;
        const currentPost = this.posts[this.currentPostIndex];
        if (currentPost) {
          const videoEl = this.videoElements[currentPost.id] || null;
          this.$emit('current-post-changed', currentPost, videoEl);
          StorageService.trackPostView(currentPost.id, currentPost);
        }
      }
    },
    observePosts() {
        if (this.observer) {
            this.observer.disconnect();
        }

        const postElements = this.$refs.feedContainer.querySelectorAll('.snap-start');
        postElements.forEach(el => this.observer.observe(el));
    },
    getFileExtension(post) {
      if (post && post.file_url) {
        return post.file_url.split('.').pop();
      }
      return '';
    },
    isVideoPost(post) {
      const videoExtensions = ['mp4', 'webm'];
      return videoExtensions.includes(this.getFileExtension(post));
    },
    togglePlayPause(event) {
        const video = event.target;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    },
    onVideoPlay() {
      this.$emit('video-state-change', { isPlaying: true });
    },
    onVideoPause() {
      this.$emit('video-state-change', { isPlaying: false });
    },
    onVideoTimeUpdate(event) {
      const { currentTime, duration } = event.target;
      if (duration > 0) {
        this.$emit('video-state-change', { progress: (currentTime / duration) * 100 });
      }
    },
    onVideoVolumeChange(event) {
      const { volume, muted } = event.target;
      this.$emit('video-state-change', { volume, muted });
    },
    startAutoScroll() {
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
      }
      this.autoScrollInterval = setInterval(() => {
        const container = this.$refs.feedContainer;
        if (container) {
          const nextScrollTop = container.scrollTop + container.clientHeight;
          container.scrollTo({
            top: nextScrollTop,
            behavior: this.disableScrollAnimation ? 'auto' : 'smooth'
          });
        }
      }, this.autoScrollSeconds * 1000);
    },
    stopAutoScroll() {
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
        this.autoScrollInterval = null;
      }
    },
  },
  mounted() {
    this.$refs.feedContainer.addEventListener('scroll', this.handleScroll, { passive: true });

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const video = entry.target.querySelector('video');
          if (entry.isIntersecting) {
            if (video) {
              video.play().catch(e => console.error("Autoplay failed", e));
            }
          } else {
            if (video) {
              video.pause();
            }
          }
        });
      },
      { threshold: 0.5 }
    );
    this.fetchPosts(true);

    this.$nextTick(() => {
        if(this.posts.length > 0) {
            this.determineCurrentPost();
        }
    });
  },
  beforeUnmount() {
    this.$refs.feedContainer.removeEventListener('scroll', this.handleScroll);
    if (this.observer) {
        this.observer.disconnect();
    }
    this.$emit('current-post-changed', null, null);
    this.stopAutoScroll();
  },
  watch: {
    '$route.query': {
      handler(newQuery, oldQuery) {
        const newQueryStr = JSON.stringify(newQuery);
        const oldQueryStr = JSON.stringify(oldQuery);
        if (newQueryStr !== oldQueryStr) {
          this.fetchPosts(true);
        }
      },
      deep: true,
      immediate: true
    },
    autoScroll: {
      handler(newValue) {
        if (newValue) {
          this.startAutoScroll();
        } else {
          this.stopAutoScroll();
        }
      },
      immediate: true
    },
    posts() {
      this.$nextTick(() => {
        this.observePosts();
        this.determineCurrentPost();
      });
    },
    volume(newVolume) {
      Object.values(this.videoElements).forEach(el => {
        if (el) el.volume = newVolume;
      });
    },
    isMuted(newMuted) {
      Object.values(this.videoElements).forEach(el => {
        if (el) el.muted = newMuted;
      });
    }
  },
}
</script> 