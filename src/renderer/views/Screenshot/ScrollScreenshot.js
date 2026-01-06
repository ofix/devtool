class ScrollScreenshot {
    constructor() {
        this.screenshotList = [];
    }
    // 添加截图片段
    addPiece(base64) {
        this.screenshotList.push(base64);
    }
    // 清空滚动截图
    clear() {
        this.screenshotList = [];
    }
    async merge() {
        // 加载所有截图为 Image 实例
        const imageList = [];
        for (const base64 of this.screenshotList) {
            const img = await loadImage(base64);
            imageList.push({
                img,
                width: img.width,
                height: img.height
            });
        }

        // 计算拼接后的总尺寸（去重逻辑：基于像素相似度判断重复区域）
        let totalWidth = imageList[0].width;
        let totalHeight = 0;
        // 存储已处理的像素区域，用于去重
        const processedPixelRegions = [];

        for (const image of imageList) {
            const { img, width, height } = image;
            // 计算当前图片与已拼接区域的重复高度（优化算法：逐行对比像素相似度）
            let duplicateHeight = 0;
            if (totalHeight > 0) {
                // 最多对比前一张图片的高度（避免过度对比）
                const maxCompareHeight = Math.min(height, totalHeight);
                // 从底部向上对比，找到最大重复高度
                for (let h = 1; h <= maxCompareHeight; h++) {
                    const isDuplicate = this.compareImageRegion(
                        imageList[imageList.indexOf(image) - 1].img,
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

        // 创建画布并拼接图片
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

        // 转为 Base64 返回
        return canvas.toDataURL('image/png');
    }
}

export default ScrollScreenshot;