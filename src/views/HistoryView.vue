<template>
  <div class="h-screen overflow-y-auto pb-16">
    <h1 class="text-2xl font-bold p-4">History</h1>
    <PostGrid :posts="posts" @post-clicked="onPostClicked" />
  </div>
</template>

<script>
import PostGrid from '../components/PostGrid.vue';
import StorageService from '../services/StorageService';
import { postFilterMixin } from '../mixins/postFilterMixin';

export default {
  name: 'HistoryView',
  mixins: [postFilterMixin],
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
      const allPosts = Object.values(history)
        .sort((a, b) => b.lastViewed - a.lastViewed)
        .map(item => item.data);
      this.posts = this.filterPostsBySettings(allPosts);
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