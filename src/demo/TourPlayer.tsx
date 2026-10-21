import {
    BoundFunctions,
    fireEvent,
    queries,
    within,
} from '@testing-library/dom'
import React, { useEffect, useRef, useState } from 'react'

const stuckCaption = 'This step could not be shown. Go back, or exit the tour.'

const highlightAttribute = 'data-tour-target'

const defaultWaitMs = 5000
const pollIntervalMs = 50

export interface TourPlayerProps {
    tours: Tour[]
    backend: TourBackend
    children: React.ReactNode
}

const TourPlayer: React.FC<TourPlayerProps> = (props: TourPlayerProps) => {
    const { tours, backend, children } = props

    const [tour, setTour] = useState<Tour>()
    const [stepIndex, setStepIndex] = useState(0)
    const [numRestarts, setNumRestarts] = useState(0)
    const [isBusy, setIsBusy] = useState(false)
    const [isStuck, setIsStuck] = useState(false)

    const appRef = useRef<HTMLDivElement>(null)
    const targetRef = useRef<HTMLElement>(undefined)
    const runRef = useRef(0)
    const restartRef = useRef<{ tour: Tour; stepIndex: number }>(undefined)

    const isOnLastStep =
        tour !== undefined && stepIndex === tour.steps.length - 1
    const view = () => within(appRef.current!)

    const startRun = () => {
        targetRef.current?.removeAttribute(highlightAttribute)
        targetRef.current = undefined
        setIsStuck(false)

        return ++runRef.current
    }

    const isCurrent = (run: number) => run === runRef.current

    const perform = async (step: TourAction, target: HTMLElement) => {
        await (step.act ?? clickOn)(target, view())
    }

    const arriveAt = async (run: number, arrived: Tour, index: number) => {
        const step = arrived.steps[index]

        try {
            const target = await targetOf(step, view())

            if (isCurrent(run)) {
                target.setAttribute(highlightAttribute, '')
                target.scrollIntoView?.({ block: 'nearest' })
                targetRef.current = target
            }
        } catch {
            if (isCurrent(run)) {
                setIsStuck(true)
            }
        }

        if (isCurrent(run)) {
            setIsBusy(false)
        }
    }

    const restartAt = (chosen: Tour, index: number) => {
        startRun()
        backend.reset()
        restartRef.current = { tour: chosen, stepIndex: index }

        setTour(chosen)
        setStepIndex(index)
        setIsBusy(true)
        setNumRestarts((previous) => previous + 1)
    }

    useEffect(() => {
        const restart = restartRef.current

        if (!restart) {
            return
        }

        restartRef.current = undefined
        const run = runRef.current

        const catchUp = async () => {
            backend.setIsInstant(true)

            try {
                for (const step of [
                    ...(restart.tour.setup ?? []),
                    ...restart.tour.steps.slice(0, restart.stepIndex),
                ]) {
                    const target = await targetOf(step, view())

                    if (!isCurrent(run)) {
                        return
                    }

                    await perform(step, target)
                }
            } catch {
                if (isCurrent(run)) {
                    setIsStuck(true)
                    setIsBusy(false)
                }
                return
            } finally {
                if (isCurrent(run)) {
                    backend.setIsInstant(false)
                }
            }

            await arriveAt(run, restart.tour, restart.stepIndex)
        }

        void catchUp()
    }, [numRestarts])

    useEffect(() => () => void ++runRef.current, [])

    const next = async () => {
        const target = targetRef.current

        if (!tour || !target) {
            return
        }

        const run = startRun()
        const nextIndex = stepIndex + 1

        setIsBusy(true)
        await perform(tour.steps[stepIndex], target)

        if (isCurrent(run)) {
            setStepIndex(nextIndex)
            await arriveAt(run, tour, nextIndex)
        }
    }

    const exit = () => {
        startRun()
        setTour(undefined)
        setIsBusy(false)
    }

    return (
        <div className="tour-player">
            <section className="tour" aria-label="Guided tours">
                {!tour && (
                    <div className="tour__choices">
                        <span className="tour__intro">
                            This is the real Personomic app, streaming a
                            simulated Muse headband. Take a tour:
                        </span>
                        {tours.map((offered) => (
                            <button
                                key={offered.title}
                                type="button"
                                className="tour__choice"
                                onClick={() => restartAt(offered, 0)}
                            >
                                {offered.title}
                            </button>
                        ))}
                    </div>
                )}
                {tour && (
                    <div className="tour__active">
                        <div className="tour__heading">
                            <span className="tour__title">{tour.title}</span>
                            <span className="tour__position">
                                Step {stepIndex + 1} of {tour.steps.length}
                            </span>
                        </div>
                        <p className="tour__caption" role="status">
                            {captionFor(tour, stepIndex, isStuck)}
                        </p>
                        <div className="tour__controls">
                            <button
                                type="button"
                                className="tour__button"
                                disabled={stepIndex === 0}
                                onClick={() => restartAt(tour, stepIndex - 1)}
                            >
                                Back
                            </button>
                            <span className="tour__steps">
                                {tour.steps.map((step, index) => (
                                    <button
                                        key={step.caption}
                                        type="button"
                                        className="tour__step"
                                        aria-label={`Go to step ${index + 1}`}
                                        aria-current={
                                            index === stepIndex
                                                ? 'step'
                                                : undefined
                                        }
                                        data-done={index < stepIndex}
                                        onClick={() => restartAt(tour, index)}
                                    />
                                ))}
                            </span>
                            <button
                                type="button"
                                className="tour__button tour__button--primary"
                                aria-busy={isBusy}
                                disabled={isBusy || isStuck || isOnLastStep}
                                onClick={() => void next()}
                            >
                                Next
                            </button>
                            <button
                                type="button"
                                className="tour__button tour__exit"
                                onClick={exit}
                            >
                                Exit tour
                            </button>
                        </div>
                    </div>
                )}
            </section>
            <div ref={appRef} key={numRestarts}>
                {children}
            </div>
        </div>
    )
}

export default TourPlayer

function captionFor(tour: Tour, stepIndex: number, isStuck: boolean) {
    return isStuck ? stuckCaption : tour.steps[stepIndex].caption
}

async function targetOf(step: TourAction, view: TourView) {
    const { target, waitsUpToMs = defaultWaitMs } = step
    const giveUpAtMs = Date.now() + waitsUpToMs

    for (;;) {
        try {
            return target(view)
        } catch (err) {
            if (Date.now() >= giveUpAtMs) {
                throw err
            }
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
}

function clickOn(target: HTMLElement) {
    fireEvent.click(target)
}

export type TourView = BoundFunctions<typeof queries>

export interface Tour {
    title: string
    setup?: TourAction[]
    steps: TourStep[]
}

export interface TourAction {
    target: (view: TourView) => HTMLElement
    waitsUpToMs?: number
    act?: (target: HTMLElement, view: TourView) => unknown
}

export interface TourStep extends TourAction {
    caption: string
}

export interface TourBackend {
    reset: () => void
    setIsInstant: (isInstant: boolean) => void
}
