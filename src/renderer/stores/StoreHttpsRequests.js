import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'

let requestId = 0;
function nanoid() {
    return requestId++;
}
// 请求默认结构
const getDefaultRequest = () => {
    return reactive({
        id: nanoid(),
        alias: "未命名请求",
        method: "GET",
        url: "",
        params: reactive([{ key: "", value: "", desc: "" }]),
        headers: reactive([{ key: "", value: "" }]),
        body: reactive({
            form: reactive([{ key: "", value: "", desc: "" }]),
            raw: "{}",
        }),
        response: reactive({
            status: null,
            statusText: "",
            data: null,
            headers: [],
            cookies: []
        })
    })
};

// 分组默认结构
const getDefaultGroup = (name) => ({
    id: nanoid(),
    name,
    expand: true,
    requestList: []
})

// 采用Pinia setup语法定义仓库
export const useHttpsRequestStore = defineStore('httpsRequest', () => {
    // ==================== 状态定义（对应原state） ====================
    // 所有请求（包含分组信息）
    const groupedRequests = ref([
        getDefaultGroup("默认分组") // 默认分组
    ])

    // 所有标签页请求（用于标签页管理，与分组请求关联）
    const allRequests = ref([
        getDefaultRequest() // 默认一个请求标签页
    ])

    // 当前活动的请求ID
    const activeRequestId = ref("")

    // ==================== 计算属性定义（对应原getters） ====================
    // 获取当前活动请求
    const activeRequest = computed(() => {
        return allRequests.value.find(req => req.id === activeRequestId.value) || allRequests.value[0]
    })

    // 根据ID获取请求（返回一个函数）
    const getRequestById = computed(() => {
        return (requestId) => allRequests.value.find(req => req.id === requestId)
    })

    // ==================== 方法定义（对应原actions，全部用function声明） ====================
    // ==================== 标签页相关操作 ====================
    // 新增请求标签页
    function addRequestTab() {
        const newRequest = getDefaultRequest()
        allRequests.value.push(newRequest)
        setActiveRequest(newRequest.id)
        return newRequest
    }

    // 切换当前活动请求
    function setActiveRequest(requestId) {
        activeRequestId.value = requestId
    }

    // 关闭请求标签页
    function closeRequestTab(requestId) {
        const index = allRequests.value.findIndex(req => req.id === requestId)
        if (index === -1) return

        // 如果关闭的是当前活动标签页，切换到相邻标签
        if (activeRequestId.value === requestId) {
            const newActiveId = allRequests.value[index - 1]?.id || allRequests.value[index + 1]?.id || ""
            setActiveRequest(newActiveId)
        }

        allRequests.value.splice(index, 1)
        // 同时删除分组中的对应请求
        deleteRequest(requestId)
    }

    // ==================== 请求内容编辑相关 ====================
    // 更新请求信息（url、method、headers等）
    function updateRequest(requestId, updateData) {
        const request = getRequestById.value(requestId)
        if (request) {
            Object.assign(request, updateData)
        }
    }

    // 更新请求响应数据
    function updateRequestResponse(requestId, responseData) {
        const request = getRequestById.value(requestId)
        if (request) {
            request.response = { ...request.response, ...responseData }
        }
    }

    // ==================== 分组相关操作 ====================
    // 新增分组
    function addGroup(groupName) {
        groupedRequests.value.push(getDefaultGroup(groupName))
    }

    // 编辑分组名称
    function editGroupName(groupId, newName) {
        const group = groupedRequests.value.find(g => g.id === groupId)
        if (group) {
            group.name = newName
        }
    }

    // 删除分组
    function deleteGroup(groupId) {
        const index = groupedRequests.value.findIndex(g => g.id === groupId)
        if (index === -1) {
            return { success: false, message: "分组不存在" }
        }

        // 获取分组下的所有请求ID并删除
        const requestIds = groupedRequests.value[index].requestList.map(req => req.id)
        requestIds.forEach(id => closeRequestTab(id))

        groupedRequests.value.splice(index, 1)
        return { success: true, message: "分组删除成功" }
    }

    // 切换分组展开/折叠
    function toggleGroupExpand(groupId) {
        const group = groupedRequests.value.find(g => g.id === groupId)
        if (group) {
            group.expand = !group.expand
        }
    }

    // ==================== 分组内请求操作 ====================
    // 新增请求到分组
    function addRequest(requestData, groupId) {
        const newRequest = { ...getDefaultRequest(), ...requestData }
        // 添加到标签页列表
        if (!allRequests.value.find(req => req.id === newRequest.id)) {
            allRequests.value.push(newRequest)
        }
        // 添加到分组
        const targetGroup = groupId
            ? groupedRequests.value.find(g => g.id === groupId)
            : groupedRequests.value[0] // 默认添加到第一个分组
        if (targetGroup) {
            targetGroup.requestList.push(newRequest)
        }
        return newRequest
    }

    // 编辑请求信息
    function editRequest(requestId, updateData) {
        const request = getRequestById.value(requestId)
        if (request) {
            Object.assign(request, updateData)
            // 同步更新分组中的请求
            groupedRequests.value.forEach(group => {
                const groupRequestIndex = group.requestList.findIndex(req => req.id === requestId)
                if (groupRequestIndex !== -1) {
                    group.requestList[groupRequestIndex] = { ...group.requestList[groupRequestIndex], ...updateData }
                }
            })
        }
    }

    // 删除请求
    function deleteRequest(requestId) {
        // 从标签页列表删除
        allRequests.value = allRequests.value.filter(req => req.id !== requestId)
        // 从分组中删除
        groupedRequests.value.forEach(group => {
            group.requestList = group.requestList.filter(req => req.id !== requestId)
        })
    }

    // 暴露状态、计算属性和方法（必须显式暴露才能在组件中使用）
    return {
        // 状态
        groupedRequests,
        allRequests,
        activeRequestId,
        // 计算属性
        activeRequest,
        getRequestById,
        // 方法
        addRequestTab,
        setActiveRequest,
        closeRequestTab,
        updateRequest,
        updateRequestResponse,
        addGroup,
        editGroupName,
        deleteGroup,
        toggleGroupExpand,
        addRequest,
        editRequest,
        deleteRequest
    }
})