import { defineConfig, loadEnv } from 'vite'
import path from "path"

import ViteBaseConfig from './build/vite.base.config'
import ViteProdConfig from './build/vite.prod.config'
import ViteDevConfig from './build/vite.dev.config'

// 合并环境配置
const envResolver = {
  'build': () => {
    return ({ ...ViteBaseConfig, ...ViteProdConfig })
  },
  "serve": () => {
    return ({ ...ViteBaseConfig, ...ViteDevConfig })
  }
}


export default defineConfig(({ command, mode }) => {
  // 加载不同环境下参数
  const envParams = loadEnv(mode, path.resolve(process.cwd(), './build/env'))
  const viteConfig = envResolver[command]()
  viteConfig.server = {
    proxy: {
      '/api': { // 获取路径中包含了/api的请求
        target: envParams.VITE_TARGET_URL,
        changeOrigin: true, // 修改源
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
  return viteConfig
})
