import { useEffect } from 'react'

export default function useWarningBeforeLeaving(shouldWarn: boolean) {
    useEffect(() => {
        if (!shouldWarn) {
            return undefined
        }

        window.addEventListener('beforeunload', warnBeforeLeaving)
        return () =>
            window.removeEventListener('beforeunload', warnBeforeLeaving)
    }, [shouldWarn])
}

function warnBeforeLeaving(event: BeforeUnloadEvent) {
    event.preventDefault()
    event.returnValue = ''
}
