import { createRouter, createWebHashHistory } from 'vue-router'
import MenuRoutes from '@/router/MenuRoutes.js' // 导入统一数据

export const routes = MenuRoutes.map(route => ({
  path: route.path,
  name: route.name,
  component: route.component,
  meta: route.meta,
  redirect: route.redirect,
  children: route.children?.map(child => ({
    path: child.path,
    name: child.name,
    component: child.component,
    meta: child.meta
  }))
}))

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL), // createWebHashHistory 同时兼容 squirrel 打包工具 和 wix 打包工具，
  routes
})

export default router
