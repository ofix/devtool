
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { path, dirname } from 'node:path';
import { fs } from "fs";
import { fileURLToPath } from 'node:url'
import screenshot from 'screenshot-desktop';
import { createCanvas, loadImage } from 'canvas'; // 用于滚动截图拼接

class Screenshot {
    constructor() {
        // 保存截图工具窗口实例，防止重复创建
        this.screenshotToolWindow = null;
        // 滚动截图暂存列表
        this.scrollScreenshotList = [];
    }
    // 创建截图工具窗口
    createScreenshotToolWindow() {
        // 创建ES模块的__dirname
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        // 获取屏幕尺寸
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;

        // 创建独立置顶窗口
        this.screenshotToolWindow = new BrowserWindow({
            width: width,
            height: height,
            frame: false, // 无边框
            alwaysOnTop: true, // 置顶
            transparent: true, // 透明背景
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        // 加载路由（对应渲染进程截图工具页面）
        const entryPath = join(__dirname, '../../dist/renderer/index.html');
        this.screenshotToolWindow.loadURL(`file://${entryPath}#/screenshot/screenshot`);

        // 窗口关闭时重置实例
        this.screenshotToolWindow.on('closed', () => {
            this.screenshotToolWindow = null;
            this.scrollScreenshotList = []; // 清空滚动截图暂存
        });

        // 隐藏菜单栏
        this.screenshotToolWindow.setMenu(null);
    }
    // 注册全局快捷键 Ctrl+Shift+A
    registerGlobalShortcut() {
        // 注册快捷键，注意：是 Ctrl+Shift+A（你原文的 Ctrl+Shirt+A 是笔误）
        const ret = globalShortcut.register('Ctrl+Shift+A', () => {
            // 如果窗口已存在，不重复创建
            if (!this.screenshotToolWindow) {
                createScreenshotToolWindow();
            } else {
                // 窗口已存在，显示到前台
                this.screenshotToolWindow.show();
            }
        });

        if (!ret) {
            console.error('全局快捷键注册失败！');
        }
    }
    // 枚举所有窗口列表（EnumWindowList）
    async enumWindowList() {
        // 简化实现：实际可通过 electron-window-manager 增强，此处返回模拟数据（可根据需求扩展）
        const windows = BrowserWindow.getAllWindows().map((win, index) => ({
            id: win.id,
            name: `窗口${index + 1}`,
            bounds: win.getBounds() // 窗口位置和尺寸
        }));
        return windows;
    }
    // 滚动截图拼接核心算法（优化去重）
    async mergeScrollScreenshots(screenshotList) {
        // 1. 加载所有截图为 Image 实例
        const imageList = [];
        for (const base64 of screenshotList) {
            const img = await loadImage(base64);
            imageList.push({
                img,
                width: img.width,
                height: img.height
            });
        }

        // 2. 计算拼接后的总尺寸（去重逻辑：基于像素相似度判断重复区域）
        let totalWidth = imageList[0].width;
        let totalHeight = 0;
        // 存储已处理的像素区域，用于去重
        const processedPixelRegions = [];

        for (const imgItem of imageList) {
            const { img, width, height } = imgItem;
            // 计算当前图片与已拼接区域的重复高度（优化算法：逐行对比像素相似度）
            let duplicateHeight = 0;
            if (totalHeight > 0) {
                // 最多对比前一张图片的高度（避免过度对比）
                const maxCompareHeight = Math.min(height, totalHeight);
                // 从底部向上对比，找到最大重复高度
                for (let h = 1; h <= maxCompareHeight; h++) {
                    const isDuplicate = this.compareImageRegion(
                        imageList[imageList.indexOf(imgItem) - 1].img,
                        img,
                        width,
                        h
                    );
                    if (isDuplicate) {
                        duplicateHeight = h;
                    } else {
                        break;
                    }
                }
            }
            // 累加非重复高度
            totalHeight += (height - duplicateHeight);
            processedPixelRegions.push({
                img,
                y: totalHeight - (height - duplicateHeight),
                duplicateHeight
            });
        }

        // 3. 创建画布并拼接图片
        const canvas = createCanvas(totalWidth, totalHeight);
        const ctx = canvas.getContext('2d');

        for (const region of processedPixelRegions) {
            const { img, y, duplicateHeight } = region;
            ctx.drawImage(
                img,
                0, duplicateHeight, // 裁剪重复区域
                img.width, img.height - duplicateHeight,
                0, y, // 绘制位置
                img.width, img.height - duplicateHeight
            );
        }

        // 4. 转为 Base64 返回
        return canvas.toDataURL('image/png');
    }

    // 辅助函数：对比两张图片的底部与顶部区域是否重复（像素相似度判断）
    compareImageRegion(prevImg, currImg, width, compareHeight) {
        const prevCanvas = createCanvas(width, compareHeight);
        const prevCtx = prevCanvas.getContext('2d');
        const currCanvas = createCanvas(width, compareHeight);
        const currCtx = currCanvas.getContext('2d');

        // 绘制前一张图片的底部区域
        prevCtx.drawImage(
            prevImg,
            0, prevImg.height - compareHeight,
            width, compareHeight,
            0, 0,
            width, compareHeight
        );

        // 绘制当前图片的顶部区域
        currCtx.drawImage(
            currImg,
            0, 0,
            width, compareHeight,
            0, 0,
            width, compareHeight
        );

        // 获取像素数据
        const prevData = prevCtx.getImageData(0, 0, width, compareHeight).data;
        const currData = currCtx.getImageData(0, 0, width, compareHeight).data;

        // 计算像素相似度（阈值可配置，此处设为 99% 相似度即判定为重复）
        let samePixelCount = 0;
        const totalPixelCount = width * compareHeight * 4; // RGBA 四通道

        for (let i = 0; i < totalPixelCount; i += 4) {
            const rDiff = Math.abs(prevData[i] - currData[i]);
            const gDiff = Math.abs(prevData[i + 1] - currData[i + 1]);
            const bDiff = Math.abs(prevData[i + 2] - currData[i + 2]);
            const aDiff = Math.abs(prevData[i + 3] - currData[i + 3]);

            // 每个通道差值小于 5 即判定为相同像素
            if (rDiff < 5 && gDiff < 5 && bDiff < 5 && aDiff < 5) {
                samePixelCount++;
            }
        }

        const similarity = (samePixelCount / (width * compareHeight)) * 100;
        return similarity >= 99; // 99% 相似度判定为重复区域
    }
}

export default Screenshot;




