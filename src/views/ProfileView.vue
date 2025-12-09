<template>
  <div class="p-4 text-white">
    <h1 class="text-2xl font-bold mb-8 text-center">Profile</h1>
    <div class="space-y-4 max-w-sm mx-auto">
      <router-link to="/history" class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-3 rounded-md text-lg">
        History
      </router-link>
      <router-link to="/likes" class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-3 rounded-md text-lg">
        Likes
      </router-link>
      <router-link to="/favorites" class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-3 rounded-md text-lg">
        Favorites
      </router-link>
      <router-link to="/profile/settings" class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-3 rounded-md text-lg">
        Profile Settings
      </router-link>
      <router-link to="/profile/analytics" class="block w-full text-center bg-gray-700 hover:bg-gray-600 py-3 rounded-md text-lg">
        Profile Analytics
      </router-link>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProfileView',
};
</script> 