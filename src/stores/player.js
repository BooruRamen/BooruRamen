import { defineStore } from 'pinia'
import StorageService from '../services/StorageService'

export const usePlayerStore = defineStore('player', {
    state: () => ({
        volume: 1, // Default full volume
        muted: false,
        isPlaying: true
    }),

    actions: {
        initialize() {
            const prefs = StorageService.getPreferences()
            if (prefs.volume !== undefined) this.volume = prefs.volume
            if (prefs.muted !== undefined) this.muted = prefs.muted
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

        savePreferences() {
            StorageService.storePreferences({
                volume: this.volume,
                muted: this.muted
            })
        }
    }
})
