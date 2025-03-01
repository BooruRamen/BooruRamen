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
      theaterMode: false, // Changed from focusMode to theaterMode
      
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
      autonextOnVideoCompletion: true, // New property for video completion auto next
      
      // User profile data
      userProfile: null,
      postLikelihood: null,
      
      // Current post data
      currentPost: null,
      
      // Media content URL (after fetching)
      mediaUrl: null,
      
      // Favorite tags data
      topTags: [],
      topTagCombinations: [],

      // Sidebar state - new property
      sidebarExpanded: false,

      preferredTags: '',
      blacklistedTags: ''
    };
  },
  
  async mounted() {
    // Initialize the app
    await this.initApp();
    
    // Fetch posts
    await this.fetchAndUpdatePosts();
    
    // Add keyboard event listeners
    document.addEventListener('keydown', this.handleKeyPress);

    // Add event listener for ESC key to exit theater mode
    document.addEventListener('keydown', this.handleEscapeKey);

    // Add event listener for clicks outside the media to exit theater mode
    document.addEventListener('click', this.handleOutsideClick);
  },
  
  beforeUnmount() {
    // Clean up event listeners
    document.removeEventListener('keydown', this.handleKeyPress);
    document.removeEventListener('keydown', this.handleEscapeKey);
    document.removeEventListener('click', this.handleOutsideClick);
    this.stopAutonext();
  },
  
  methods: {
    // Toggle sidebar - new method
    toggleSidebar() {
      this.sidebarExpanded = !this.sidebarExpanded;
      console.log(`Sidebar ${this.sidebarExpanded ? 'expanded' : 'collapsed'}`);
    },

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
          
          // Create a batch of settings to initialize
          const settingsToInitialize = {};
          
          // Prepare settings for all combinations of rating and media types
          for (const rating of this.ratingOptions) {
            for (const media of this.mediaOptions) {
              settingsToInitialize[`last_used_page_(${rating})_(${media})`] = 1;
            }
          }
          
          // Add the last access time setting
          settingsToInitialize['last_time_app_accessed'] = currentTime.toString();
          
          // Save all settings in a single batch operation
          try {
            await window.api.setSettingsBatch(settingsToInitialize);
          } catch (err) {
            console.warn("Failed to save settings to database, using localStorage:", err);
            // Fallback to localStorage
            Object.entries(settingsToInitialize).forEach(([key, value]) => {
              localStorage.setItem(key, value);
            });
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

        // Load tag preferences
        try {
          const preferredTags = await window.api.getPreferredTags();
          this.preferredTags = preferredTags.join(', ');
          
          const blacklistedTags = await window.api.getBlacklistedTags();
          this.blacklistedTags = blacklistedTags.join(', ');
          
          console.log(`Loaded ${preferredTags.length} preferred tags and ${blacklistedTags.length} blacklisted tags`);
        } catch (err) {
          console.error("Error loading tag preferences:", err);
        }

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
            ratingTags = '(rating:general OR rating:sensitive)';
            break;
          case 'General, Sensitive, and Questionable':
            ratingTags = '(rating:general OR rating:sensitive OR rating:questionable)';
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
        
        // Build the base tags parameter based on media option
        const baseTags = [];
        
        if (this.selectedMedia === 'Video Only') {
          baseTags.push('animated');
        } else if (this.selectedMedia === 'Images Only') {
          baseTags.push('-animated');
        }
        
        if (ratingTags) {
          baseTags.push(ratingTags);
        }

        // Get array of preferred tags
        const preferredTagsArray = this.preferredTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);

        // If we have no preferred tags, just do a standard query
        if (preferredTagsArray.length === 0) {
          const apiUrl = `https://danbooru.donmai.us/posts.json?limit=20&page=${this.page}&tags=${encodeURIComponent(baseTags.join(' '))}`;
          console.log(`No preferred tags. Fetching posts with: Page ${this.page}, Tags: ${baseTags.join(' ')}`);
          
          const response = await fetch(apiUrl);
          if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
          }
          
          const posts = await response.json();
          await this.processAndFilterPosts(posts);
          return;
        }

        // If we have preferred tags, run parallel queries for each tag/combination
        console.log(`Running parallel queries for ${preferredTagsArray.length} preferred tags`);
        
        // Array to hold all posts from different queries
        let allPosts = [];
        
        // Create an array of promises for all the fetch operations
        const fetchPromises = preferredTagsArray.map(async (tagOrCombo) => {
          const tagsCopy = [...baseTags]; // Clone the base tags array
          
          // Process tag combinations (tagA+tagB) or individual tags
          if (tagOrCombo.includes('+')) {
            const combinedTags = tagOrCombo.split('+').map(tag => tag.trim());
            combinedTags.forEach(tag => {
              if (tag.length > 0) {
                tagsCopy.push(tag);
              }
            });
            console.log(`Creating query for combined tags: ${combinedTags.join(' + ')}`);
          } else {
            tagsCopy.push(tagOrCombo);
            console.log(`Creating query for tag: ${tagOrCombo}`);
          }
          
          const tagsStr = tagsCopy.join(' ');
          const apiUrl = `https://danbooru.donmai.us/posts.json?limit=10&page=${this.page}&tags=${encodeURIComponent(tagsStr)}`;
          
          try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
              console.warn(`API request for tag ${tagOrCombo} failed: ${response.status}`);
              return [];
            }
            
            const posts = await response.json();
            console.log(`Received ${posts.length} posts for query with tag: ${tagOrCombo}`);
            return posts;
          } catch (error) {
            console.error(`Error fetching posts for tag ${tagOrCombo}:`, error);
            return [];
          }
        });
        
        // Wait for all fetch operations to complete
        const postsArrays = await Promise.all(fetchPromises);
        
        // Combine all posts into a single array
        postsArrays.forEach(posts => {
          if (posts && posts.length > 0) {
            allPosts = [...allPosts, ...posts];
          }
        });
        
        // Remove duplicates based on post ID
        const uniquePosts = [];
        const seenIds = new Set();
        
        for (const post of allPosts) {
          if (!seenIds.has(post.id)) {
            uniquePosts.push(post);
            seenIds.add(post.id);
          }
        }
        
        console.log(`Total unique posts after parallel queries: ${uniquePosts.length}`);
        
        // Process the combined result through recommendation system if available
        if (this.userProfile && uniquePosts.length > 0) {
          try {
            // Score each post using the recommendation system
            uniquePosts.forEach(post => {
              post.recommendationScore = predictPostLikelihood(post, this.userProfile);
            });
            
            // Sort by recommendation score (highest first)
            uniquePosts.sort((a, b) => b.recommendationScore - a.recommendationScore);
            
            console.log(`Posts sorted by recommendation score. Top post score: ${uniquePosts[0].recommendationScore}`);
          } catch (err) {
            console.error("Error scoring posts with recommendation system:", err);
          }
        }
        
        // Process and filter the combined results
        await this.processAndFilterPosts(uniquePosts);
        
      } catch (error) {
        console.error("Error fetching posts:", error);
        this.loading = false;
      }
    },
    
    // Helper method to process and filter posts
    async processAndFilterPosts(posts) {
      try {
        // Batch check all posts at once to see if they are already seen
        const postIds = posts.map(post => post.id);
        let seenMap = {};
        
        try {
          // Use the batch check method
          seenMap = await window.api.arePostsSeen(postIds);
        } catch (err) {
          console.warn("Batch database operation failed, using localStorage:", err);
          // Fallback to localStorage
          seenMap = {};
          postIds.forEach(id => {
            seenMap[id] = localStorage.getItem(`seen_post_${id}`) === 'true';
          });
        }
        
        // Filter by score and seen status
        const filteredPosts = posts.filter(post => {
          // Check if post is already seen using our batch results
          const isSeen = seenMap[post.id] === true;
          
          // Get the post's tags as an array
          const postTags = post.tag_string ? post.tag_string.split(' ') : [];
          
          // Check if the post has any blacklisted tags
          const blacklistedTagsArray = this.blacklistedTags
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
            
          const hasBlacklistedTag = blacklistedTagsArray.length > 0 && 
            postTags.some(tag => blacklistedTagsArray.includes(tag));
          
          // Only include posts with score >= 0, not seen, and not containing blacklisted tags
          if (!isSeen && post.score >= 0 && !hasBlacklistedTag) {
            // Filter based on media type if needed
            const isVideo = this.isVideo(post);
            return (
              (this.selectedMedia === 'Video Only' && isVideo) ||
              (this.selectedMedia === 'Images Only' && !isVideo) ||
              this.selectedMedia === 'Video and Images'
            );
          }
          
          return false;
        });

        // Get preferred tags as array for highlighting
        const preferredTagsArray = this.preferredTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0)
          .flatMap(tag => tag.includes('+') ? tag.split('+').map(t => t.trim()) : [tag]);
        
        console.log(`Filtered to ${filteredPosts.length} new posts that match criteria`);
        
        if (filteredPosts.length > 0) {
          this.posts = filteredPosts;
          this.currentIndex = 0;
          await this.showPost(this.currentIndex);
          
          // Save current page and last access time in a batch operation
          const settings = {
            [`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`]: this.page,
            'last_time_app_accessed': new Date().toString()
          };
          
          try {
            await window.api.setSettingsBatch(settings);
          } catch (err) {
            console.warn("Database operation failed, using localStorage:", err);
            localStorage.setItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
            localStorage.setItem('last_time_app_accessed', new Date().toString());
          }
          
        } else {
          console.log("No new posts found on current page, trying next page");
          this.page++;
          
          // Save current page and last access time in a batch operation
          const settings = {
            [`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`]: this.page,
            'last_time_app_accessed': new Date().toString()
          };
          
          try {
            await window.api.setSettingsBatch(settings);
          } catch (err) {
            console.warn("Database operation failed, using localStorage:", err);
            localStorage.setItem(`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`, this.page);
            localStorage.setItem('last_time_app_accessed', new Date().toString());
          }
          
          await this.fetchAndUpdatePosts(); // Try the next page
        }
      } catch (error) {
        console.error("Error processing posts:", error);
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
        
        // Check for preloaded media first
        const preloadedMedia = await window.api.getPreloadedMedia(safePost.id);
        if (preloadedMedia) {
          console.log("Using preloaded media for post:", safePost.id);
          this.mediaUrl = preloadedMedia;
        } else {
          // Fetch media using the API's fetchMedia function if not preloaded
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
        }
        
        // If this is not the last post, preload the next post in the background
        if (index < this.posts.length - 1) {
          const nextPost = this.posts[index + 1];
          if (nextPost) {
            // Create a serializable version of the next post for preloading
            const preloadPost = {
              id: nextPost.id,
              file_url: nextPost.file_url,
              large_file_url: nextPost.large_file_url,
              preview_file_url: nextPost.preview_file_url,
              tag_string: nextPost.tag_string || '',
              rating: nextPost.rating || '',
              score: nextPost.score || 0,
              file_ext: nextPost.file_ext || ''
            };
            
            // Recommendation engine will handle the actual preloading
            try {
              await window.api.recommendPosts([preloadPost]);
            } catch (err) {
              console.warn("Failed to trigger preload for next post:", err);
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
      
      // Set up video controls after loading
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
          
          // Remove any previous event listeners to avoid duplicates
          video.removeEventListener('ended', this.videoEndedHandler);
          video.removeEventListener('play', this.videoPlayHandler);
          video.removeEventListener('pause', this.videoPauseHandler);
          video.removeEventListener('volumechange', this.videoVolumeChangeHandler);
          
          // Add event listeners for player state
          this.videoPlayHandler = () => {
            this.isPlaying = true;
          };
          
          this.videoPauseHandler = () => {
            this.isPlaying = false;
          };
          
          this.videoVolumeChangeHandler = () => {
            this.isMuted = video.muted;
          };
          
          // Add event listener for video completion
          this.videoEndedHandler = () => {
            console.log('Video ended event triggered');
            // Auto advance to next post when video ends if enabled
            if (this.autonextEnabled && this.autonextOnVideoCompletion) {
              console.log('Auto Next enabled and Video Completion enabled - advancing to next post');
              this.nextPost();
            } else {
              // Only restart if looping is desired (Auto Next disabled or video completion option off)
              if (!this.autonextEnabled || !this.autonextOnVideoCompletion) {
                console.log('Either Auto Next is disabled or Video Completion is disabled - restarting video');
                video.currentTime = 0;
                video.play();
              }
            }
          };
          
          // Attach the event listeners
          video.addEventListener('play', this.videoPlayHandler);
          video.addEventListener('pause', this.videoPauseHandler);
          video.addEventListener('volumechange', this.videoVolumeChangeHandler);
          video.addEventListener('ended', this.videoEndedHandler);
          
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
          console.log('Auto Next:', this.autonextEnabled ? 'Enabled' : 'Disabled');
          console.log('Auto Next on Video Completion:', this.autonextOnVideoCompletion ? 'Enabled' : 'Disabled');
          console.log('Video will loop:', (!this.autonextEnabled || !this.autonextOnVideoCompletion) ? 'Yes' : 'No');
        }, 100);
      }
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
        
        // Save current page and last access time in a batch operation
        const settings = {
          [`last_used_page_(${this.selectedRating})_(${this.selectedMedia})`]: this.page,
          'last_time_app_accessed': new Date().toString()
        };
        
        try {
          await window.api.setSettingsBatch(settings);
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
      
      // Create a minimal serializable version of the post
      const serializablePost = {
        id: post.id,
        tag_string: post.tag_string || '',
        rating: post.rating || '',
        score: post.score || 0
      };

      try {
        await window.api.markPostStatus(post.id, 'liked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'liked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile with full post data
      this.userProfile = updateProfileIncrementally(post, 'liked', this.userProfile);
      
      try {
        // Create a minimal serializable profile
        const serializableProfile = {
          tag_scores: {},
          tag_totals: {},
          rating_scores: {},
          rating_totals: {},
          total_liked: this.userProfile.total_liked || 0,
          total_disliked: this.userProfile.total_disliked || 0
        };

        // Only copy the necessary data
        if (this.userProfile.tag_scores) {
          Object.keys(this.userProfile.tag_scores).forEach(key => {
            serializableProfile.tag_scores[key] = this.userProfile.tag_scores[key];
          });
        }
        if (this.userProfile.tag_totals) {
          Object.keys(this.userProfile.tag_totals).forEach(key => {
            serializableProfile.tag_totals[key] = this.userProfile.tag_totals[key];
          });
        }
        if (this.userProfile.rating_scores) {
          Object.keys(this.userProfile.rating_scores).forEach(key => {
            serializableProfile.rating_scores[key] = this.userProfile.rating_scores[key];
          });
        }
        if (this.userProfile.rating_totals) {
          Object.keys(this.userProfile.rating_totals).forEach(key => {
            serializableProfile.rating_totals[key] = this.userProfile.rating_totals[key];
          });
        }
        
        // Save profile and initialize recommendation engine
        await Promise.all([
          window.api.saveUserProfile(serializableProfile),
          window.api.initializeRecommendationEngine(serializableProfile)
        ]);
        
        // Update recommendation profile with minimal post data
        await window.api.updateRecommendationProfile(serializablePost, 'liked');
      } catch (err) {
        console.warn("Failed to save user profile or update recommendations:", err);
        // Store a simplified version in localStorage as fallback
        localStorage.setItem('user_profile', JSON.stringify(createSerializableProfile(this.userProfile)));
      }
      
      await this.nextPost();
    },
    
    async superLikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      
      // Create a minimal serializable version of the post
      const serializablePost = {
        id: post.id,
        tag_string: post.tag_string || '',
        rating: post.rating || '',
        score: post.score || 0
      };

      try {
        await window.api.markPostStatus(post.id, 'super liked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'super liked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile with full post data
      this.userProfile = updateProfileIncrementally(post, 'super liked', this.userProfile);
      
      try {
        // Create a minimal serializable profile
        const serializableProfile = {
          tag_scores: {},
          tag_totals: {},
          rating_scores: {},
          rating_totals: {},
          total_liked: this.userProfile.total_liked || 0,
          total_disliked: this.userProfile.total_disliked || 0
        };

        // Only copy the necessary data
        if (this.userProfile.tag_scores) {
          Object.keys(this.userProfile.tag_scores).forEach(key => {
            serializableProfile.tag_scores[key] = this.userProfile.tag_scores[key];
          });
        }
        if (this.userProfile.tag_totals) {
          Object.keys(this.userProfile.tag_totals).forEach(key => {
            serializableProfile.tag_totals[key] = this.userProfile.tag_totals[key];
          });
        }
        if (this.userProfile.rating_scores) {
          Object.keys(this.userProfile.rating_scores).forEach(key => {
            serializableProfile.rating_scores[key] = this.userProfile.rating_scores[key];
          });
        }
        if (this.userProfile.rating_totals) {
          Object.keys(this.userProfile.rating_totals).forEach(key => {
            serializableProfile.rating_totals[key] = this.userProfile.rating_totals[key];
          });
        }
        
        // Save profile and initialize recommendation engine
        await Promise.all([
          window.api.saveUserProfile(serializableProfile),
          window.api.initializeRecommendationEngine(serializableProfile)
        ]);
        
        // Update recommendation profile with minimal post data
        await window.api.updateRecommendationProfile(serializablePost, 'super liked');
      } catch (err) {
        console.warn("Failed to save user profile or update recommendations:", err);
        // Store a simplified version in localStorage as fallback
        localStorage.setItem('user_profile', JSON.stringify(createSerializableProfile(this.userProfile)));
      }
      
      await this.nextPost();
    },
    
    async dislikePost() {
      if (!this.currentPost) return;
      
      const post = this.currentPost;
      
      // Create a minimal serializable version of the post
      const serializablePost = {
        id: post.id,
        tag_string: post.tag_string || '',
        rating: post.rating || '',
        score: post.score || 0
      };

      try {
        await window.api.markPostStatus(post.id, 'disliked', post.tag_string || '', post.rating || '');
      } catch (err) {
        console.warn("Database operation failed, using localStorage:", err);
        localStorage.setItem(`post_status_${post.id}`, 'disliked');
        localStorage.setItem(`post_tags_${post.id}`, post.tag_string || '');
        localStorage.setItem(`post_rating_${post.id}`, post.rating || '');
      }
      
      // Update user profile with full post data
      this.userProfile = updateProfileIncrementally(post, 'disliked', this.userProfile);
      
      try {
        // Create a minimal serializable profile
        const serializableProfile = {
          tag_scores: {},
          tag_totals: {},
          rating_scores: {},
          rating_totals: {},
          total_liked: this.userProfile.total_liked || 0,
          total_disliked: this.userProfile.total_disliked || 0
        };

        // Only copy the necessary data
        if (this.userProfile.tag_scores) {
          Object.keys(this.userProfile.tag_scores).forEach(key => {
            serializableProfile.tag_scores[key] = this.userProfile.tag_scores[key];
          });
        }
        if (this.userProfile.tag_totals) {
          Object.keys(this.userProfile.tag_totals).forEach(key => {
            serializableProfile.tag_totals[key] = this.userProfile.tag_totals[key];
          });
        }
        if (this.userProfile.rating_scores) {
          Object.keys(this.userProfile.rating_scores).forEach(key => {
            serializableProfile.rating_scores[key] = this.userProfile.rating_scores[key];
          });
        }
        if (this.userProfile.rating_totals) {
          Object.keys(this.userProfile.rating_totals).forEach(key => {
            serializableProfile.rating_totals[key] = this.userProfile.rating_totals[key];
          });
        }
        
        // Save profile and initialize recommendation engine
        await Promise.all([
          window.api.saveUserProfile(serializableProfile),
          window.api.initializeRecommendationEngine(serializableProfile)
        ]);
        
        // Update recommendation profile with minimal post data
        await window.api.updateRecommendationProfile(serializablePost, 'disliked');
      } catch (err) {
        console.warn("Failed to save user profile or update recommendations:", err);
        // Store a simplified version in localStorage as fallback
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
        
        // Create settings batch for all combinations
        const settingsToUpdate = {};
        for (const rating of this.ratingOptions) {
          for (const media of this.mediaOptions) {
            settingsToUpdate[`last_used_page_(${rating})_(${media})`] = 1;
          }
        }
        settingsToUpdate['last_time_app_accessed'] = currentTime.toString();
        
        try {
          await window.api.setSettingsBatch(settingsToUpdate);
        } catch (err) {
          console.warn("Failed to save settings to database, using localStorage:", err);
          Object.entries(settingsToUpdate).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
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
        
        // Create settings batch for all combinations
        const settingsToUpdate = {};
        for (const rating of this.ratingOptions) {
          for (const media of this.mediaOptions) {
            settingsToUpdate[`last_used_page_(${rating})_(${media})`] = 1;
          }
        }
        settingsToUpdate['last_time_app_accessed'] = currentTime.toString();
        
        try {
          await window.api.setSettingsBatch(settingsToUpdate);
        } catch (err) {
          console.warn("Failed to save settings to database, using localStorage:", err);
          Object.entries(settingsToUpdate).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
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
    async openInBrowser(usePrivate = false) {
      if (!this.currentPost) return;
      const postId = this.currentPost.id;
      const url = `https://danbooru.donmai.us/posts/${postId}`;
      
      if (usePrivate) {
        await window.api.openPrivateWindow(url);
      } else {
        await window.api.openInBrowser(url);
      }
    },
    
    copyToClipboard() {
      if (!this.currentPost) return;
      const postId = this.currentPost.id;
      const url = `https://danbooru.donmai.us/posts/${postId}`;
      navigator.clipboard.writeText(url)
        .then(() => console.log('URL copied to clipboard'))
        .catch(err => console.error('Failed to copy URL: ', err));
    },
    
    // Show favorites modal
    async showFavoriteTagsModal() {
      try {
        console.log("Fetching favorite tags...");
        // Get the top tags from the recommendation system
        this.topTags = await window.api.getTopUserTags(20);
        this.topTagCombinations = await window.api.getTopTagCombinations(10);
        
        console.log("Top tags:", this.topTags);
        console.log("Top tag combinations:", this.topTagCombinations);
        
        // Use Bootstrap's modal API to show the modal
        const favoriteTagsModal = new bootstrap.Modal(document.getElementById('favoriteTags'));
        favoriteTagsModal.show();
      } catch (error) {
        console.error("Error fetching favorite tags:", error);
      }
    },
    
    // Theater Mode - replacing focusMode
    toggleTheaterMode() {
      this.theaterMode = !this.theaterMode;
      if (this.theaterMode) {
        document.body.classList.add('theater-mode');
        console.log('Theater mode activated');
      } else {
        this.exitTheaterMode();
      }
    },

    // Method to exit theater mode
    exitTheaterMode() {
      this.theaterMode = false;
      document.body.classList.remove('theater-mode');
      console.log('Theater mode exited');
    },

    // Handle clicks outside the media element to exit theater mode
    handleOutsideClick(event) {
      // Only proceed if we're in theater mode
      if (!this.theaterMode) return;

      // Check if the click was on the theater-overlay (background)
      const overlay = document.querySelector('.theater-overlay');
      if (overlay && event.target === overlay) {
        this.exitTheaterMode();
      }
    },

    // Handle Escape key to exit theater mode
    handleEscapeKey(event) {
      if (event.key === 'Escape') {
        // Exit theater mode if active
        if (this.theaterMode) {
          this.exitTheaterMode();
        }
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
      
      // Start a new timer - only if we're not showing a video or if video completion auto-next is disabled
      if (!this.isVideo(this.currentPost) || !this.autonextOnVideoCompletion) {
        const intervalMs = parseFloat(this.autonextInterval) * 1000 || 5000;
        this.autonextTimerId = setInterval(() => {
          this.nextPost();
        }, intervalMs);
        
        console.log(`AutoNext started with interval: ${intervalMs}ms`);
      } else {
        console.log('AutoNext timer not started - using video completion instead');
      }
    },
    
    stopAutonext() {
      if (this.autonextTimerId) {
        clearInterval(this.autonextTimerId);
        this.autonextTimerId = null;
        console.log("AutoNext stopped");
      }
    },
    
    // Update AutoNext behavior when video completion setting changes
    updateAutonextBehavior() {
      if (this.autonextEnabled) {
        this.stopAutonext();
        this.startAutonext();
        
        // Update the loop attribute on video if it exists
        if (this.currentPost && this.isVideo(this.currentPost) && this.$refs.videoPlayer) {
          const video = this.$refs.videoPlayer;
          // Video should only loop if auto next is disabled or auto next on video completion is disabled
          video.loop = !this.autonextEnabled || !this.autonextOnVideoCompletion;
          console.log(`Video loop attribute updated: ${video.loop}`);
        }
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
        case 'F10': // Theater Mode (was Focus Mode)
          this.toggleTheaterMode();
          break;
        case 'S': // Toggle Sidebar
        case 's':
          this.toggleSidebar();
          break;
      }
    },

    // Save tag preferences
    async saveTagPreferences() {
      try {
        // Parse the comma-separated tags into arrays
        const preferredTagsArray = this.preferredTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);
          
        const blacklistedTagsArray = this.blacklistedTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);
        
        // Save to the backend
        await window.api.updatePreferredTags(preferredTagsArray);
        await window.api.updateBlacklistedTags(blacklistedTagsArray);
        
        console.log(`Saved ${preferredTagsArray.length} preferred tags and ${blacklistedTagsArray.length} blacklisted tags`);
        
        // Show confirmation
        alert('Tag preferences saved successfully!');
      } catch (error) {
        console.error("Error saving tag preferences:", error);
        alert('Error saving tag preferences. Please try again.');
      }
    },

    // Apply tag preferences and refresh content
    async applyTagPreferencesAndRefresh() {
      try {
        // First, save the tag preferences
        const preferredTagsArray = this.preferredTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);
          
        const blacklistedTagsArray = this.blacklistedTags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);
        
        // Save to the backend
        await window.api.updatePreferredTags(preferredTagsArray);
        await window.api.updateBlacklistedTags(blacklistedTagsArray);
        
        console.log(`Applied ${preferredTagsArray.length} preferred tags and ${blacklistedTagsArray.length} blacklisted tags`);
        
        // Refresh the content - reset the page and fetch new posts
        this.page = 1;
        this.posts = [];
        this.currentIndex = 0;
        
        // Clear any cached data
        await window.api.saveRecommendationModel();
        
        // Show a loading indicator
        this.loading = true;
        
        // Fetch posts with the updated preferences
        await this.fetchAndUpdatePosts();
        
        // Close the sidebar after applying
        this.sidebarExpanded = false;
      } catch (error) {
        console.error("Error applying tag preferences:", error);
        alert('Error applying tag preferences. Please try again.');
      }
    },
  },
  
  watch: {
    // Watch for changes in autonextOnVideoCompletion to update behavior
    autonextOnVideoCompletion() {
      this.updateAutonextBehavior();
      
      // Update the loop attribute on video if it exists
      if (this.currentPost && this.isVideo(this.currentPost) && this.$refs.videoPlayer) {
        const video = this.$refs.videoPlayer;
        // Video should only loop if auto next is disabled or auto next on video completion is disabled
        video.loop = !this.autonextEnabled || !this.autonextOnVideoCompletion;
        console.log(`Video loop attribute updated after video completion setting changed: ${video.loop}`);
      }
    },
    
    // Watch for changes in current post to adjust autonext behavior
    currentPost() {
      if (this.autonextEnabled) {
        this.updateAutonextBehavior();
      }
    }
  }
});

// Mount the Vue app
app.mount('#app');