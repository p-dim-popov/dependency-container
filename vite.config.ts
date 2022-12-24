/// <reference types="vitest" />

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'dependency-container',
            fileName: 'dependency-container',
        },
    },
    plugins: [dts()],
    test: {
        globals: true,
        includeSource: ['src/**/*.{ts,js}'],
        coverage: {
            reporter: ['text-summary', 'text', 'html', 'json-summary'],
        },
        mockReset: true,
        restoreMocks: true,
    }
});