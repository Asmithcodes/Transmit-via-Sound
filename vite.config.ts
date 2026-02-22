import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // Required for GitHub Pages: assets are served from /Transmit-via-Sound/
    base: '/Transmit-via-Sound/',
})

