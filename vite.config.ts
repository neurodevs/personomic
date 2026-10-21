import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            {
                find: /^module$/,
                replacement: pathTo('./shims/createRequire.js'),
            },
        ],
    },
    build: {
        rollupOptions: {
            input: {
                main: pathTo('./index.html'),
                demo: pathTo('./demo.html'),
            },
        },
    },
})

function pathTo(relativePath: string) {
    return fileURLToPath(new URL(relativePath, import.meta.url))
}
