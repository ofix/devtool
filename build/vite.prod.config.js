import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    // 配置打包属性
    root: resolve(__dirname, '../src/renderer'), // _dirname 指的脚本所在 build 目录
    base: './',
    build: {
        outDir: resolve(__dirname, '../dist/renderer'), // 如果直接写 'dist/renderer' 将会输出到 src/renderer/dist目录下
        emptyOutDir: true, // 关键：编译前清空 outDir（默认 dist）
        rollupOptions: {
            output: {
                // 分离 Worker 脚本到独立目录，避免与主代码混淆
                assetFileNames: 'assets/[name].[hash].[ext]',
                chunkFileNames: 'chunks/[name].[hash].js',
                entryFileNames: 'entry/[name].[hash].js'
            }
        },
        // 关闭代码压缩对 Worker 脚本的影响
        minify: 'esbuild',
        sourcemap: false,
        chunkSizeWarningLimit: 2000
    }
})