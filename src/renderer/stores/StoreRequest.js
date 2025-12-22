import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// 请求方法对应的颜色（对标 Postman，区分不同请求类型）
export const REQUEST_METHOD_COLOR_MAP = {
    GET: '#61affe',      // 蓝色
    POST: '#49cc90',     // 绿色
    PUT: '#fca130',      // 橙色
    PATCH: '#50e3c2',    // 青绿色
    DELETE: '#f93e3e',   // 红色
    DEFAULT: '#909399'   // 灰色
};

// Setup 风格定义 Pinia 仓库
export const useRequestStore = defineStore('request', () => {

    // 请求分组列表：默认包含一个"我的请求"分组
    const groups = ref([
        {
            id: 'default-group-1',
            name: '我的请求',
            expand: true, // 是否展开分组
            createTime: new Date().getTime()
        }
    ]);

    // 请求列表：每个请求关联分组ID
    const requests = ref([]);

    // 按分组聚合请求（便于界面渲染）
    const groupedRequests = computed(() => {
        return groups.value.map(group => ({
            ...group,
            requestList: requests.value.filter(req => req.groupId === group.id)
        }));
    });

    // 根据请求ID获取单个请求
    const getRequestById = computed(() => {
        return (requestId) => {
            return requests.value.find(req => req.id === requestId);
        };
    });

    // -------------------- 分组相关操作 --------------------
    /**
     * 添加新分组
     * @param {string} groupName - 分组名称
     */
    const addGroup = (groupName) => {
        groups.value.push({
            id: `group-${Date.now()}`,
            name: groupName,
            expand: true,
            createTime: new Date().getTime()
        });
    };

    /**
     * 修改分组名称
     * @param {string} groupId - 分组ID
     * @param {string} newName - 新分组名称
     */
    const editGroupName = (groupId, newName) => {
        const group = groups.value.find(g => g.id === groupId);
        if (group) {
            group.name = newName;
        }
    };

    /**
     * 删除分组（同时删除分组下的所有请求）
     * @param {string} groupId - 分组ID
     * @returns {Object} 操作结果
     */
    const deleteGroup = (groupId) => {
        // 禁止删除默认分组
        if (groupId === 'default-group-1') {
            return { success: false, message: '默认分组不可删除' };
        }
        // 删除分组
        groups.value = groups.value.filter(g => g.id !== groupId);
        // 删除该分组下的所有请求
        requests.value = requests.value.filter(req => req.groupId !== groupId);
        return { success: true, message: '分组删除成功' };
    };

    /**
     * 切换分组展开/折叠状态
     * @param {string} groupId - 分组ID
     */
    const toggleGroupExpand = (groupId) => {
        const group = groups.value.find(g => g.id === groupId);
        if (group) {
            group.expand = !group.expand;
        }
    };

    // -------------------- 请求相关操作 --------------------
    /**
     * 添加新请求
     * @param {Object} requestConfig - 请求配置
     * @param {string} [groupId] - 所属分组ID，默认使用第一个分组
     * @returns {Object} 新建的请求对象
     */
    const addRequest = (requestConfig, groupId) => {
        const targetGroupId = groupId || groups.value[0].id;
        const newRequest = {
            id: `request-${Date.now()}`, // 唯一ID
            alias: requestConfig.alias || `${requestConfig.method} ${requestConfig.url.split('/').pop() || '未命名请求'}`, // 请求别名
            groupId: targetGroupId,
            method: requestConfig.method || 'GET',
            url: requestConfig.url,
            headers: requestConfig.headers || [],
            body: requestConfig.body || { formData: [], raw: '{\n  "key": "value"\n}' },
            createTime: new Date().getTime(),
            updateTime: new Date().getTime()
        };
        requests.value.push(newRequest);
        return newRequest;
    };

    /**
     * 修改请求信息（别名、配置等）
     * @param {string} requestId - 请求ID
     * @param {Object} newConfig - 新的请求配置
     */
    const editRequest = (requestId, newConfig) => {
        const request = requests.value.find(req => req.id === requestId);
        if (request) {
            Object.assign(request, {
                ...newConfig,
                updateTime: new Date().getTime()
            });
        }
    };

    /**
     * 删除单个请求
     * @param {string} requestId - 请求ID
     */
    const deleteRequest = (requestId) => {
        requests.value = requests.value.filter(req => req.id !== requestId);
    };

    /**
     * 批量删除请求
     * @param {Array<string>} requestIds - 请求ID数组
     */
    const batchDeleteRequests = (requestIds) => {
        requests.value = requests.value.filter(req => !requestIds.includes(req.id));
    };

    /**
     * 移动请求到指定分组
     * @param {string} requestId - 请求ID
     * @param {string} targetGroupId - 目标分组ID
     */
    const moveRequestToGroup = (requestId, targetGroupId) => {
        const request = requests.value.find(req => req.id === requestId);
        if (request) {
            request.groupId = targetGroupId;
            request.updateTime = new Date().getTime();
        }
    };

    // 暴露状态、计算属性和方法（必须显式暴露，外部才能访问）
    return {
        // 状态
        groups,
        requests,
        // 计算属性
        groupedRequests,
        getRequestById,
        // 分组操作方法
        addGroup,
        editGroupName,
        deleteGroup,
        toggleGroupExpand,
        // 请求操作方法
        addRequest,
        editRequest,
        deleteRequest,
        batchDeleteRequests,
        moveRequestToGroup
    };
});