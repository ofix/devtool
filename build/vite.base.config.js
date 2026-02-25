// vite 基础通用配置
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx' // 导入JSX插件

import { defineConfig } from 'vite'

import VueDevTools from 'vite-plugin-vue-devtools'
import { StartElectronPlugin } from './vite.start.electron.js'

export default defineConfig({
    plugins: [
        vue(),
        vueJsx(), // 新增JSX插件（一行即可，无需额外配置）
        StartElectronPlugin(),
        VueDevTools({ apply: 'serve' }), // 仅开发环境启用（apply: 'serve'）
    ],
    // 指定参数配置的文件目录，加载环境用
    envDir: './build/env',
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('../src/renderer', import.meta.url))
        },
        // 手动映射 Worker 路径，补全 .js 后缀，解决解析失败
        'monaco-editor/esm/vs/editor/editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
        'monaco-editor/esm/vs/language/json/json.worker': 'monaco-editor/esm/vs/language/json/json.worker.js',
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'] // 显式包含 .vue
    },
    // 解决原生模块问题
    optimizeDeps: {
        exclude: ['ssh2'], // 排除ssh2从预构建
        // 预构建 Monaco 相关依赖，避免解析冲突
        include: ['monaco-editor']
    },
})