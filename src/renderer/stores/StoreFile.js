import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useFileStore = defineStore('compressFile', () => {

    /**
     * @param {Object} server 服务器配置
     * {
     *     host: '192.168.1.1',
     *     port: 22, 
     *     username: 'root',
     *     password: 'password',
     *     path: '/root/test.txt',
     *     size:1024,
     *     path:"/usr/share/nginx/html/test.txt"
     * }
     * @returns {string} 返回文件内容，默认utf-8格式
     */
    async function getRemoteFileContents(server) {
        try {
            let result = await window.channel.loadFileContents(server);
            if (result.success) {
                return result.data;;
            }
            return "";
        } catch (e) {
            console.log(e);
            return "";
        }
    }

    /**
     * @param {Object} server 服务器配置
     * @returns {boolean} 返回文件结果
     */
    async function saveRemoteFileContents(server, content) {
        try {
            // 检查本地文件是否存在
            const cacheKey = server.host + ':' + server.remoteFile;
            if (!window.channel.isFileExists(cacheKey)) {
                return false;
            }
            return await window.channel.writeFile(cacheKey, content);
        } catch (e) {

        }
    }

    return {
        getRemoteFileContents,
        saveRemoteFileContents,
    };
});