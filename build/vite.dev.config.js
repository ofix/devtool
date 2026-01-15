
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
    root: resolve(__dirname, '../src/renderer'), // _dirname 指的脚本所在 build 目录
    server: {
        strictPort: true, // 端口被占用时直接报错（避免自动切换）
        // 核心：配置文件监听忽略规则
        watch: {
            // 排除不需要监听的目录/文件
            ignored: [
                /node_modules/, // 排除依赖目录
                /dist/,         // 排除打包目录
                /build/,        // 排除你的 build 目录（触发错误的文件所在目录）
                /\.git/,        // 排除 git 目录
                /\.log/,        // 排除日志文件
                // 可根据项目添加更多排除项
            ],
            // 可选：降低监听频率，减少句柄占用
            interval: 1000,
            poll: false // 关闭轮询，使用系统原生监听（更高效）
        }
    }
})