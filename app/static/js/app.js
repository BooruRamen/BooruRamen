new Vue({
    el: '#app',
    template: '#app-template',
    data: {
        loggedIn: false,
        username: '',
        password: '',
        preferredTags: '',
        blacklistedTags: '',
        contentTypePreference: 'both',
        feed: [],
        favorites: [],
        page: 1,
        hasMoreContent: true
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
                this.loadMoreContent();
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
            this.feed = [];
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
                this.loadMoreContent();
            })
            .catch(error => {
                console.error('Error updating preferences:', error.response ? error.response.data : error.message);
                alert('Failed to update preferences. Please try again.');
            });
        },
        loadMoreContent() {
            console.log('Loading more content...');
            axios.get(`/feed?page=${this.page}`)
            .then(response => {
                console.log('Feed response:', response.data);
                if (response.data.length > 0) {
                    this.feed = this.feed.concat(response.data);
                    this.page += 1;
                } else {
                    this.hasMoreContent = false;
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
        interact(contentId, interactionType) {
            axios.post('/interact', {
                content_id: contentId,
                interaction_type: interactionType
            })
            .then(response => {
                console.log(`${interactionType} interaction recorded:`, response.data);
                if (interactionType === 'favorite') {
                    this.loadFavorites();
                }
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
            event.target.style.display = 'none';
            event.target.insertAdjacentHTML('afterend', `<p>Media failed to load: ${event.target.src}</p>`);
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
                this.loadMoreContent();
            })
            .catch(() => {
                this.logout();
            });
        }
    }
});