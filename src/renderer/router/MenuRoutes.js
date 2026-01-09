// 菜单图标集合
import SSHIcon from "@/components/icons/IconSSH.vue";
import SearchIcon from "@/components/icons/IconSearch.vue";
import FileCompareIcon from "@/components/icons/IconFileCompare.vue";
import VSCodeLayout from '@/layout/VSCodeLayout.vue'
import PostWomanLayout from "@/layout/PostWomanLayout.vue";
import VideoRecordLayout from "@/layout/VideoRecordLayout.vue";
import ScreenshotTool from "@/views/Screenshot/ScreenshotTool.vue";
import Capture from "@/views/Screenshot/Capture.vue";

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
                name: 'request',
                component: PostWomanLayout,
                meta: {
                    icon: SSHIcon,
                    title: 'https请求',
                    desc: ''
                }
            },
        ]
    },
    {
        path: '/screenshot',
        name: 'screenshot',
        component: ScreenshotTool,
        redirect: '/screenshot/toolbar',
        meta: {
            icon: SSHIcon,
            title: '桌面截图',
            desc: ''
        },
        children: [
            {
                path: '/screenshot/toolbar',
                name: 'screenshot-toolbar',
                component: ScreenshotTool,
                meta: {
                    icon: SSHIcon,
                    title: '可移动截图工具',
                    desc: ''
                }
            },
            {
                path: '/screenshot/capture-full',
                name: 'capture-full',
                component: Capture,
                meta: {
                    icon: SSHIcon,
                    title: '全屏截图',
                    desc: ''
                }
            },
            {
                path: '/screenshot/capture-window',
                name: 'capture-window',
                component: Capture,
                meta: {
                    icon: SSHIcon,
                    title: '窗口截图',
                    desc: ''
                }
            },
            {
                path: '/screenshot/capture-scroll',
                name: 'capture-scroll',
                component: Capture,
                meta: {
                    icon: SSHIcon,
                    title: '滚动截图',
                    desc: ''
                }
            },
        ]
    },
    {
        path: '/videorecord',
        name: 'videorecord',
        component: VideoRecordLayout,
        redirect: '/videorecord/videorecord',
        meta: {
            icon: SSHIcon,
            title: '视频录像',
            desc: ''
        },
        children: [
            {
                path: '/videorecord/videorecord',
                name: 'videorecord-main',
                component: VideoRecordLayout,
                meta: {
                    icon: SSHIcon,
                    title: '视频录像',
                    desc: ''
                }
            },
        ]
    }
]

export default MenuRoutes;