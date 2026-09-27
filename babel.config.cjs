module.exports = function (api) {
    api.cache(true)

    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // node-tdd's @test() is a legacy decorator, so tests need the
            // legacy transform. Metro applies this config too, which is
            // harmless for app code that uses no decorators.
            ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
        ],
    }
}
