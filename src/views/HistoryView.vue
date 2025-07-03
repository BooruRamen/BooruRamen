<template>
  <div class="h-screen overflow-y-auto pb-16">
    <h1 class="text-2xl font-bold p-4">History</h1>
    <PostGrid :posts="posts" @post-clicked="onPostClicked" />
  </div>
</template>

<script>
import PostGrid from '../components/PostGrid.vue';
import StorageService from '../services/StorageService';

export default {
  name: 'HistoryView',
  components: {
    PostGrid,
  },
  data() {
    return {
      posts: [],
    };
  },
  mounted() {
    this.loadHistory();
  },
  methods: {
    loadHistory() {
      const history = StorageService.getViewedPosts();
      // The history is an object with post IDs as keys. We need the values.
      // We also want to sort them by lastViewed time, descending.
      this.posts = Object.values(history)
        .sort((a, b) => b.lastViewed - a.lastViewed)
        .map(item => item.data);
    },
    onPostClicked({ index }) {
      this.$router.push({ 
        name: 'Viewer', 
        params: { source: 'history' }, 
        query: { start: index } 
      });
    },
  },
};
</script> 