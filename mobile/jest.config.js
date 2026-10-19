// jest.config.js — the mobile suite.
//
// `jest-expo` is the preset because it is the one that knows what a React Native module graph
// looks like (the platform extensions, the asset transformer, the `react-native` field). The tests
// themselves deliberately exercise PURE modules — the cipher, the pair-link parser, the relay
// state machine over an injected socket, the at-rest store over injected storage, and one pure
// presenter per tab — so none of them needs a renderer, a device or a simulator, and all of them
// run in milliseconds on a CI runner with no Android SDK and no Xcode.
//
// `@shared/*` resolves OUT of this project to `../src/shared/*`, the same seam metro.config.js
// opens for the bundler. The desktop's wire contract is imported, never copied.

const path = require('node:path')
const preset = require('jest-expo/jest-preset')

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': path.resolve(__dirname, '..', 'src', 'shared', '$1')
  },
  // @noble/ciphers ships ESM only, so it has to go through the transform like the Expo and React
  // Native packages do. The preset's own list is EXTENDED rather than replaced — writing a fresh
  // pattern here silently un-transforms `expo-modules-core` and the suite dies in the preset's
  // own setup file, which is a confusing way to find out.
  transformIgnorePatterns: [
    ...preset.transformIgnorePatterns.map((pattern) =>
      pattern.startsWith('/node_modules/(?!(')
        ? pattern.replace('/node_modules/(?!(', '/node_modules/(?!(@noble|')
        : pattern
    )
  ],
  clearMocks: true
}
