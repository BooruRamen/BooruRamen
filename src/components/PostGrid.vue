<template>
  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
    <div 
      v-for="(post, index) in posts" 
      :key="post.id" 
      class="relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer"
      @click="emitPostClick(post, index)"
    >
      <img :src="post.preview_file_url || post.file_url" :alt="post.tag_string" class="w-full h-full object-cover">
    </div>
  </div>
</template>

<script>
export default {
  name: 'PostGrid',
  props: {
    posts: {
      type: Array,
      required: true,
    },
  },
  methods: {
    emitPostClick(post, index) {
      this.$emit('post-clicked', { post, index });
    },
  },
};
</script> 