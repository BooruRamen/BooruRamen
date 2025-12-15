import { defineStore } from 'pinia'
import StorageService from '../services/StorageService'

export const useSettingsStore = defineStore('settings', {
    state: () => {
        // Load initial settings from storage or use defaults
        const saved = StorageService.loadAppSettings()
        const defaults = {
            autoScroll: false,
            autoScrollSeconds: 5,
            autoScrollSpeed: 'medium',
            disableHistory: false,
            autoplayVideos: true,
            mediaType: { images: true, videos: true },
            ratings: ['general'],
            whitelistTags: [],
            blacklistTags: [],
            activeSource: { type: 'danbooru', url: 'https://danbooru.donmai.us', name: 'Danbooru' },
            customSources: [],
            // Explore mode was separate in App.vue but fits here
            exploreMode: true,
            debugMode: false,
            avoidedTags: [] // Add avoidedTags for consistency if intended to be in store
        }

        // Merge saved settings with defaults
        // Note: saved structure in App.vue was { settings: {...}, exploreMode: ... }
        if (saved) {
            return {
                ...defaults,
                ...saved.settings,
                exploreMode: saved.exploreMode !== undefined ? saved.exploreMode : defaults.exploreMode,
                // Ensure debugMode is picked up from storage (if it was from settings obj)
                debugMode: saved.settings && saved.settings.debugMode !== undefined ? saved.settings.debugMode : defaults.debugMode,
                // Ensure activeSource and customSources are merged correctly if they exist
                activeSource: saved.settings && saved.settings.activeSource ? saved.settings.activeSource : defaults.activeSource,
                customSources: saved.settings && saved.settings.customSources ? saved.settings.customSources : defaults.customSources,
                // Ensure avoidedTags is picked up
                avoidedTags: saved.settings && saved.settings.avoidedTags ? saved.settings.avoidedTags : defaults.avoidedTags
            }
        }

        return defaults
    },

    actions: {
        updateSettings(partialSettings) {
            this.$patch(partialSettings)
            this.saveSettings()
        },

        toggleRating(rating) {
            const index = this.ratings.indexOf(rating)
            if (index > -1) {
                this.ratings.splice(index, 1)
            } else {
                this.ratings.push(rating)
            }
            this.saveSettings()
        },

        addWhitelistTag(tag) {
            if (tag && !this.whitelistTags.includes(tag)) {
                this.whitelistTags.push(tag)
                this.saveSettings()
            }
        },

        removeWhitelistTag(index) {
            this.whitelistTags.splice(index, 1)
            this.saveSettings()
        },

        addBlacklistTag(tag) {
            if (tag && !this.blacklistTags.includes(tag)) {
                this.blacklistTags.push(tag)
                this.saveSettings()
            }
        },

        removeBlacklistTag(index) {
            this.blacklistTags.splice(index, 1)
            this.saveSettings()
        },

        toggleExploreMode() {
            this.exploreMode = !this.exploreMode
            this.saveSettings()
        },

        setMediaType(type, value) {
            this.mediaType[type] = value
            this.saveSettings()
        },

        saveSettings() {
            // Debounce could be added here if needed, but for now direct save is okay 
            // as interactions aren't super high frequency (like scroll)
            StorageService.saveAppSettings({
                settings: {
                    autoScroll: this.autoScroll,
                    autoScrollSeconds: this.autoScrollSeconds,
                    autoScrollSpeed: this.autoScrollSpeed,
                    disableHistory: this.disableHistory,
                    autoplayVideos: this.autoplayVideos,
                    mediaType: this.mediaType,
                    ratings: this.ratings,
                    whitelistTags: this.whitelistTags,
                    blacklistTags: this.blacklistTags,
                    activeSource: this.activeSource,
                    customSources: this.customSources,
                    debugMode: this.debugMode,
                    avoidedTags: this.avoidedTags
                },
                exploreMode: this.exploreMode
            })
        }
    }
})
