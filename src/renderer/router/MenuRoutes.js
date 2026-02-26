// 所有页面/布局组件改为异步导入 + 配置webpackChunkName实现打包分片
// 定义异步导入函数（统一管理chunk名称，便于打包分片识别）
const loadView = (view, chunkName = view) => {
    // 魔法注释 /* webpackChunkName: "xxx" */ 用于指定打包分片名称
    // Vite 环境下自动支持分片，注释仅作标识
    return () => import(/* webpackChunkName: "chunk-[request]" */ `@/views/${view}.vue`);
};

const loadLayout = (layout, chunkName = layout) => {
    return () => import(/* webpackChunkName: "layout-[request]" */ `@/layout/${layout}.vue`);
};

// 动态路由配置（所有组件均为异步导入，支持打包分片）
const MenuRoutes = [
    {
        path: '/',
        redirect: '/postwoman/request', // 默认路由
        meta: { hidden: true } // 隐藏默认重定向路由
    },
    {
        path: '/main-app',
        name: 'main-app',
        // 分片名称：chunk-Main/AppEntry
        component: () => import(/* webpackChunkName: "chunk-Main/AppEntry" */ '@/views/Main/AppEntry.vue'),
        meta: {
            title: '主应用',
            desc: '',
            // 可选：自定义分片组，便于按模块打包
            chunkGroup: 'main'
        }
    },
    {
        path: '/debug-wnd',
        name: 'DebugWnd',
        // 分片名称：chunk-DebugLogger/LogViewer
        component: () => import(/* webpackChunkName: "chunk-DebugLogger/LogViewer" */ '@/views/DebugLogger/LogViewer.vue'),
        meta: {
            title: '内部调试窗口',
            desc: '',
            chunkGroup: 'debug'
        },
    },
    {
        path: '/debug-tool',
        name: 'DebugTool',
        // 布局组件单独分片：layout-VSCodeLayout
        component: loadLayout('VSCodeLayout'),
        redirect: '/debug-tool/ssh',
        meta: {
            title: '界面调试',
            desc: '',
            chunkGroup: 'debug'
        },
        children: [
            {
                path: 'ssh', // 简化子路由path（无需重复父路径）
                name: 'SSH',
                component: () => import(/* webpackChunkName: "chunk-DebugTool/SSHPanel" */ '@/views/DebugTool/SSHPanel.vue'),
                meta: {
                    title: '界面调试',
                    desc: '',
                    chunkGroup: 'debug'
                }
            },
            {
                path: 'search-replace',
                name: 'SearchReplace',
                component: () => import(/* webpackChunkName: "chunk-DebugTool/SearchReplacePanel" */ '@/views/DebugTool/SearchReplacePanel.vue'),
                meta: {
                    title: '查找替换',
                    desc: '',
                    chunkGroup: 'debug'
                }
            },
        ],
    },
    {
        path: '/postwoman',
        name: 'postwoman',
        component: loadLayout('PostWomanLayout'),
        redirect: '/postwoman/request',
        meta: {
            title: 'HTTPS请求',
            desc: '',
            chunkGroup: 'network'
        },
        children: [
            {
                path: 'request',
                name: 'request',
                component: loadLayout('PostWomanLayout'),
                meta: {
                    title: 'https请求',
                    desc: '',
                    chunkGroup: 'network'
                }
            },
        ]
    },
    {
        path: '/screenshot',
        name: 'screenshot',
        component: () => import(/* webpackChunkName: "chunk-Screenshot/ScreenshotTool" */ '@/views/Screenshot/ScreenshotTool.vue'),
        redirect: '/screenshot/toolbar',
        meta: {
            title: '桌面截图',
            desc: '',
            chunkGroup: 'screenshot'
        },
        children: [
            {
                path: 'toolbar',
                name: 'screenshot-toolbar',
                component: () => import(/* webpackChunkName: "chunk-Screenshot/ScreenshotTool" */ '@/views/Screenshot/ScreenshotTool.vue'),
                meta: {

                    title: '可移动截图工具',
                    desc: '',
                    chunkGroup: 'screenshot'
                }
            },
        ]
    },
    {
        path: '/screenshot/capture',
        name: 'capture',
        component: () => import(/* webpackChunkName: "chunk-Screenshot/Capture" */ '@/views/Screenshot/Capture.vue'),
        meta: {
            title: '截图',
            desc: '',
            chunkGroup: 'screenshot'
        }
    },
    {
        path: '/color-picker',
        name: 'color-picker',
        component: () => import(/* webpackChunkName: "chunk-ColorPicker" */ '@/views/ColorPicker/ColorPicker.vue'),
        meta: {
            title: '屏幕拾色器',
            desc: '',
            chunkGroup: 'colorpicker'
        }
    },
    {
        path: '/color-palette',
        name: 'color-palette',
        component: () => import(/* webpackChunkName: "chunk-ColorPicker" */ '@/views/ColorPicker/ColorPalette.vue'),
        meta: {
            title: '调色板',
            desc: '',
            chunkGroup: 'colorpicker'
        }
    },
    {
        path: '/screen-ruler',
        name: 'screen-ruler',
        component: () => import(/* webpackChunkName: "chunk-Screenshot/ScreenRuler" */ '@/views/Screenshot/ScreenRuler.vue'),
        meta: {
            title: '屏幕标尺',
            desc: '',
            chunkGroup: 'screenshot'
        }
    },
    {
        path: '/measure-line',
        name: 'measure-line',
        component: () => import(/* webpackChunkName: "chunk-Screenshot/MeasureLine" */ '@/views/Screenshot/MeasureLine.vue'),
        meta: {
            title: '屏幕测量线',
            desc: '',
            chunkGroup: 'screenshot'
        }
    },
    {
        path: '/tool-config',
        name: 'tool-config',
        component: () => import(/* webpackChunkName: "chunk-ToolConfig/AllConfig" */ '@/views/ToolConfig/AllConfig.vue'),
        meta: {
            title: '配置弹窗',
            desc: '',
            chunkGroup: 'config'
        }
    },
    {
        path: '/tray-app',
        name: 'tray-app',
        component: () => import(/* webpackChunkName: "chunk-Tray/TrayEntry" */ '@/views/Tray/TrayEntry.vue'),
        meta: {
            title: '托盘应用',
            desc: '',
            chunkGroup: 'tray'
        }
    },
    {
        path: '/unit-convert',
        name: 'unit-conert',
        component: () => import(/* webpackChunkName: "chunk-Misc/UnitConvert" */ '@/views/Misc/UnitConvert.vue'),
        meta: {
            title: '单位换算',
            desc: '',
            chunkGroup: 'misc'
        }
    },
    {
        path: '/file-compare',
        name: 'FileCompare',
        component: () => import(/* webpackChunkName: "chunk-FileCompare/FileCompareEntry" */ '@/views/FileCompare/FileCompareEntry.vue'),
        meta: {
            title: '文件对比',
            desc: '',
            chunkGroup: 'file'
        }
    },
    {
        path: '/videorecord',
        name: 'videorecord',
        component: loadLayout('VideoRecordLayout'),
        redirect: '/videorecord/videorecord',
        meta: {
            title: '视频录像',
            desc: '',
            chunkGroup: 'video'
        },
        children: [
            {
                path: 'videorecord',
                name: 'videorecord-main',
                component: loadLayout('VideoRecordLayout'),
                meta: {
                    title: '视频录像',
                    desc: '',
                    chunkGroup: 'video'
                }
            },
        ]
    }
];

export default MenuRoutes;