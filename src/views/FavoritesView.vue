<template>
  <div class="h-screen overflow-y-auto pb-16">
    <h1 class="text-2xl font-bold p-4">Favorited Posts</h1>
    <PostGrid :posts="posts" @post-clicked="onPostClicked" />
  </div>
</template>

<script>
import PostGrid from '../components/PostGrid.vue';
import StorageService from '../services/StorageService';
import { postFilterMixin } from '../mixins/postFilterMixin';

export default {
  name: 'FavoritesView',
  mixins: [postFilterMixin],
  components: {
    PostGrid,
  },
  data() {
    return {
      posts: [],
    };
  },
  beforeRouteEnter(to, from, next) {
    next(vm => {
      vm.loadFavorites();
    });
  },
  methods: {
    loadFavorites() {
      const favoritedInteractions = StorageService.getInteractions('favorite');
      const allPosts = favoritedInteractions
        .filter(interaction => interaction.value > 0)
        .map(interaction => interaction.metadata.post);
      this.posts = this.filterPostsBySettings(allPosts);
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