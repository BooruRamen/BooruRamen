import { defineStore } from 'pinia'
import StorageService from '../services/StorageService'

export const usePlayerStore = defineStore('player', {
    state: () => ({
        volume: 0.5, // Default 50% volume
        muted: false,
        defaultMuted: false, // Whether videos should start muted by default
        isPlaying: true,
        initialized: false
    }),

    actions: {
        async initialize() {
            if (this.initialized) return

            const prefs = await StorageService.getPreferences()
            if (prefs.volume !== undefined) this.volume = prefs.volume
            if (prefs.muted !== undefined) this.muted = prefs.muted
            if (prefs.defaultMuted !== undefined) this.defaultMuted = prefs.defaultMuted

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

        setDefaultMuted(value) {
            this.defaultMuted = value
            this.savePreferences()
        },

        setPlaying(playing) {
            this.isPlaying = playing
        },

        async savePreferences() {
            await StorageService.storePreferences({
                volume: this.volume,
                muted: this.muted,
                defaultMuted: this.defaultMuted
            })
        }
    }
})
