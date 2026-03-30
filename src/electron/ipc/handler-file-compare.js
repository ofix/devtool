import { ipcMain, dialog } from 'electron';
import { diffFileContent } from '../core/FileDiff.js';
import { DirDiff } from '../core/DirDiff.js';
// import FileOperationManager from '../service/FileOperationManager.js';

class FileCompareHandler {
    constructor() {
        // this.fileManager = new FileOperationManager();
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('select-file', async (event, side) => {
            const result = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{
                    name: 'Text Files',
                    extensions: ['vue', 'cc', 'cpp', 'c', 'txt', 'js', 'php', 'py', 'make', 'json', 'md', 'cjs', 'java', 'dart']
                }],
                modal: true
            });
            if (!result.canceled && result.filePaths.length > 0) {
                return { path: result.filePaths[0], side };
            }
            return null;
        });

        // ipcMain.handle('read-file-content', async (event, filePath) => {
        //   try {
        //     const lines = await this.fileManager.readFileLines(filePath);
        //     return { success: true, lines };
        //   } catch (error) {
        //     console.error('读取文件失败：', error);
        //     return { success: false, error: error.message };
        //   }
        // });

        ipcMain.handle('diff-file-content', async (event, leftLines, rightLines) => {
            try {
                return diffFileContent(leftLines, rightLines);
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('select-folder', async () => {
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openDirectory', 'createDirectory'],
                    title: '选择目标文件夹',
                    modal: true
                });
                if (!result.canceled && result.filePaths.length > 0) {
                    return result.filePaths[0];
                }
                return null;
            } catch (error) {
                console.error('选择文件夹时发生错误:', error);
                return null;
            }
        });

        ipcMain.handle('load-folder', async (event, dirPath) => {
            const dirDiff = new DirDiff();
            return await dirDiff.scanDirRecursive(dirPath);
        });

        ipcMain.handle('diff-folder', async (event, folderA, folderB, ignorePatterns = [/\.DS_Store$/, /Thumbs\.db$/]) => {
            const dirDiff = new DirDiff();
            return await dirDiff.compareFolders(folderA, folderB);
        });
    }
}

export default new FileCompareHandler();