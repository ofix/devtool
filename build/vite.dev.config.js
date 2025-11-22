
import { defineConfig } from 'vite'
const path = require('path');

export default defineConfig({
    root: path.resolve(__dirname, '../src/renderer'), // _dirname 指的脚本所在 build 目录
    server: {
        strictPort: true  // 端口被占用时直接报错（避免自动切换）
    }
})