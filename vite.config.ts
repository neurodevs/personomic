import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            {
                find: /^module$/,
                replacement: fileURLToPath(
                    new URL('./shims/createRequire.js', import.meta.url)
                ),
            },
        ],
    },
})
