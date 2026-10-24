#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const BUILD_DIR = 'dist/web'
const DEFAULT_STORAGE_HOSTNAME = 'storage.bunnycdn.com'

const storageZone = requireEnv('BUNNY_STORAGE_ZONE')
const storagePassword = requireEnv('BUNNY_STORAGE_PASSWORD')
const storageHostname =
    process.env.BUNNY_STORAGE_HOSTNAME || DEFAULT_STORAGE_HOSTNAME
const apiKey = requireEnv('BUNNY_API_KEY')
const pullZoneId = requireEnv('BUNNY_PULL_ZONE_ID')

const files = await listFilesIn(BUILD_DIR)

for (const file of pagesLast(files)) {
    await upload(file)
}

await purgePullZone()

console.log(`Deployed ${files.length} files from ${BUILD_DIR}`)

function requireEnv(name) {
    const value = process.env[name]

    if (!value) {
        console.error(`Set ${name} in .env.local or the environment`)
        process.exit(1)
    }

    return value
}

async function listFilesIn(dir) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })

    return entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
            path.relative(BUILD_DIR, path.join(entry.parentPath, entry.name))
        )
}

function pagesLast(files) {
    const isPage = (file) => file.endsWith('.html')
    return [...files.filter((f) => !isPage(f)), ...files.filter(isPage)]
}

async function upload(file) {
    const urlPath = file.split(path.sep).join('/')

    await request(
        `https://${storageHostname}/${storageZone}/${urlPath}`,
        {
            method: 'PUT',
            headers: {
                AccessKey: storagePassword,
                'Content-Type': 'application/octet-stream',
            },
            body: await readFile(path.join(BUILD_DIR, file)),
        },
        `upload ${urlPath}`
    )

    console.log(`Uploaded ${urlPath}`)
}

async function purgePullZone() {
    await request(
        `https://api.bunny.net/pullzone/${pullZoneId}/purgeCache`,
        { method: 'POST', headers: { AccessKey: apiKey } },
        'purge the pull zone cache'
    )

    console.log('Purged the pull zone cache')
}

async function request(url, options, action) {
    const response = await fetch(url, options)

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Failed to ${action}: ${response.status} ${body}`)
    }
}
