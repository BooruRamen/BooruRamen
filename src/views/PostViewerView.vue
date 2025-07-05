<template>
  <div class="h-full w-full relative overflow-hidden">
    <div class="h-full overflow-y-auto snap-y snap-mandatory" ref="viewerContainer">
      <div v-if="loading" class="h-full flex items-center justify-center">
        <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-600"></div>
      </div>
      
      <div v-else-if="posts.length === 0" class="h-full flex items-center justify-center">
        <div class="text-center">
          <p class="text-xl">No posts to display.</p>
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
            v-if="isImage(post)" 
            :src="post.large_file_url || post.file_url" 
            :alt="post.tag_string" 
            class="max-h-[calc(100vh-0px)] max-w-full object-contain"
          />
          <video 
            v-else-if="isVideo(post)" 
            :src="post.file_url" 
            ref="videoPlayer"
            :autoplay="autoplayVideos"
            :muted="isMuted"
            loop 
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
import StorageService from '../services/StorageService';

export default {
  name: 'PostViewerView',
  props: {
    source: {
      type: String,
      required: true,
    },
    autoplayVideos: {
      type: Boolean,
      default: true,
    },
    isMuted: {
      type: Boolean,
      default: true,
    }
  },
  data() {
    return {
      posts: [],
      loading: true,
      currentPostIndex: 0,
      observer: null,
    };
  },
  mounted() {
    this.loadPosts();
    this.$refs.viewerContainer.addEventListener('scroll', this.determineCurrentPost);

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const video = entry.target.querySelector('video');
          if (entry.isIntersecting) {
            video?.play().catch(e => console.error("Autoplay failed", e));
          } else {
            video?.pause();
          }
        });
      },
      { threshold: 0.5 }
    );
  },
  beforeUnmount() {
    this.$refs.viewerContainer.removeEventListener('scroll', this.determineCurrentPost);
    if (this.observer) {
      this.observer.disconnect();
    }
  },
  methods: {
    loadPosts() {
      this.loading = true;
      let postData = [];
      if (this.source === 'history') {
        const history = StorageService.getViewedPosts();
        postData = Object.values(history)
          .sort((a, b) => b.lastViewed - a.lastViewed)
          .map(item => item.data);
      } else if (this.source === 'likes') {
        const likedInteractions = StorageService.getInteractions('like');
        postData = likedInteractions
          .filter(i => i.value > 0)
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(i => i.metadata.post);
      } else if (this.source === 'favorites') {
        const favoritedInteractions = StorageService.getInteractions('favorite');
        postData = favoritedInteractions
          .filter(i => i.value > 0)
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(i => i.metadata.post);
      }
      this.posts = postData.filter(p => p && p.id);
      this.loading = false;
      this.$nextTick(this.scrollToInitialPost);
    },
    scrollToInitialPost() {
        const startIndex = parseInt(this.$route.query.start || 0, 10);
        const container = this.$refs.viewerContainer;
        if (container) {
            const postElements = container.querySelectorAll('.snap-start');
            if (postElements[startIndex]) {
                container.scrollTop = postElements[startIndex].offsetTop;
                this.currentPostIndex = startIndex;
                this.$emit('current-post-changed', this.posts[this.currentPostIndex]);
            }
        }
        this.observePosts();
    },
    determineCurrentPost() {
      const container = this.$refs.viewerContainer;
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
        if (this.observer) this.observer.disconnect();
        const postElements = this.$refs.viewerContainer?.querySelectorAll('.snap-start');
        postElements?.forEach(el => this.observer.observe(el));
    },
    isImage(post) {
      if (!post || !post.file_ext) return false;
      const ext = post.file_ext.toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif'].includes(ext);
    },
    isVideo(post) {
      if (!post || !post.file_ext) return false;
      const ext = post.file_ext.toLowerCase();
      return ['mp4', 'webm'].includes(ext);
    },
    togglePlayPause(event) {
        const video = event.target;
        if (video.paused) video.play();
        else video.pause();
    }
  },
  watch: {
    posts: 'observePosts'
  }
};
</script> 