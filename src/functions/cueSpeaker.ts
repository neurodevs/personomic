import sendToOrchestrator from './sendToOrchestrator'

export function orchestratorOrBrowserSpeaker(browser: Speaker): Speaker {
    let orchestratorVoices: SpeakerVoice[] | undefined
    let isAskingOrchestrator = false
    let isOrchestratorUnavailable = false
    const listeners = new Set<() => void>()

    const useBrowser = () => {
        isOrchestratorUnavailable = true
        listeners.forEach((listener) => listener())
    }

    const askOrchestratorForVoices = () => {
        isAskingOrchestrator = true

        sendToOrchestrator<{ voices?: unknown }>(
            { command: 'listVoices' },
            {
                onReply: ({ voices }) => {
                    if (!Array.isArray(voices)) {
                        useBrowser()
                        return
                    }

                    orchestratorVoices = voices
                        .filter((name) => typeof name === 'string')
                        .map((name) => ({ name, isDownloaded: true }))
                    listeners.forEach((listener) => listener())
                },
                onUnreachable: useBrowser,
            }
        )
    }

    return {
        speak(text, voice, onEnd) {
            if (!orchestratorVoices) {
                browser.speak(text, voice, onEnd)
                return
            }

            sendToOrchestrator(
                { command: 'speakCue', text, voice },
                { onReply: () => onEnd(), onUnreachable: onEnd }
            )
        },
        cancel() {
            if (!orchestratorVoices) {
                browser.cancel()
                return
            }

            sendToOrchestrator(
                { command: 'stopCue' },
                { onReply: () => {}, onUnreachable: () => {} }
            )
        },
        voices() {
            if (orchestratorVoices) {
                return orchestratorVoices
            }

            if (isOrchestratorUnavailable) {
                return browser.voices()
            }

            if (!isAskingOrchestrator) {
                askOrchestratorForVoices()
            }

            return []
        },
        onVoicesChanged(listener) {
            listeners.add(listener)
            const stopListeningToBrowser = browser.onVoicesChanged(listener)

            return () => {
                listeners.delete(listener)
                stopListeningToBrowser()
            }
        },
    }
}

let speakingUtterance: SpeechSynthesisUtterance | undefined

const browserSpeaker: Speaker = {
    speak(text, voice, onEnd) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.voice = browserVoiceNamed(voice) ?? null
        const finish = () => {
            if (speakingUtterance === utterance) {
                speakingUtterance = undefined
            }
            onEnd()
        }
        utterance.onend = finish
        utterance.onerror = (event) => {
            if (!isStoppedOnPurpose(event)) {
                console.warn(`Could not speak the cue: ${event.error}`)
            }
            finish()
        }

        const isBusy = speechSynthesis.speaking || speechSynthesis.pending
        speakingUtterance = utterance
        speechSynthesis.cancel()

        if (isBusy) {
            setTimeout(() => speechSynthesis.speak(utterance), 100)
        } else {
            speechSynthesis.speak(utterance)
        }
    },
    cancel: () => speechSynthesis.cancel(),
    voices: () =>
        speechSynthesis.getVoices().map(({ name, localService }) => ({
            name,
            isDownloaded: localService,
        })),
    onVoicesChanged(listener) {
        speechSynthesis.addEventListener('voiceschanged', listener)
        return () =>
            speechSynthesis.removeEventListener('voiceschanged', listener)
    },
}

function browserVoiceNamed(name: string) {
    return speechSynthesis.getVoices().find((voice) => voice.name === name)
}

function isStoppedOnPurpose(event: SpeechSynthesisErrorEvent) {
    return event.error === 'canceled' || event.error === 'interrupted'
}

// Test doubles

export let speaker = orchestratorOrBrowserSpeaker(browserSpeaker)

export function setSpeaker(nextSpeaker: Speaker) {
    speaker = nextSpeaker
}

export interface Speaker {
    speak(text: string, voice: string, onEnd: () => void): void
    cancel(): void
    voices(): SpeakerVoice[]
    onVoicesChanged(listener: () => void): () => void
}

export interface SpeakerVoice {
    name: string
    isDownloaded: boolean
}
