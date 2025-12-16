import { defineStore } from 'pinia'
import StorageService from '../services/StorageService'

export const usePlayerStore = defineStore('player', {
    state: () => ({
        volume: 1, // Default full volume
        muted: false,
        isPlaying: true,
        initialized: false
    }),

    actions: {
        async initialize() {
            if (this.initialized) return

            const prefs = await StorageService.getPreferences()
            if (prefs.volume !== undefined) this.volume = prefs.volume
            if (prefs.muted !== undefined) this.muted = prefs.muted

            this.initialized = true
        },

        setVolume(level) {
            this.volume = Math.max(0, Math.min(1, level))
            // If volume is > 0, ensure we are unmuted (unless user explicitly muted? 
            // actually usually sliding volume unmutes).
            if (this.volume > 0 && this.muted) {
                this.muted = false
            }
            this.savePreferences()
        },

        toggleMute() {
            this.muted = !this.muted
            this.savePreferences()
        },

        setMuted(mute) {
            this.muted = mute
            this.savePreferences()
        },

        setPlaying(playing) {
            this.isPlaying = playing
        },

        async savePreferences() {
            await StorageService.storePreferences({
                volume: this.volume,
                muted: this.muted
            })
        }
    }
})
