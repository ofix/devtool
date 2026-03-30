import { ipcMain, desktopCapturer, screen } from 'electron';
import screenshot from 'screenshot-desktop';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import WndManager from '../service/WndManager.js';
class ScreenshotHandler {
    constructor() {
        this.registerHandlers();
    }

    /**
    * 格式：screenshot_1740600000000_123456
    * @returns {string} 唯一截图ID
    */
    generateScreenshotId() {
        // 1. 获取当前毫秒级时间戳（确保不同时间的ID不同）
        const timestamp = Date.now();
        // 2. 生成6位随机数（000000-999999，确保同一毫秒内多次调用不重复）
        const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        // 3. 拼接成唯一ID（加前缀便于识别）
        return `screenshot_${timestamp}_${random}`;
    }

    // 预加载全屏截图（核心：提前获取，减少渲染进程等待）
    async preloadScreenshot(method = 'base64') {
        try {
            // 使用 screenshot-desktop
            const screenshotId = this.generateScreenshotId();
            if (method == 'base64') {
                const pngBuffer = await screenshot({ format: 'png' });
                const base64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
                return base64;
            } else if (method == 'buffer') {
                const primaryDisplay = screen.getPrimaryDisplay();
                // 强制转为整数，避免浮点数导致的类型转换失败
                const screenWidth = Math.floor(primaryDisplay.size.width);
                const screenHeight = Math.floor(primaryDisplay.size.height);
                const sources = await desktopCapturer.getSources({
                    types: ['screen'],
                    thumbnailSize: { width: screenWidth, height: screenHeight }, // 按需调整分辨率
                    fetchWindowIcons: false // 关闭窗口图标获取，减少耗时
                });
                const mainScreenSource = sources[0];
                if (!mainScreenSource) return null;

                await new Promise(resolve => setTimeout(resolve, 30));
                // 获取原生 Buffer
                const imageBuffer = mainScreenSource.thumbnail.toPNG(); // 直接获取 PNG 二进制 Buffer
                // 直接返回 Buffer 给渲染进程（Electron 支持 IPC 传输 Buffer）
                // const savePath = path.join(os.homedir(), '桌面', 'test-screenshot.png');
                // await fs.writeFile(savePath, imageBuffer);
                // console.log(`PNG 已保存到：${savePath}`);
                if (mainScreenSource.thumbnail) {
                    mainScreenSource.thumbnail = null;
                }
                return imageBuffer;
            } else {
                const tempPath = path.join(os.tmpdir(), `${screenshotId}.png`);
                // 写入PNG Buffer（同步写入，内存文件速度极快）
                await fs.writeFile(tempPath, pngBuffer);
                this.screenshotPool.set(screenshotId, {
                    buffer: pngBuffer,
                    pngPath: tempPath,
                    createTime: Date.now()
                });
                return {
                    success: true,
                    screenshotId,
                    pngPath: tempPath,
                };
            }
        } catch (error) {
            console.error('预加载截图失败：', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    registerHandlers() {
        ipcMain.handle('get-desktop-screenshot', async (event, method) => {
            return await this.preloadScreenshot(method);
        });

        ipcMain.handle('capture-area', async (_, rect) => {
            try {
                if (!rect || rect.width <= 0 || rect.height <= 0) {
                    throw new Error('无效的截取区域');
                }

                const display = screen.getPrimaryDisplay();
                const scaleFactor = display.scaleFactor;

                const captureOptions = {
                    format: 'png',
                    x: rect.x * scaleFactor,
                    y: rect.y * scaleFactor,
                    width: rect.width * scaleFactor,
                    height: rect.height * scaleFactor
                };

                const imgBuffer = await screenshot(captureOptions);
                const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                return { dataUrl: base64, rect };
            } catch (error) {
                console.error('区域截图失败：', error);
                return null;
            }
        });

        ipcMain.handle('start-screenshot', async (event, option) => {
            await this.preloadScreenshot('base64');
            const manager = WndManager.getInstance();
            manager.hideWindow('ScreenshotToolWnd');
            manager.showWindow('CaptureWnd', option);
        });

        ipcMain.handle('cancel-screenshot', async () => {
            const manager = WndManager.getInstance();
            manager.closeWindow('CaptureWnd');
            manager.showWindow('ScreenshotToolWnd');
        });

        ipcMain.handle('finish-screenshot', async () => {
            const manager = WndManager.getInstance();
            manager.closeWindow('CaptureWnd');
            manager.showWindow('ScreenshotToolWnd');
        });

        ipcMain.on('save-scroll-screenshot', (event, screenshotBase64) => {
            // 暂存滚动截图的逻辑
            console.log('保存滚动截图:', screenshotBase64.substring(0, 100));
        });

        ipcMain.handle('enum-window-list', async () => {
            return native.getAllWindows();
        });

        ipcMain.handle("get-record-sources", async () => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['window'],
                    thumbnailSize: { width: 0, height: 0 },
                });
                return sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    display_id: source.display_id
                }));
            } catch (error) {
                console.error('枚举窗口失败:', error);
                return [];
            }
        });
    }
}

export default new ScreenshotHandler();