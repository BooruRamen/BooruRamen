<template>
  <div>
    <h1 class="text-2xl font-bold p-4">Favorited Posts</h1>
    <PostGrid :posts="posts" @post-clicked="onPostClicked" />
  </div>
</template>

<script>
import PostGrid from '../components/PostGrid.vue';
import StorageService from '../services/StorageService';

export default {
  name: 'FavoritesView',
  components: {
    PostGrid,
  },
  data() {
    return {
      posts: [],
    };
  },
  mounted() {
    this.loadFavoritedPosts();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  },
  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  },
  methods: {
    handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        this.loadFavoritedPosts();
      }
    },
    loadFavoritedPosts() {
      const favoritedInteractions = StorageService.getInteractions('favorite');
      // We only want to show favorited posts, so we filter for value > 0
      // also sorting by timestamp to show the most recently favorited first
      this.posts = favoritedInteractions
        .filter(interaction => interaction.value > 0)
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(interaction => interaction.metadata.post);
    },
    onPostClicked({ index }) {
      this.$router.push({ 
        name: 'Viewer', 
        params: { source: 'favorites' }, 
        query: { start: index } 
      });
    },
  },
};
</script> 