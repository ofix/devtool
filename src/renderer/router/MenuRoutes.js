// 菜单图标集合
import SSHIcon from "@/components/icons/IconSSH.vue";
import FileCompareIcon from "@/components/icons/IconFileCompare.vue";
import VSCodeLayout from '@/layout/VSCodeLayout.vue'

const MenuRoutes = [
  {
    path: '/',
    name: 'RemoteDebug',
    component: VSCodeLayout,
    meta: {
      icon: SSHIcon,
      title: '远程调试',
      desc: ''
    },
    children: [
      {
        path: '/debug',
        name: 'Debug',
        component: () => import('@/views/Debug/Debug.vue'),
        meta: {
          icon: SSHIcon,
          title: '远程调试',
          desc: ''
        }
      },
      {
        path: '/file-compare',
        name: 'FileCompare',
        component: () => import('@/views/FileCompare/FileCompare.vue'),
        meta: {
          icon: FileCompareIcon,
          title: '文件对比',
          desc: ''
        }
      }
    ]
  }
]

export default MenuRoutes;