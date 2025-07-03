<template>
  <div class="fixed bottom-0 left-0 right-0 h-16 bg-black z-40 flex justify-center items-center border-t border-gray-700">
    <div class="flex w-full">
      <router-link to="/" class="flex-1 flex justify-end items-center pr-10 text-lg text-white hover:text-pink-500 border-r border-gray-700">
        <span>Feed</span>
      </router-link>
      <router-link to="/profile" class="flex-1 flex justify-start items-center pl-10 text-lg text-white hover:text-pink-500">
        <span>Profile</span>
      </router-link>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BottomNavBar',
};
</script> 