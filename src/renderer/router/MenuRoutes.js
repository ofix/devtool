// 菜单图标集合
import SSHIcon from "@/components/icons/IconSSH.vue";
import SearchIcon from "@/components/icons/IconSearch.vue";
import FileCompareIcon from "@/components/icons/IconFileCompare.vue";
import VSCodeLayout from '@/layout/VSCodeLayout.vue'

const MenuRoutes = [
  {
    path: '/',
    name: 'Root',
    component: VSCodeLayout,
    redirect: '/debug',
    meta: {
      icon: SSHIcon,
      title: '界面调试',
      desc: ''
    },
    children: [
      {
        path: '/debug',
        name: 'Debug',
        component: () => import('@/views/Debug/Debug.vue'),
        meta: {
          icon: SSHIcon,
          title: '界面调试',
          desc: ''
        }
      },
      {
        path: '/search-replace',
        name: 'SearchReplace',
        component: () => import('@/views/SearchReplace/SearchReplace.vue'),
        meta: {
          icon: SearchIcon,
          title: '查找替换',
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