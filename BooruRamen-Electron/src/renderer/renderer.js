// Initialize Vue application
const { createApp } = Vue;

// Create the Vue app
const app = createApp({
  data() {
    return {
      // Post navigation
      currentIndex: 0,
      posts: [],
      page: 1,
      
      // UI state
      loading: true,
      fullscreen: false,
      focusMode: false,
      
      // User settings
      selectedRating: 'General and Sensitive',
      selectedMedia: 'Video and Images',
      
      // Rating and media options
      ratingOptions: [
        'General Only',
        'General and Sensitive',
        'General, Sensitive, and Questionable',
        'General, Sensitive, Questionable, and Explicit',
        'Sensitive Only',
        'Questionable Only',
        'Explicit Only'
      ],
      mediaOptions: ['Video Only', 'Images Only', 'Video and Images'],
      
      // AutoNext feature
      autonextEnabled: false,
      autonextInterval: 5,
      autonextTimerId: null,
      
      // User profile data
      userProfile: null,
      postLikelihood: null,
      
      // Current post data
      currentPost: null,
      
      // Media content URL (after fetching)
      mediaUrl: null
    };
  },
  
  async mounted() {
    // Initialize the app
    await this.initApp();
    
    // Fetch posts
    await this.fetchAndUpdatePosts();
    
    // Add keyboard event listeners
    document.addEventListener('keydown', this.handleKeyPress);
  },
  
  beforeUnmount() {
    // Clean up event listeners
    document.removeEventListener('keydown', this.handleKeyPress);
    this.stopAutonext();
  },
  
  methods: {
    async initApp() {
      try {
        // Load user profile
        this.userProfile = await window.api.loadUserProfile();
        if (!this.userProfile) {
          this.userProfile = await window.api.buildUserProfile();
        }
        
        // Get current timestamp
        const currentTime = new Date();
        
        // Get last accessed time from database
        const dbTimestamp = await window.api.getSetting('last_time_app_accessed', currentTime.toString());
        const dbTimestampObj = new Date(dbTimestamp);
        
        // Check if more than 30 minutes have passed
        const timeDiff = currentTime - dbTimestampObj;
        if (timeDiff > 30 * 60 * 1000) {
          this.page = 1;
          
          // Reset pages for all combinations of rating and media types
          for (const rating of this.ratingOptions) {
            for (const media of this.mediaOptions) {
              await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
            }
          }
          
          // Update last access time
          await window.api.setSetting('last_time_app_accessed', currentTime.toString());
        } else {
          // Get the last used page for current rating and media selection
          this.page = parseInt(await window.api.getSetting(
            `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
        }
        
        console.log("App initialized with page:", this.page);
      } catch (error) {
        console.error("Error initializing app:", error);
      }
    },
    
    // Fetch posts from Danbooru API
    async fetchAndUpdatePosts() {
      this.loading = true;
      
      try {
        // Build the rating tags based on selectedRating
        let ratingTags = '';
        
        switch (this.selectedRating) {
          case 'General Only':
            ratingTags = 'rating:general';
            break;
          case 'General and Sensitive':
            ratingTags = 'rating:general..sensitive';
            break;
          case 'General, Sensitive, and Questionable':
            ratingTags = 'rating:general..questionable';
            break;
          case 'General, Sensitive, Questionable, and Explicit':
            ratingTags = ''; // No rating filter
            break;
          case 'Sensitive Only':
            ratingTags = 'rating:sensitive';
            break;
          case 'Questionable Only':
            ratingTags = 'rating:questionable';
            break;
          case 'Explicit Only':
            ratingTags = 'rating:explicit';
            break;
          default:
            ratingTags = '';
        }
        
        // Build the tags parameter based on media option
        const tags = [];
        
        if (this.selectedMedia === 'Video Only') {
          tags.push('animated');
        } else if (this.selectedMedia === 'Images Only') {
          tags.push('-animated');
        }
        
        if (ratingTags) {
          tags.push(ratingTags);
        }
        
        const tagsStr = tags.join(' ');
        const apiUrl = `https://danbooru.donmai.us/posts.json?limit=20&page=${this.page}&tags=${encodeURIComponent(tagsStr)}`;
        
        console.log(`Fetching posts with: Page ${this.page}, Tags: ${tagsStr}`);
        
        // Fetch posts from Danbooru API
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        let posts = await response.json();
        
        // Filter by score and seen status
        const filteredPosts = [];
        for (const post of posts) {
          // Check if post is already seen
          const isSeen = await window.api.isSeen(post.id);
          
          // Only include posts with score >= 0
          if (!isSeen && post.score >= 0) {
            // Filter based on media type if needed
            const isVideo = this.isVideo(post);
            if (
              (this.selectedMedia === 'Video Only' && isVideo) ||
              (this.selectedMedia === 'Images Only' && !isVideo) ||
              this.selectedMedia === 'Video and Images'
            ) {
              filteredPosts.push(post);
            }
          }
        }
        
        if (filteredPosts.length > 0) {
          this.posts = filteredPosts;
          this.currentIndex = 0;
          await this.showPost(this.currentIndex);
          
          // Save the current page
          await window.api.setSetting(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
          await window.api.setSetting('last_time_app_accessed', new Date().toString());
        } else {
          console.log("No new posts found on current page, trying next page");
          this.page++;
          await window.api.setSetting(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
          await window.api.setSetting('last_time_app_accessed', new Date().toString());
          await this.fetchAndUpdatePosts(); // Try the next page
        }
      } catch (error) {
        console.error("Error fetching posts:", error);
        this.loading = false;
      }
    },
    
    // Show a post at the given index
    async showPost(index) {
      try {
        this.loading = true;
        this.currentIndex = index;
        this.mediaUrl = null; // Reset media URL
        
        const post = this.posts[this.currentIndex];
        if (!post) {
          console.error("No post found at index:", index);
          this.loading = false;
          return;
        }
        
        // Ensure the object is serializable by deep cloning it
        const safePost = JSON.parse(JSON.stringify(post));
        
        this.currentPost = safePost;
        
        // Mark post as seen
        await window.api.markAsSeen(safePost.id, safePost.tag_string || '', safePost.rating || '');
        
        // Calculate post likelihood score
        if (this.userProfile) {
          this.postLikelihood = window.api.predictPostLikelihood(safePost, this.userProfile);
          console.log(`Predicted likelihood score for this post: ${this.postLikelihood * 100}%`);
        }
        
        // Fetch media using the API's fetchMedia function
        if (safePost.file_url) {
          try {
            this.mediaUrl = await window.api.fetchMedia(safePost.file_url);
            console.log("Media fetched successfully");
          } catch (mediaError) {
            console.error("Error fetching media:", mediaError);
            // Try with large file URL as fallback
            if (safePost.large_file_url && safePost.large_file_url !== safePost.file_url) {
              try {
                this.mediaUrl = await window.api.fetchMedia(safePost.large_file_url);
                console.log("Media fetched successfully from large_file_url");
              } catch (largeMediaError) {
                console.error("Error fetching large media:", largeMediaError);
              }
            }
          }
        }
        
        console.log(`Showing post ID: ${safePost.id}, Score: ${safePost.score}`);
      } catch (error) {
        console.error("Error showing post:", error);
      }
    },
    
    // Media event handlers
    mediaLoaded() {
      this.loading = false;
    },
    
    mediaError() {
      console.error("Error loading media");
      this.loading = false;
      this.nextPost();
    },
    
    // Post navigation
    async nextPost() {
      if (this.currentIndex < this.posts.length - 1) {
        await this.showPost(this.currentIndex + 1);
      } else {
        // Move to next page
        this.page++;
        await window.api.setSetting(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
        await window.api.setSetting('last_time_app_accessed', new Date().toString());
        await this.fetchAndUpdatePosts();
      }
    },
    
    async previousPost() {
      if (this.currentIndex > 0) {
        await this.showPost(this.currentIndex - 1);
      }
    },
    
    // Post interaction handlers
    async likePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      await window.api.markPostStatus(post.id, 'liked', post.tag_string || '', post.rating || '');
      
      // Update user profile
      this.userProfile = window.api.updateProfileIncrementally(post, 'liked', this.userProfile);
      await window.api.saveUserProfile(this.userProfile);
      
      await this.nextPost();
    },
    
    async superLikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      await window.api.markPostStatus(post.id, 'super liked', post.tag_string || '', post.rating || '');
      
      // Update user profile
      this.userProfile = window.api.updateProfileIncrementally(post, 'super liked', this.userProfile);
      await window.api.saveUserProfile(this.userProfile);
      
      await this.nextPost();
    },
    
    async dislikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      await window.api.markPostStatus(post.id, 'disliked', post.tag_string || '', post.rating || '');
      
      // Update user profile
      this.userProfile = window.api.updateProfileIncrementally(post, 'disliked', this.userProfile);
      await window.api.saveUserProfile(this.userProfile);
      
      await this.nextPost();
    },
    
    // Filter change handlers
    async ratingChanged() {
      console.log(`Rating changed to: ${this.selectedRating}`);
      
      const currentTime = new Date();
      const dbTimestamp = await window.api.getSetting('last_time_app_accessed', currentTime.toString());
      const dbTimestampObj = new Date(dbTimestamp);
      
      const timeDiff = currentTime - dbTimestampObj;
      if (timeDiff > 30 * 60 * 1000) {
        this.page = 1;
        // Reset all pages
        for (const rating of this.ratingOptions) {
          for (const media of this.mediaOptions) {
            await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
          }
        }
        await window.api.setSetting('last_time_app_accessed', currentTime.toString());
      } else {
        this.page = parseInt(await window.api.getSetting(
          `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
      }
      
      await this.fetchAndUpdatePosts();
    },
    
    async mediaTypeChanged() {
      console.log(`Media type changed to: ${this.selectedMedia}`);
      
      const currentTime = new Date();
      const dbTimestamp = await window.api.getSetting('last_time_app_accessed', currentTime.toString());
      const dbTimestampObj = new Date(dbTimestamp);
      
      const timeDiff = currentTime - dbTimestampObj;
      if (timeDiff > 30 * 60 * 1000) {
        this.page = 1;
        // Reset all pages
        for (const rating of this.ratingOptions) {
          for (const media of this.mediaOptions) {
            await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
          }
        }
        await window.api.setSetting('last_time_app_accessed', currentTime.toString());
      } else {
        this.page = parseInt(await window.api.getSetting(
          `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
      }
      
      await this.fetchAndUpdatePosts();
    },
    
    // Helper functions
    isVideo(post) {
      return post.file_ext === 'mp4' || post.file_ext === 'webm';
    },
    
    // External link handlers
    openInBrowser() {
      if (!this.currentPost) return;
      const postId = this.currentPost.id;
      const url = `https://danbooru.donmai.us/posts/${postId}`;
      window.open(url, '_blank');
    },
    
    copyToClipboard() {
      if (!this.currentPost) return;
      const postId = this.currentPost.id;
      const url = `https://danbooru.donmai.us/posts/${postId}`;
      navigator.clipboard.writeText(url)
        .then(() => console.log('URL copied to clipboard'))
        .catch(err => console.error('Failed to copy URL: ', err));
    },
    
    // Fullscreen and focus mode
    toggleFullscreen() {
      this.fullscreen = !this.fullscreen;
      
      if (this.fullscreen) {
        document.documentElement.requestFullscreen()
          .catch(err => console.error('Error attempting to enable fullscreen:', err));
        document.body.classList.add('fullscreen-mode');
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen()
            .catch(err => console.error('Error attempting to exit fullscreen:', err));
        }
        document.body.classList.remove('fullscreen-mode');
      }
    },
    
    toggleFocusMode() {
      this.focusMode = !this.focusMode;
      if (this.focusMode) {
        document.body.classList.add('focus-mode');
      } else {
        document.body.classList.remove('focus-mode');
      }
    },
    
    // AutoNext functionality
    toggleAutonext() {
      if (this.autonextEnabled) {
        this.startAutonext();
      } else {
        this.stopAutonext();
      }
    },
    
    startAutonext() {
      // Clear existing timer if any
      this.stopAutonext();
      
      // Start a new timer
      const intervalMs = parseFloat(this.autonextInterval) * 1000 || 5000;
      this.autonextTimerId = setInterval(() => {
        this.nextPost();
      }, intervalMs);
      
      console.log(`AutoNext started with interval: ${intervalMs}ms`);
    },
    
    stopAutonext() {
      if (this.autonextTimerId) {
        clearInterval(this.autonextTimerId);
        this.autonextTimerId = null;
        console.log("AutoNext stopped");
      }
    },
    
    // Keyboard event handlers
    handleKeyPress(event) {
      switch (event.key) {
        case 'ArrowRight': // Next post
          this.nextPost();
          break;
        case 'ArrowLeft': // Previous post
          this.previousPost();
          break;
        case 'ArrowUp': // Like
          this.likePost();
          break;
        case 'ArrowDown': // Dislike
          this.dislikePost();
          break;
        case ' ': // Toggle AutoNext
          this.autonextEnabled = !this.autonextEnabled;
          this.toggleAutonext();
          break;
        case 'F11': // Fullscreen
          this.toggleFullscreen();
          break;
        case 'F10': // Focus Mode
          this.toggleFocusMode();
          break;
      }
    }
  }
});

// Mount the Vue app
app.mount('#app');