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
            class="max-h-[calc(100vh-0px)] max-w-full object-contain"
          />
          <video 
            v-else-if="getFileExtension(post) === 'mp4' || getFileExtension(post) === 'webm' || isVideoPost(post)" 
            :src="post.file_url" 
            ref="videoPlayer"
            autoplay 
            loop 
            muted 
            class="max-h-[calc(100vh-0px)] max-w-full"
            @click="togglePlayPause"
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
  </div>
</template>

<script>
import DanbooruService from '../services/DanbooruService';
import StorageService from '../services/StorageService';

export default {
  name: 'FeedView',
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
    }
  },
  methods: {
    buildTagsFromRouteQuery() {
      const query = this.$route.query;
      const tags = [];

      const ratings = query.ratings ? query.ratings.split(',') : ['general'];
      if (ratings.length > 0) {
        tags.push(...ratings.map(r => `rating:${r}`));
      }

      const wantsImages = 'images' in query ? query.images === '1' : true;
      const wantsVideos = 'videos' in query ? query.videos === '1' : true;

      if (wantsVideos && !wantsImages) {
        tags.push('animated:true');
      } else if (!wantsVideos && wantsImages) {
        tags.push('-animated:true');
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
      this.loading = true;

      if (newSearch) {
        this.page = 1;
        this.posts = [];
        this.currentPostIndex = -1;
        if (this.$refs.feedContainer) {
          this.$refs.feedContainer.scrollTop = 0;
        }
      }

      try {
        const tagsForApi = this.buildTagsFromRouteQuery();
        const newPosts = await DanbooruService.getPosts({
          tags: tagsForApi,
          page: this.page,
          limit: 10,
          sort: this.sort,
          sortOrder: this.sortOrder,
        });
        
        if (newPosts.length > 0) {
          this.posts = [...this.posts, ...newPosts];
          this.page++;
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
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 5) {
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
          this.$emit('current-post-changed', currentPost);
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
    }
  },
  mounted() {
    this.$refs.feedContainer.addEventListener('scroll', this.handleScroll);

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
  },
  beforeUnmount() {
    this.$refs.feedContainer.removeEventListener('scroll', this.handleScroll);
    if (this.observer) {
        this.observer.disconnect();
    }
  },
  watch: {
    '$route.query': {
      handler() {
        this.fetchPosts(true);
      },
      deep: true,
      immediate: true,
    },
    posts() {
      this.$nextTick(() => {
        this.observePosts();
        this.determineCurrentPost();
      });
    },
  },
}
</script> 