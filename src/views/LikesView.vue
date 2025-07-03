<template>
  <div class="h-screen overflow-y-auto pb-16">
    <h1 class="text-2xl font-bold p-4">Likes</h1>
    <PostGrid :posts="posts" @post-clicked="onPostClicked" />
  </div>
</template>

<script>
import PostGrid from '../components/PostGrid.vue';
import StorageService from '../services/StorageService';

export default {
  name: 'LikesView',
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
      vm.loadLikedPosts();
    });
  },
  methods: {
    loadLikedPosts() {
      const likedInteractions = StorageService.getInteractions('like');
      // We only want to show liked posts, so we filter for value > 0
      // also sorting by timestamp to show the most recently liked first
      this.posts = likedInteractions
        .filter(interaction => interaction.value > 0)
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(interaction => interaction.metadata.post);
    },
    onPostClicked({ index }) {
      this.$router.push({ 
        name: 'Viewer', 
        params: { source: 'likes' }, 
        query: { start: index } 
      });
    },
  },
};
</script> 