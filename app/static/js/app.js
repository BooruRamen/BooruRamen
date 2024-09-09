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
                    <video v-else-if="currentContent.content_type === 'video'" controls @error="handleMediaError" @loadeddata="resetUrlIndex">
                        <source :src="currentContent.currentUrl" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                <div class="tags-container">
                    <p>{{ currentContent.tags }}</p>
                </div>
                <div class="button-container">
                    <button @click="interact('like')">Like</button>
                    <button @click="interact('dislike')">Dislike</button>
                    <button @click="interact('favorite')">Favorite</button>
                </div>
            </div>
            <div v-else>
                <p>No content available.</p>
            </div>
            <div class="navigation-container">
                <button @click="previousContent">Previous</button>
                <button @click="nextContent">Next</button>
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
        favorites: [],
        page: 1,
        hasMoreContent: true,
        urlIndex: 0,
        urlTypes: ['file_url', 'alt_file_url', 'sample_url', 'preview_url'],
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
        loadContent(direction) {
            console.log('Loading content...');
            axios.get(`/feed?page=${this.page}&direction=${direction}`)
            .then(response => {
                console.log('Feed response:', response.data);
                if (response.data && Object.keys(response.data).length > 0) {
                    this.tryLoadImage(response.data, 0);
                    if (direction === 'next') {
                        this.page += 1;
                    }
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
            });
        },
        tryLoadImage(content, urlIndex) {
            if (urlIndex >= this.urlTypes.length) {
                console.error('All URL types failed to load');
                this.loadContent('next'); // Skip to next content if all URLs fail
                return;
            }
        
            const img = new Image();
            img.onload = () => {
                content.currentUrl = content[this.urlTypes[urlIndex]];
                this.currentContent = content;
            };
            img.onerror = () => {
                console.error(`Failed to load image from ${this.urlTypes[urlIndex]}`);
                this.tryLoadImage(content, urlIndex + 1);
            };
            img.src = content[this.urlTypes[urlIndex]];
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
            console.error('Media type:', event.target.tagName);
            console.error('Error details:', event);
            
            const currentUrlIndex = this.urlTypes.indexOf(this.currentContent.currentUrl);
            this.tryLoadImage(this.currentContent, currentUrlIndex + 1);
        },
        nextContent() {
            this.loadContent('next');
        },
        previousContent() {
            this.loadContent('prev');
        },
        resetUrlIndex() {
            this.urlIndex = 0;
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