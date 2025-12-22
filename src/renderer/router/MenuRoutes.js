// 菜单图标集合
import SSHIcon from "@/components/icons/IconSSH.vue";
import SearchIcon from "@/components/icons/IconSearch.vue";
import FileCompareIcon from "@/components/icons/IconFileCompare.vue";
import VSCodeLayout from '@/layout/VSCodeLayout.vue'
import PostWomanLayout from "@/layout/PostWomanLayout.vue";

const MenuRoutes = [
    {
        path: '/',
        redirect: '/postwoman/request' // 可修改为你需要的默认路由，如 '/debug-tool/ssh'
    },
    {
        path: '/debug-tool',
        name: 'Root',
        component: VSCodeLayout,
        redirect: '/debug-tool/ssh',
        meta: {
            icon: SSHIcon,
            title: '界面调试',
            desc: ''
        },
        children: [
            {
                path: '/debug-tool/ssh',
                name: 'SSH',
                component: () => import('@/views/DebugTool/SSHPanel.vue'),
                meta: {
                    icon: SSHIcon,
                    title: '界面调试',
                    desc: ''
                }
            },
            {
                path: '/debug-tool/search-replace',
                name: 'SearchReplace',
                component: () => import('@/views/DebugTool/SearchReplacePanel.vue'),
                meta: {
                    icon: SearchIcon,
                    title: '查找替换',
                    desc: ''
                }
            },
            {
                path: '/debug-tool/file-compare',
                name: 'FileCompare',
                component: () => import('@/views/DebugTool/FileComparePanel.vue'),
                meta: {
                    icon: FileCompareIcon,
                    title: '文件对比',
                    desc: ''
                }
            }
        ],
    },
    {
        path: '/postwoman',
        name: 'postwoman',
        component: PostWomanLayout,
        redirect: '/postwoman/request',
        meta: {
            icon: SSHIcon,
            title: 'HTTPS请求',
            desc: ''
        },
        children: [
            {
                path: '/postwoman/request',
                name: 'main',
                component: PostWomanLayout,
                meta: {
                    icon: SSHIcon,
                    title: 'https请求',
                    desc: ''
                }
            },
        ]
    }
]

export default MenuRoutes;