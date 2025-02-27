// Initialize Vue application
const { createApp } = Vue;

// Add utility functions to the renderer process
// These were moved from preload.js to avoid object cloning issues
function predictPostLikelihood(post, profile, tagWeight = 0.7, ratingWeight = 0.3) {
  const tags = post.tag_string ? post.tag_string.split(' ') : [];
  const rating = post.rating || '';
  
  // User-specific scores and totals
  const tagScores = profile.tag_scores || {};
  const tagTotals = profile.tag_totals || {};
  const ratingScores = profile.rating_scores || {};
  const ratingTotals = profile.rating_totals || {};
  
  let tagScore = 0;
  let ratingScore = 0;
  
  // Apply Laplace smoothing for tag scores
  for (const tag of tags) {
    // User's interaction with the tag
    const netScore = tagScores[tag] || 0;
    const total = tagTotals[tag] || 0;
    
    // Apply Laplace smoothing to handle rare or unseen tags
    const smoothedScore = (netScore + 1) / (total + 2);
    tagScore += smoothedScore;
  }
  
  if (tags.length > 0) {
    tagScore /= tags.length;  // Average over number of tags
  } else {
    // If there are no tags, assign a neutral score of 0.5
    tagScore = 0.5;
  }
  
  // Apply Laplace smoothing for rating scores
  const netRatingScore = ratingScores[rating] || 0;
  const totalRating = ratingTotals[rating] || 0;
  
  let smoothedRatingScore;
  if (totalRating > 0) {
    smoothedRatingScore = (netRatingScore + 1) / (totalRating + 2);
  } else {
    // Assign a neutral score for unseen ratings
    smoothedRatingScore = 0.5;
  }
  
  ratingScore = smoothedRatingScore;
  
  // Normalize weights
  const totalWeight = tagWeight + ratingWeight;
  const tagWeightNormalized = tagWeight / totalWeight;
  const ratingWeightNormalized = ratingWeight / totalWeight;
  
  // Combine scores with normalized weighting
  const totalScore = (tagWeightNormalized * tagScore) + (ratingWeightNormalized * ratingScore);
  
  // Scale total score to a probability between 0 and 1 using the sigmoid function
  const likelihood = 1 / (1 + Math.exp(-5 * (totalScore - 0.5)));
  
  return likelihood;
}

function updateProfileIncrementally(post, status, profile) {
  const tags = post.tag_string ? post.tag_string.split(' ') : [];
  const rating = post.rating || '';
  let increment;
  
  if (status === 'liked') {
    increment = 1;
    profile.total_liked = (profile.total_liked || 0) + 1;
  } else if (status === 'super liked') {
    increment = 3;
    profile.total_liked = (profile.total_liked || 0) + 10;
  } else if (status === 'disliked') {
    increment = -1;
    profile.total_disliked = (profile.total_disliked || 0) + 1;
  } else {
    return profile;  // Do nothing for other statuses
  }
  
  // Initialize objects if they don't exist
  profile.tag_scores = profile.tag_scores || {};
  profile.tag_totals = profile.tag_totals || {};
  profile.rating_scores = profile.rating_scores || {};
  profile.rating_totals = profile.rating_totals || {};
  
  for (const tag of tags) {
    profile.tag_scores[tag] = (profile.tag_scores[tag] || 0) + increment;
    profile.tag_totals[tag] = (profile.tag_totals[tag] || 0) + 1;
  }
  
  profile.rating_scores[rating] = (profile.rating_scores[rating] || 0) + increment;
  profile.rating_totals[rating] = (profile.rating_totals[rating] || 0) + 1;
  
  return profile;
}

// Function to create a simplified profile suitable for serialization
function createSerializableProfile(profile) {
  // Create a new object with only the data needed for storage
  const serializableProfile = {
    tag_scores: profile.tag_scores || {},
    tag_totals: profile.tag_totals || {},
    rating_scores: profile.rating_scores || {},
    rating_totals: profile.rating_totals || {},
    total_liked: profile.total_liked || 0,
    total_disliked: profile.total_disliked || 0
  };
  
  return serializableProfile;
}

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
      
      // Video control states
      showCustomControls: false,
      isPlaying: false,
      isMuted: false,
      
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
        
        // Get last accessed time from database or localStorage if DB fails
        let dbTimestamp;
        try {
          dbTimestamp = await window.api.getSetting('last_time_app_accessed', currentTime.toString());
        } catch (err) {
          console.warn("Failed to get setting from database, using localStorage:", err);
          dbTimestamp = localStorage.getItem('last_time_app_accessed') || currentTime.toString();
        }
        const dbTimestampObj = new Date(dbTimestamp);
        
        // Check if more than 30 minutes have passed
        const timeDiff = currentTime - dbTimestampObj;
        if (timeDiff > 30 * 60 * 1000) {
          this.page = 1;
          
          // Reset pages for all combinations of rating and media types
          for (const rating of this.ratingOptions) {
            for (const media of this.mediaOptions) {
              try {
                await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
              } catch (err) {
                console.warn("Failed to save setting to database, using localStorage:", err);
                localStorage.setItem(`last_used_page_(${rating})_(${media})`, 1);
              }
            }
          }
          
          // Update last access time
          try {
            await window.api.setSetting('last_time_app_accessed', currentTime.toString());
          } catch (err) {
            console.warn("Failed to save setting to database, using localStorage:", err);
            localStorage.setItem('last_time_app_accessed', currentTime.toString());
          }
        } else {
          // Get the last used page for current rating and media selection
          try {
            this.page = parseInt(await window.api.getSetting(
              `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
          } catch (err) {
            console.warn("Failed to get setting from database, using localStorage:", err);
            this.page = parseInt(localStorage.getItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`) || '1');
          }
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
          // Check if post is already seen, use localStorage as fallback
          let isSeen;
          try {
            isSeen = await window.api.isSeen(post.id);
          } catch (err) {
            console.warn("Database operation failed, using localStorage:", err);
            isSeen = localStorage.getItem(`seen_post_${post.id}`) === 'true';
          }
          
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
          
          // Save the current page, use localStorage as fallback
          try {
            await window.api.setSetting(
              `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 
              this.page
            );
            await window.api.setSetting('last_time_app_accessed', new Date().toString());
          } catch (err) {
            console.warn("Database operation failed, using localStorage:", err);
            localStorage.setItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
            localStorage.setItem('last_time_app_accessed', new Date().toString());
          }
          
        } else {
          console.log("No new posts found on current page, trying next page");
          this.page++;
          
          // Save the current page, use localStorage as fallback
          try {
            await window.api.setSetting(
              `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 
              this.page
            );
            await window.api.setSetting('last_time_app_accessed', new Date().toString());
          } catch (err) {
            console.warn("Database operation failed, using localStorage:", err);
            localStorage.setItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
            localStorage.setItem('last_time_app_accessed', new Date().toString());
          }
          
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
        
        // Create a safe, simplified version of the post with only the needed properties
        const safePost = {
          id: post.id,
          file_url: post.file_url,
          large_file_url: post.large_file_url,
          preview_file_url: post.preview_file_url,
          tag_string: post.tag_string || '',
          rating: post.rating || '',
          score: post.score || 0,
          file_ext: post.file_ext || '',
          image_height: post.image_height,
          image_width: post.image_width
        };
        
        this.currentPost = safePost;
        
        // Mark post as seen, use localStorage as fallback
        try {
          await window.api.markAsSeen(safePost.id, safePost.tag_string, safePost.rating);
        } catch (err) {
          console.warn("Database operation failed, using localStorage:", err);
          localStorage.setItem(`seen_post_${safePost.id}`, 'true');
        }
        
        // Calculate post likelihood score
        if (this.userProfile) {
          try {
            // Create a simplified version of the post for prediction
            const predictionPost = {
              id: safePost.id,
              tag_string: safePost.tag_string,
              rating: safePost.rating
            };
            this.postLikelihood = predictPostLikelihood(predictionPost, this.userProfile);
            console.log(`Predicted likelihood score for this post: ${this.postLikelihood * 100}%`);
          } catch (err) {
            console.error("Error calculating post likelihood:", err);
            this.postLikelihood = 0.5; // default to neutral
          }
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
                
                // As a last resort, try loading directly from the URL
                console.log("Attempting to load media directly from URL");
                this.mediaUrl = safePost.large_file_url || safePost.file_url;
              }
            } else {
              // Fallback to direct URL
              this.mediaUrl = safePost.file_url;
            }
          }
        }
        
        console.log(`Showing post ID: ${safePost.id}, Score: ${safePost.score}`);
      } catch (error) {
        console.error("Error showing post:", error);
        this.loading = false;
      }
    },
    
    // Media event handlers
    mediaLoaded() {
      this.loading = false;
      
      // Special handling for video elements to ensure proper sizing and controls positioning
      if (this.currentPost && this.isVideo(this.currentPost) && this.$refs.videoPlayer) {
        // Give the video a moment to initialize
        setTimeout(() => {
          const video = this.$refs.videoPlayer;
          
          // Ensure video is sized properly relative to its container
          if (video.videoWidth && video.videoHeight) {
            // Set inline styles to maintain aspect ratio
            const aspectRatio = video.videoWidth / video.videoHeight;
            
            // Apply styles based on aspect ratio
            if (aspectRatio > 1) { // Wider video
              video.style.width = '100%';
              video.style.height = 'auto';
            } else { // Taller video
              video.style.height = '100%';
              video.style.width = 'auto';
            }
          }
          
          // Force controls to be visible
          video.controls = true;
          
          // Test if native controls work by checking if they're visibly rendered
          const testControlsVisibility = () => {
            // If we can't detect native controls after a few seconds, enable custom controls
            setTimeout(() => {
              // Try to manually show controls
              video.dispatchEvent(new MouseEvent('mouseover', {
                'view': window,
                'bubbles': true,
                'cancelable': true
              }));
              
              // Check if controls are accessible by testing player features
              try {
                if (!video.controls || getComputedStyle(video).pointerEvents === 'none') {
                  console.log('Native controls might not be accessible, enabling custom controls');
                  this.showCustomControls = true;
                  this.isPlaying = !video.paused;
                  this.isMuted = video.muted;
                }
              } catch (e) {
                console.error('Error checking controls visibility:', e);
                this.showCustomControls = true;  // Enable custom controls as a fallback
              }
            }, 1500);  // Wait for controls to render
          };
          
          testControlsVisibility();
          
          // Set up custom override for media controls
          video.style.pointerEvents = 'auto';
          
          // Remove any style/attribute that might interfere with controls
          video.style.zIndex = '1';
          video.style.position = 'relative';
          
          // Ensure autoplay works properly
          video.muted = false; // Unmute by default (many browsers only allow autoplay if muted)
          
          // Add event listeners for player state
          video.addEventListener('play', () => {
            this.isPlaying = true;
          });
          
          video.addEventListener('pause', () => {
            this.isPlaying = false;
          });
          
          video.addEventListener('volumechange', () => {
            this.isMuted = video.muted;
          });
          
          // Monitor mouse movement over video to display controls
          video.addEventListener('mousemove', (e) => {
            video.controls = true; // Force controls to show
            
            // Explicitly show controls via DOM manipulation
            const showControls = () => {
              const mediaControls = video.querySelector('::-webkit-media-controls');
              if (mediaControls) {
                mediaControls.style.display = 'flex';
                mediaControls.style.opacity = '1';
                mediaControls.style.visibility = 'visible';
              }
            };
            
            // Try to force controls to show
            try {
              showControls();
            } catch(e) {
              console.warn('Could not directly manipulate media controls:', e);
            }
          });
          
          // Special override for Firefox and browsers with broken controls
          video.addEventListener('click', (e) => {
            // For browsers where controls don't show, toggle play/pause on click
            if (!this.showCustomControls) {
              if (video.paused) {
                video.play();
              } else {
                video.pause();
              }
            }
          });
          
          console.log('Video control handlers initialized');
        }, 100);
      }
    },
    
    // Custom video control functions
    togglePlay() {
      if (!this.$refs.videoPlayer) return;
      const video = this.$refs.videoPlayer;
      
      if (video.paused) {
        video.play();
        this.isPlaying = true;
      } else {
        video.pause();
        this.isPlaying = false;
      }
    },
    
    toggleMute() {
      if (!this.$refs.videoPlayer) return;
      const video = this.$refs.videoPlayer;
      
      video.muted = !video.muted;
      this.isMuted = video.muted;
    },
    
    seekVideo(e) {
      if (!this.$refs.videoPlayer || !this.$refs.customTimeline) return;
      
      const video = this.$refs.videoPlayer;
      const timeline = this.$refs.customTimeline;
      
      // Calculate seek position based on click position within timeline
      const rect = timeline.getBoundingClientRect();
      const seekPos = (e.clientX - rect.left) / rect.width;
      
      // Set new time
      video.currentTime = video.duration * seekPos;
      this.updateCustomProgressBar();
    },
    
    updateCustomProgressBar() {
      if (!this.$refs.videoPlayer || !this.$refs.customProgress || !this.showCustomControls) return;
      
      const video = this.$refs.videoPlayer;
      const progress = this.$refs.customProgress;
      
      // Update progress bar width
      const progressPercent = (video.currentTime / video.duration) * 100;
      progress.style.width = `${progressPercent}%`;
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
        try {
          await window.api.setSetting(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
          await window.api.setSetting('last_time_app_accessed', new Date().toString());
        } catch (err) {
          console.warn("Database operation failed, using localStorage:", err);
          localStorage.setItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
          localStorage.setItem('last_time_app_accessed', new Date().toString());
        }
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
      
      try {
        await window.api.markPostStatus(post.id, 'liked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'liked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile
      this.userProfile = updateProfileIncrementally(post, 'liked', this.userProfile);
      
      try {
        // Create a simplified version of the profile for IPC transfer
        const serializableProfile = createSerializableProfile(this.userProfile);
        await window.api.saveUserProfile(serializableProfile);
      } catch (err) {
        console.warn("Failed to save user profile to database:", err);
        // Store a simplified version in localStorage
        localStorage.setItem('user_profile', JSON.stringify(createSerializableProfile(this.userProfile)));
      }
      
      await this.nextPost();
    },
    
    async superLikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      try {
        await window.api.markPostStatus(post.id, 'super liked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'super liked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile
      this.userProfile = updateProfileIncrementally(post, 'super liked', this.userProfile);
      try {
        // Create a simplified version of the profile for IPC transfer
        const serializableProfile = createSerializableProfile(this.userProfile);
        await window.api.saveUserProfile(serializableProfile);
      } catch (err) {
        console.warn("Failed to save user profile to database:", err);
        // Store a simplified version in localStorage
        localStorage.setItem('user_profile', JSON.stringify(createSerializableProfile(this.userProfile)));
      }
      
      await this.nextPost();
    },
    
    async dislikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      try {
        await window.api.markPostStatus(post.id, 'disliked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'disliked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile
      this.userProfile = updateProfileIncrementally(post, 'disliked', this.userProfile);
      try {
        // Create a simplified version of the profile for IPC transfer
        const serializableProfile = createSerializableProfile(this.userProfile);
        await window.api.saveUserProfile(serializableProfile);
      } catch (err) {
        console.warn("Failed to save user profile to database:", err);
        // Store a simplified version in localStorage
        localStorage.setItem('user_profile', JSON.stringify(createSerializableProfile(this.userProfile)));
      }
      
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
            try {
              await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
            } catch (err) {
              console.warn("Failed to save setting to database, using localStorage:", err);
              localStorage.setItem(`last_used_page_(${rating})_(${media})`, 1);
            }
          }
        }
        try {
          await window.api.setSetting('last_time_app_accessed', currentTime.toString());
        } catch (err) {
          console.warn("Failed to save setting to database, using localStorage:", err);
          localStorage.setItem('last_time_app_accessed', currentTime.toString());
        }
      } else {
        try {
          this.page = parseInt(await window.api.getSetting(
            `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
        } catch (err) {
          console.warn("Failed to get setting from database, using localStorage:", err);
          this.page = parseInt(localStorage.getItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`) || '1');
        }
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
            try {
              await window.api.setSetting(`last_used_page_(${rating})_(${media})`, 1);
            } catch (err) {
              console.warn("Failed to save setting to database, using localStorage:", err);
              localStorage.setItem(`last_used_page_(${rating})_(${media})`, 1);
            }
          }
        }
        try {
          await window.api.setSetting('last_time_app_accessed', currentTime.toString());
        } catch (err) {
          console.warn("Failed to save setting to database, using localStorage:", err);
          localStorage.setItem('last_time_app_accessed', currentTime.toString());
        }
      } else {
        try {
          this.page = parseInt(await window.api.getSetting(
            `last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, 1));
        } catch (err) {
          console.warn("Failed to get setting from database, using localStorage:", err);
          this.page = parseInt(localStorage.getItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`) || '1');
        }
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