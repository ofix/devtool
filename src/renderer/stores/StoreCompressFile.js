import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useCompressFileStore = defineStore('compressFile', () => {

    /**
     * @param {Object} server 服务器配置
     * @returns {string} 返回文件内容，默认utf-8格式
     */
   async function readRemoteFile(server) {
        try {
            // 检查本地文件是否存在
            const cacheKey = server.host+':'+server.remoteFile;
            if(!window.channel.isFileExists(cacheKey)){
                await window.channel.sshDownloadToMMF(server,compressFileFullPath);
            }
            let data = window.channel.readFile(cacheKey);
            return data;
        } catch (e) {
            
        }
    }

    /**
     * @param {Object} server 服务器配置
     * @returns {boolean} 返回文件结果
     */
    async function saveRemoteFile(server,content){
        try{
            // 检查本地文件是否存在
            const cacheKey = server.host+':'+server.remoteFile;
            if(!window.channel.isFileExists(cacheKey)){
                return false;
            }
            return await window.channel.writeFile(cacheKey,content);
        }catch(e){

        }
    }

    return {
        readRemoteFile,
        saveRemoteFile,
    };
});