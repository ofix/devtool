
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    root: resolve(__dirname, '../src/renderer'), // _dirname 指的脚本所在 build 目录
    server: {
        strictPort: true  // 端口被占用时直接报错（避免自动切换）
    }
})