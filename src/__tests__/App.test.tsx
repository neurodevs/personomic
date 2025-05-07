import React from 'react'
import AbstractSpruceTest, { test, assert } from '@sprucelabs/test-utils'
import App  from '../App'

export default class AppTest extends AbstractSpruceTest {
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


