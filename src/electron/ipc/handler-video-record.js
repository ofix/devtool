import { ipcMain } from 'electron';
import VideoRecorder from '../service/VideoRecorder.js';

class VideoRecordHandler {
    constructor() {
        this.recorders = new Map(); // 存储录制器实例
        this.registerHandlers();
    }

    registerHandlers() {
        ipcMain.handle('video-record:start', async (event, options) => {
            try {
                const { type, savePath, bounds, windowId, config } = options;
                let result;

                if (type == 'region') {
                    result = await VideoRecorder.startRecording({
                        type: 'region',
                        savePath,
                        bounds,
                        config: config || { fps: 30 }
                    });
                } else if (type == 'window') {
                    result = await VideoRecorder.startRecording({
                        type: 'window',
                        savePath,
                        windowId,
                        config: config || { format: 'mkv' }
                    });
                } else if (type == 'fullscreen') {
                    result = await VideoRecorder.startRecording({
                        type: 'fullscreen',
                        savePath,
                        config: config || { fps: 60, preset: 'ultrafast' }
                    });
                }

                if (result && result.id) {
                    this.recorders.set(result.id, result);
                }
                return result;
            } catch (error) {
                console.error('开始录制失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('video-record:pause', async (event, id) => {
            try {
                const recorder = this.recorders.get(id);
                if (!recorder) {
                    throw new Error('录制器不存在');
                }
                await recorder.pause();
                return { success: true };
            } catch (error) {
                console.error('暂停录制失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('video-record:resume', async (event, id) => {
            try {
                const recorder = this.recorders.get(id);
                if (!recorder) {
                    throw new Error('录制器不存在');
                }
                await recorder.resume();
                return { success: true };
            } catch (error) {
                console.error('恢复录制失败:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('video-record:stop', async (event, id) => {
            try {
                const recorder = this.recorders.get(id);
                if (!recorder) {
                    throw new Error('录制器不存在');
                }
                const result = await recorder.stop();
                this.recorders.delete(id);
                return { success: true, path: result.path };
            } catch (error) {
                console.error('停止录制失败:', error);
                return { success: false, error: error.message };
            }
        });
    }
}

export default new VideoRecordHandler();