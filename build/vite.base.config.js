// vite 基础通用配置
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import { StartElectronPlugin } from './vite.start.electron.js'
export default defineConfig({
    plugins: [
        vue(),
        StartElectronPlugin(),
        VueDevTools({ apply: 'serve' }), // 仅开发环境启用（apply: 'serve'）
    ],

    // 指定参数配置的文件目录，加载环境用
    envDir: './build/env',
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('../src/renderer', import.meta.url))
        },
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'] // 显式包含 .vue
    }
})