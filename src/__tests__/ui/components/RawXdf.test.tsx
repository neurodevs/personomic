import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import { XmlNode } from '../../../functions/readXdfRecording'
import RawXdf from '../../../ui/components/RawXdf'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class RawXdfTest extends AbstractPackageTest {
    private static numLoads = 0

    protected static async beforeEach() {
        await super.beforeEach()
        this.numLoads = 0
    }

    @test()
    protected static async titlesItsCardRawXdf() {
        render(<RawXdf chunks={[this.fileHeader]} />)

        assert.isTruthy(
            screen.queryByRole('region', { name: 'Raw XDF' }),
            'Did not title its card Raw XDF!'
        )
    }

    @test()
    protected static async collapsesAllByDefault() {
        render(<RawXdf chunks={[this.fileHeader]} />)

        assert.isEqualDeep(
            this.shownLines,
            ['<FileHeader>…</FileHeader>'],
            'Did not collapse all by default!'
        )
    }

    @test()
    protected static async prettyPrintsXmlTagsWhenExpanded() {
        this.renderExpanded([this.fileHeader])

        assert.isEqualDeep(
            this.shownLines,
            [
                '<FileHeader>',
                '<info>',
                '<version>1.0</version>',
                '<a x="1"/>',
                '</info>',
                '</FileHeader>',
            ],
            'Did not pretty print XML tags when expanded!'
        )
    }

    @test()
    protected static async indentsEachTagOneLevelInsideItsParent() {
        this.renderExpanded([this.fileHeader])

        assert.isEqualDeep(
            this.depthsOfLines,
            [0, 1, 2, 2, 1, 0],
            'Did not indent each tag one level inside its parent!'
        )
    }

    @test()
    protected static async collapsesXmlTagWhenClicked() {
        this.renderExpanded([this.fileHeader])

        fireEvent.click(this.tagToggle('<info>'))

        assert.isEqualDeep(
            this.shownLines,
            ['<FileHeader>', '<info>…</info>', '</FileHeader>'],
            'Did not collapse XML tag when clicked!'
        )
    }

    @test()
    protected static async expandsAllThenCollapsesAll() {
        render(<RawXdf chunks={[this.fileHeader]} />)

        fireEvent.click(this.button('Expand all'))
        const expanded = this.shownLines.length
        fireEvent.click(this.button('Collapse all'))

        assert.isEqualDeep(
            { expanded, collapsed: this.shownLines },
            { expanded: 6, collapsed: ['<FileHeader>…</FileHeader>'] },
            'Did not expand all, then collapse all!'
        )
    }

    @test()
    protected static async expandsOneLevelAtATime() {
        render(<RawXdf chunks={[this.fileHeader]} />)

        fireEvent.click(this.button('Expand one level'))

        assert.isEqualDeep(
            this.shownLines,
            ['<FileHeader>', '<info>…</info>', '</FileHeader>'],
            'Did not expand one level at a time!'
        )
    }

    @test()
    protected static async hidesDataChunksByDefault() {
        render(
            <RawXdf
                chunks={[
                    this.fileHeader,
                    this.samplesChunk,
                    this.clockOffset,
                    { name: 'Boundary' },
                ]}
            />
        )

        assert.isEqualDeep(
            {
                isPressed:
                    this.button('Show data').getAttribute('aria-pressed'),
                lines: this.shownLines,
            },
            { isPressed: 'false', lines: ['<FileHeader>…</FileHeader>'] },
            'Did not hide data chunks by default!'
        )
    }

    @test()
    protected static async hidesClockOffsetsInFooterWhenDataHidden() {
        this.renderExpanded([this.streamFooter])

        assert.isEqualDeep(
            this.shownLines,
            [
                '<StreamFooter>',
                '<info>',
                '<sample_count>2</sample_count>',
                '</info>',
                '</StreamFooter>',
            ],
            'Did not hide clock offsets in footer when data hidden!'
        )
    }

    @test()
    protected static async showsClockOffsetsInFooterWhenDataShown() {
        render(<RawXdf chunks={[this.streamFooter]} />)

        fireEvent.click(this.button('Show data'))
        fireEvent.click(this.button('Expand all'))

        assert.isEqualDeep(
            this.shownLines.slice(3, 9),
            [
                '<clock_offsets>',
                '<offset>',
                '<time>5</time>',
                '<value>-0.25</value>',
                '</offset>',
                '</clock_offsets>',
            ],
            'Did not show clock offsets in footer when data shown!'
        )
    }

    @test()
    protected static async expandsOnlyLevelsOfShownTags() {
        render(<RawXdf chunks={[this.streamFooter]} />)

        fireEvent.click(this.button('Expand one level'))
        fireEvent.click(this.button('Expand one level'))

        assert.isTrue(
            (this.button('Expand one level') as HTMLButtonElement).disabled,
            'Did not expand only levels of shown tags!'
        )
    }

    @test()
    protected static async showsDataChunksCollapsedWithoutLoadingThem() {
        render(<RawXdf chunks={[this.samplesChunk, this.clockOffset]} />)

        fireEvent.click(this.button('Show data'))

        assert.isEqualDeep(
            { lines: this.shownLines, numLoads: this.numLoads },
            {
                lines: [
                    '<Samples StreamId="1" NumSamples="2">…</Samples>',
                    '<ClockOffset StreamId="1">…</ClockOffset>',
                ],
                numLoads: 0,
            },
            'Did not show data chunks collapsed without loading them!'
        )
    }

    @test()
    protected static async hidesDataChunksAgainWhenHideDataClicked() {
        render(<RawXdf chunks={[this.fileHeader, this.samplesChunk]} />)

        fireEvent.click(this.button('Show data'))
        fireEvent.click(this.button('Hide data'))

        assert.isEqualDeep(
            this.shownLines,
            ['<FileHeader>…</FileHeader>'],
            'Did not hide data chunks again when hide data clicked!'
        )
    }

    @test()
    protected static async expandsDataTagWhenClicked() {
        render(<RawXdf chunks={[this.samplesChunk]} />)

        fireEvent.click(this.button('Show data'))
        fireEvent.click(this.tagToggle('<Samples'))

        assert.isEqualDeep(
            this.shownLines,
            [
                '<Samples StreamId="1" NumSamples="2">',
                '<sample timestamp="10">1 2</sample>',
                '<sample>3 4</sample>',
                '</Samples>',
            ],
            'Did not expand data tag when clicked!'
        )
    }

    @test()
    protected static async leavesDataTagsCollapsedOnExpandAll() {
        render(<RawXdf chunks={[this.fileHeader, this.samplesChunk]} />)

        fireEvent.click(this.button('Show data'))
        fireEvent.click(this.button('Expand all'))

        assert.isEqual(
            this.numLoads,
            0,
            'Did not leave data tags collapsed on expand all!'
        )
    }

    private static renderExpanded(chunks: XmlNode[]) {
        render(<RawXdf chunks={chunks} />)
        fireEvent.click(this.button('Expand all'))
    }

    private static button(name: string) {
        return screen.getByRole('button', { name })
    }

    private static tagToggle(start: string) {
        return screen
            .getAllByRole('button')
            .find((button) => button.textContent?.startsWith(start))!
    }

    private static get lines() {
        return [...document.querySelectorAll<HTMLElement>('.raw-xdf__line')]
    }

    private static get shownLines() {
        return this.lines.map((line) => line.textContent)
    }

    private static get depthsOfLines() {
        return this.lines.map(
            (line) =>
                [...this.ancestorsOf(line)].filter((ancestor) =>
                    ancestor.classList.contains('raw-xdf__children')
                ).length
        )
    }

    private static *ancestorsOf(element: HTMLElement) {
        for (
            let ancestor = element.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
        ) {
            yield ancestor
        }
    }

    private static readonly fileHeader: XmlNode = {
        name: 'FileHeader',
        children: [
            {
                name: 'info',
                children: [
                    { name: 'version', text: '1.0' },
                    { name: 'a', attributes: { x: '1' } },
                ],
            },
        ],
    }

    private static readonly streamFooter: XmlNode = {
        name: 'StreamFooter',
        children: [
            {
                name: 'info',
                children: [
                    { name: 'sample_count', text: '2' },
                    {
                        name: 'clock_offsets',
                        children: [
                            {
                                name: 'offset',
                                children: [
                                    { name: 'time', text: '5' },
                                    { name: 'value', text: '-0.25' },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    }

    private static get samplesChunk(): XmlNode {
        return {
            name: 'Samples',
            attributes: { StreamId: '1', NumSamples: '2' },
            loadChildren: () => {
                this.numLoads++
                return [
                    {
                        name: 'sample',
                        attributes: { timestamp: '10' },
                        text: '1 2',
                    },
                    { name: 'sample', text: '3 4' },
                ]
            },
        }
    }

    private static get clockOffset(): XmlNode {
        return {
            name: 'ClockOffset',
            attributes: { StreamId: '1' },
            loadChildren: () => {
                this.numLoads++
                return [{ name: 'OffsetValue', text: '-0.25' }]
            },
        }
    }
}
