import { test, assert } from '@neurodevs/node-tdd'
import React from 'react'

import App from '../App.js'
import AbstractPackageTest from './AbstractPackageTest.js'

export default class AppTest extends AbstractPackageTest {
    private static element: React.ReactElement

    protected static async beforeEach() {
        await super.beforeEach()

        this.element = this.renderApp()
    }

    @test()
    protected static async canCreateApp() {
        assert.isTruthy(this.element, 'App instance should be created!')
    }

    private static renderApp() {
        return <App />
    }
}
