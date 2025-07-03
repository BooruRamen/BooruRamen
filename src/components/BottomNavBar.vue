<template>
  <div class="fixed bottom-0 left-0 right-0 h-16 bg-black z-40 flex justify-center items-center border-t border-gray-700">
    <div class="flex w-full">
      <router-link to="/" class="flex-1 text-center py-2 text-lg text-white hover:text-pink-500">
        Feed
      </router-link>
      <div class="w-px h-full bg-gray-700"></div>
      <router-link to="/profile" class="flex-1 text-center py-2 text-lg text-white hover:text-pink-500">
        Profile
      </router-link>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BottomNavBar',
};
</script> 