// 移除 Vue Devtools/Inspector 容器的核心函数
export const removeVueDevtoolsContainers = () => {
    // 轮询检测并删除容器（处理动态注入的情况）
    const checkAndRemove = () => {
        // 目标容器 ID 列表
        const containerIds = ['vue-inspector-container', '__vue-devtools-container__']

        containerIds.forEach(id => {
            const el = document.getElementById(id)
            if (el) {
                el.remove() // 删除容器
                console.log(`已移除调试容器: ${id}`)
            }
        })

        // 同时删除相关的调试样式/脚本
        const devtoolsElements = document.querySelectorAll(
            '[data-v-inspector-ignore], .vue-devtools__, [class*="vue-inspector"]'
        )
        devtoolsElements.forEach(el => el.remove())
    }

    // 立即执行一次
    checkAndRemove()

    // 轮询检测（防止延迟注入），持续 10 秒后停止
    let timer = setInterval(checkAndRemove, 200)
    setTimeout(() => clearInterval(timer), 10000)

    // 监听 DOM 变化，实时删除新注入的容器
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                checkAndRemove()
            }
        })
    })

    // 监听 body 下的所有 DOM 变化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    })

    // 页面卸载时停止监听
    window.addEventListener('unload', () => {
        observer.disconnect()
        clearInterval(timer)
    })
}

