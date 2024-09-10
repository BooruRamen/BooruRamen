const app = new Vue({
    el: '#app',
    template: `
    <div>
        <div v-if="!loggedIn">
            <h2>Login</h2>
            <input v-model="username" placeholder="Username">
            <input v-model="password" type="password" placeholder="Password">
            <button @click="login">Login</button>
            <button @click="register">Register</button>
        </div>
        <div v-else>
            <div v-if="currentContent" class="content-container">
                <div class="media-container">
                    <img v-if="currentContent.content_type === 'image'" 
                        :src="currentContent.currentUrl" 
                        @error="handleMediaError" 
                        @load="resetUrlIndex">
                    <video v-else-if="currentContent.content_type === 'video'" 
                        ref="videoPlayer"
                        loop 
                        muted 
                        playsinline
                        @error="handleMediaError" 
                        @loadedmetadata="onVideoLoaded">
                        <source :src="currentContent.file_url" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                <div class="tags-container">
                    <p>{{ currentContent.tags }}</p>
                </div>
                <div class="button-container">
                    <button @click="toggleMute">{{ isMuted ? 'Unmute' : 'Mute' }}</button>
                    <button @click="interact('like')">Like</button>
                    <button @click="interact('dislike')">Dislike</button>
                    <button @click="interact('favorite')">Favorite</button>
                </div>
            </div>
            <div v-else>
                <p>Loading content...</p>
            </div>
            <div class="navigation-container">
                <button @click="previousContent" :disabled="isLoading">Previous</button>
                <button @click="nextContent" :disabled="isLoading">Next</button>
            </div>
            <button @click="logout">Logout</button>
            
            <h3>Preferences</h3>
            <input v-model="preferredTags" placeholder="Preferred Tags (comma-separated)">
            <input v-model="blacklistedTags" placeholder="Blacklisted Tags (comma-separated)">
            <select v-model="contentTypePreference">
                <option value="both">Both</option>
                <option value="image">Images Only</option>
                <option value="video">Videos Only</option>
            </select>
            <button @click="updatePreferences">Update Preferences</button>
            <h3>Favorites</h3>
            <ul>
                <li v-for="favorite in favorites" :key="favorite.id">
                    <img v-if="favorite.content_type === 'image'" :src="favorite.url" width="100">
                    <video v-else-if="favorite.content_type === 'video'" width="100" controls>
                        <source :src="favorite.url" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    {{ favorite.tags }}
                </li>
            </ul>
        </div>
    </div>
    `,
    data: {
        loggedIn: false,
        username: '',
        password: '',
        preferredTags: '',
        blacklistedTags: '',
        contentTypePreference: 'both',
        currentContent: null,
        contentQueue: [],
        isLoading: false,
        favorites: [],
        page: 1,
        hasMoreContent: true,
        urlTypes: ['sample_url', 'file_url', 'alt_file_url'],
        currentUrlIndex: 0,
    },
    methods: {
        login() {
            console.log('Attempting login...');
            axios.post('/login', {
                username: this.username,
                password: this.password
            })
            .then(response => {
                console.log('Login response:', response.data);
                this.loggedIn = true;
                if (response.data.token) {
                    console.log('Token received, setting in localStorage');
                    localStorage.setItem('auth_token', response.data.token);
                    axios.defaults.headers.common['Authorization'] = 'Bearer ' + response.data.token;
                } else {
                    console.warn('No token received in login response');
                }
                this.loadContent('next');
            })
            .catch(error => {
                console.error('Login error:', error.response ? error.response.data : error.message);
                alert('Login failed. Please check your credentials and try again.');
            });
        },
        register() {
            axios.post('/register', {
                username: this.username,
                password: this.password
            })
            .then(response => {
                alert('Registered successfully. Please log in.');
            })
            .catch(error => {
                alert('Registration failed: ' + error.response.data.error);
            });
        },
        logout() {
            localStorage.removeItem('auth_token');
            delete axios.defaults.headers.common['Authorization'];
            this.loggedIn = false;
            this.username = '';
            this.password = '';
            this.currentContent = null;
            this.favorites = [];
        },
        updatePreferences() {
            axios.post('/update_preferences', {
                preferredTags: this.preferredTags,
                blacklistedTags: this.blacklistedTags,
                contentTypePreference: this.contentTypePreference
            })
            .then(response => {
                console.log('Preferences updated:', response.data);
                alert('Preferences updated successfully');
                this.loadContent('next');
            })
            .catch(error => {
                console.error('Error updating preferences:', error.response ? error.response.data : error.message);
                alert('Failed to update preferences. Please try again.');
            });
        },
        displayNextContent() {
            if (this.contentQueue.length > 0) {
                this.currentContent = this.prepareContentForDisplay(this.contentQueue.shift());
                this.isLoading = false;
                if (this.contentQueue.length < 3) {
                    this.fetchMoreContent();
                }
            } else {
                this.loadContent('next');
            }
        },
        prepareContentForDisplay(content) {
            if (content.content_type === 'image') {
                this.currentUrlIndex = 0;
                content.currentUrl = content[this.urlTypes[this.currentUrlIndex]];
            } else if (content.content_type === 'video') {
                content.currentUrl = content.file_url;
                this.isMuted = true;
            }
            return content;
        },
        loadContent(direction) {
            console.log('Loading content...');
            if (this.isLoading) return;
            this.isLoading = true;
            
            if (direction === 'next' && this.contentQueue.length > 0) {
                this.displayNextContent();
                return;
            }

            axios.get(`/feed?page=${this.page}&direction=${direction}`)
            .then(response => {
                console.log('Feed response:', response.data);
                if (response.data && response.data.length > 0) {
                    if (direction === 'next') {
                        this.contentQueue = response.data;
                        this.displayNextContent();
                        this.page += 1;
                    } else {
                        this.currentContent = this.prepareContentForDisplay(response.data[0]);
                        this.contentQueue = response.data.slice(1);
                    }
                    this.preloadMedia();
                } else {
                    this.hasMoreContent = false;
                    alert('No more content available.');
                }
            })
            .catch(error => {
                console.error('Error loading content:', error.response ? error.response.data : error.message);
                if (error.response && error.response.status === 401) {
                    alert('Your session has expired. Please log in again.');
                    this.logout();
                } else {
                    alert('Failed to load content. Please try again.');
                }
            })
            .finally(() => {
                this.isLoading = false;
            });
        },
        fetchMoreContent() {
            if (this.isLoading || !this.hasMoreContent) return;
            this.isLoading = true;
            
            axios.get(`/feed?page=${this.page}&direction=next`)
            .then(response => {
                if (response.data && response.data.length > 0) {
                    this.contentQueue = [...this.contentQueue, ...response.data];
                    this.page += 1;
                    this.preloadMedia();
                } else {
                    this.hasMoreContent = false;
                }
            })
            .catch(error => {
                console.error('Error fetching more content:', error);
            })
            .finally(() => {
                this.isLoading = false;
            });
        },
        preloadMedia() {
            this.contentQueue.forEach(content => {
                if (content.content_type === 'image') {
                    const img = new Image();
                    img.src = content.file_url;
                } else if (content.content_type === 'video') {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.src = content.file_url;
                }
            });
        },
        tryLoadImage(content, currentUrlIndex) {
            if (currentUrlIndex >= this.urlTypes.length) {
                console.error('All URL types failed to load');
                this.loadContent('next'); // Skip to next content if all URLs fail
                return;
            }
        
            const img = new Image();
            img.onload = () => {
                content.currentUrl = content[this.urlTypes[currentUrlIndex]];
                this.currentContent = content;
            };
            img.onerror = () => {
                console.error(`Failed to load image from ${this.urlTypes[currentUrlIndex]}`);
                this.tryLoadImage(content, currentUrlIndex + 1);
            };
            img.src = content[this.urlTypes[currentUrlIndex]];
        },
        interact(interactionType) {
            if (!this.currentContent) return;
            
            axios.post('/interact', {
                content_id: this.currentContent.id,
                interaction_type: interactionType
            })
            .then(response => {
                console.log(`${interactionType} interaction recorded:`, response.data);
                if (interactionType === 'favorite') {
                    this.loadFavorites();
                }
                this.loadContent('next');
            })
            .catch(error => {
                console.error('Error recording interaction:', error.response ? error.response.data : error.message);
                alert('Failed to record interaction. Please try again.');
            });
        },
        loadFavorites() {
            axios.get('/favorites')
            .then(response => {
                console.log('Loaded favorites:', response.data);
                this.favorites = response.data;
            })
            .catch(error => {
                console.error('Error loading favorites:', error.response ? error.response.data : error.message);
                alert('Failed to load favorites. Please try again.');
            });
        },
        handleMediaError(event) {
            console.error('Media failed to load:', event.target.src);
            if (this.currentContent.content_type === 'image') {
                this.tryNextUrl();
            } else {
                console.error('Video failed to load');
                this.nextContent(); // Skip to next content if video fails
            }
        },
        tryNextUrl() {
            if (this.currentContent.content_type !== 'image') return;

            this.currentUrlIndex++;
            if (this.currentUrlIndex < this.urlTypes.length) {
                if (this.currentContent) {
                    const nextUrl = this.currentContent[this.urlTypes[this.currentUrlIndex]];
                    if (nextUrl) {
                        console.log(`Trying next URL: ${this.urlTypes[this.currentUrlIndex]}`);
                        this.currentContent.currentUrl = nextUrl;
                        // Force Vue to re-render the media element
                        this.$forceUpdate();
                    } else {
                        console.log(`${this.urlTypes[this.currentUrlIndex]} is not available, trying next`);
                        this.tryNextUrl();
                    }
                }
            } else {
                console.error('All URL types failed to load');
                this.nextContent(); // Skip to next content if all URLs fail
            }
        },
        nextContent() {
            this.loadContent('next');
        },
        previousContent() {
            this.loadContent('prev');
        },
        resetUrlIndex() {
            console.log('Media loaded successfully');
            this.currentUrlIndex = 0;
        },
        onVideoLoaded() {
            if (this.$refs.videoPlayer) {
                this.$refs.videoPlayer.play().catch(error => {
                    console.error('Autoplay failed:', error);
                    // Optionally, you can show a play button here if autoplay fails
                });
            }
        },
        toggleMute() {
            if (this.$refs.videoPlayer) {
                this.$refs.videoPlayer.muted = !this.$refs.videoPlayer.muted;
                this.isMuted = this.$refs.videoPlayer.muted;
            }
        }
    },
    mounted() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
            axios.get('/user')
            .then(response => {
                this.loggedIn = true;
                this.username = response.data.username;
                this.preferredTags = response.data.preferredTags;
                this.blacklistedTags = response.data.blacklistedTags;
                this.contentTypePreference = response.data.contentTypePreference;
                this.loadContent('next');
            })
            .catch(() => {
                this.logout();
            });
        }
    },
    style: `
    .content-container {
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
    }
    .media-container {
        width: 100%;
        height: 1000px;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        background-color: #f0f0f0;
    }
    .media-container img,
    .media-container video {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    .button-container {
        display: flex;
        justify-content: space-around;
        margin-top: 10px;
    }
    .navigation-container {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
    }
`
});