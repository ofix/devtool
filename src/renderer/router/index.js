import { createRouter, createWebHistory } from 'vue-router'
import MenuRoutes from '@/router/MenuRoutes.js' // 导入统一数据

export const routes = MenuRoutes.map(route => ({
  path: route.path,
  name: route.name,
  component: route.component,
  meta: route.meta,
  children: route.children?.map(child => ({
    path: child.path,
    name: child.name,
    component: child.component,
    meta: child.meta
  }))
}))

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
