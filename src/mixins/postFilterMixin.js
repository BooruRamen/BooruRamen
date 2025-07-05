import StorageService from '../services/StorageService';

export const postFilterMixin = {
  methods: {
    filterPostsBySettings(posts) {
      const appSettings = StorageService.loadAppSettings();
      if (!appSettings || !appSettings.settings) {
        return posts;
      }

      const { settings } = appSettings;

      const ratingCodeMap = {
        'general': 'g',
        'sensitive': 's',
        'questionable': 'q',
        'explicit': 'e'
      };
      const allowedRatingCodes = settings.ratings.map(r => ratingCodeMap[r]);

      return posts.filter(post => {
        if (!post) return false;

        // Filter by Media Type
        const isVideo = ['mp4', 'webm'].includes(post.file_ext);
        const isImage = !isVideo;
        if ((isImage && !settings.mediaType.images) || (isVideo && !settings.mediaType.videos)) {
          return false;
        }

        // Filter by Rating
        if (!allowedRatingCodes.includes(post.rating)) {
          return false;
        }

        const postTags = new Set(post.tag_string.split(' '));

        // Filter by Whitelist Tags
        if (settings.whitelistTags && settings.whitelistTags.length > 0) {
          if (!settings.whitelistTags.every(tag => postTags.has(tag))) {
            return false;
          }
        }

        // Filter by Blacklist Tags
        if (settings.blacklistTags && settings.blacklistTags.length > 0) {
          if (settings.blacklistTags.some(tag => postTags.has(tag))) {
            return false;
          }
        }

        return true;
      });
    }
  }
}; 