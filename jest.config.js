module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/**/*.test.ts'],
    globals: {
        'ts-jest': {
            tsconfig: {
                lib: ['es2016'],
            },
        },
    },
};
