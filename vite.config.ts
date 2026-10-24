import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, Plugin } from 'vite'

export default defineConfig(({ mode }) => {
    const isWeb = mode === 'web'
    const demo = pathTo('./demo.html')
    const input: Record<string, string> = isWeb
        ? { demo }
        : { main: pathTo('./index.html'), demo }

    return {
        plugins: isWeb ? [react(), serveDemoAsIndex()] : [react()],
        resolve: {
            alias: [
                {
                    find: /^module$/,
                    replacement: pathTo('./shims/createRequire.js'),
                },
            ],
        },
        build: {
            outDir: isWeb ? 'dist/web' : 'dist',
            rollupOptions: { input },
        },
    }
})

function serveDemoAsIndex(): Plugin {
    return {
        name: 'serve-demo-as-index',
        enforce: 'post',
        generateBundle(_options, bundle) {
            bundle['demo.html'].fileName = 'index.html'
        },
    }
}

function pathTo(relativePath: string) {
    return fileURLToPath(new URL(relativePath, import.meta.url))
}
