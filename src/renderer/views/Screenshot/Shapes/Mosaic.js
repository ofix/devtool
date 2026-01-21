import Shape from "./Shape.js";

// 马赛克标注类
export default class Mosaic extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'mosaic';
        this.strokeStyle = options.strokeStyle || '#FF0000'; // 马赛克通常不需要描边
        this.fillStyle = options.fillStyle || 'transparent';
        this.lineWidth = options.lineWidth || 1;
        this.dashed = false;
        this.width = options.width || 100; // 马赛克区域宽度
        this.height = options.height || 100; // 马赛克区域高度
        this.blockSize = options.blockSize || 10; // 马赛克块大小（关键参数）
        this.intensity = options.intensity || 0.8; // 马赛克强度 (0-1)
        this.mosaicType = options.mosaicType || 'pixelate'; // 马赛克类型：pixelate, blur, pattern
        this.pattern = options.pattern || 'square'; // 马赛克图案：square, circle, diamond
        this.isDrawing = false; // 是否正在绘制马赛克区域
        this.originalImageData = null; // 存储原始图像数据
        this.mosaicData = null; // 存储马赛克处理后的数据
        this.backgroundCanvas = null; // 用于处理的离屏canvas
        this.backgroundColor = options.backgroundColor || 'transparent';
        
        // 马赛克特有的属性
        this.edgeSoftness = options.edgeSoftness || 0; // 边缘柔化程度
        this.randomness = options.randomness || 0.1; // 马赛克块随机偏移
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 如果马赛克区域太小，不绘制
        if (this.width <= 0 || this.height <= 0) {
            this.restoreTransform(transformedCtx);
            return;
        }
        
        // 保存当前画布状态
        transformedCtx.save();
        
        // 绘制马赛克效果
        if (this.mosaicData) {
            // 如果有预处理好的马赛克数据，直接绘制
            transformedCtx.putImageData(this.mosaicData, this.x, this.y);
        } else {
            // 实时生成马赛克效果
            this.generateMosaic(transformedCtx);
        }
        
        // 绘制边框（选中状态）
        if (this.selected) {
            transformedCtx.strokeStyle = '#ff0000';
            transformedCtx.lineWidth = 2;
            transformedCtx.setLineDash([5, 5]);
            transformedCtx.strokeRect(this.x, this.y, this.width, this.height);
        }
        
        transformedCtx.restore();
        
        // 绘制旋转中心点（用于调试）
        if (this.selected) {
            this.drawRotationHandle(transformedCtx);
        }
        
        this.restoreTransform(transformedCtx);
    }

    /**
     * 生成马赛克效果
     */
    generateMosaic(ctx) {
        // 获取当前区域的图像数据
        const imageData = ctx.getImageData(this.x, this.y, this.width, this.height);
        
        // 根据马赛克类型处理图像数据
        switch (this.mosaicType) {
            case 'pixelate':
                this.applyPixelateMosaic(imageData);
                break;
            case 'blur':
                this.applyBlurMosaic(imageData);
                break;
            case 'pattern':
                this.applyPatternMosaic(imageData);
                break;
            default:
                this.applyPixelateMosaic(imageData);
        }
        
        // 绘制处理后的图像数据
        ctx.putImageData(imageData, this.x, this.y);
    }

    /**
     * 应用像素化马赛克（标准马赛克效果）
     */
    applyPixelateMosaic(imageData) {
        const { width, height, data } = imageData;
        const blockSize = Math.max(2, this.blockSize); // 最小块大小为2像素
        
        // 按块处理图像
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                // 计算当前块的实际大小
                const blockWidth = Math.min(blockSize, width - x);
                const blockHeight = Math.min(blockSize, height - y);
                
                // 计算当前块的平均颜色
                const avgColor = this.getBlockAverageColor(data, width, x, y, blockWidth, blockHeight);
                
                // 填充整个块为平均颜色
                this.fillBlockWithColor(data, width, x, y, blockWidth, blockHeight, avgColor);
            }
        }
    }

    /**
     * 应用模糊马赛克（高斯模糊效果）
     */
    applyBlurMosaic(imageData) {
        const { width, height, data } = imageData;
        const blockSize = Math.max(2, this.blockSize);
        const blurRadius = Math.floor(blockSize * this.intensity);
        
        // 简单盒式模糊实现
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                const blockWidth = Math.min(blockSize, width - x);
                const blockHeight = Math.min(blockSize, height - y);
                
                // 获取扩展区域的颜色（用于模糊）
                const extendedColor = this.getExtendedBlockAverageColor(
                    data, width, x, y, blockWidth, blockHeight, blurRadius
                );
                
                // 应用模糊效果
                this.fillBlockWithBlur(data, width, x, y, blockWidth, blockHeight, extendedColor);
            }
        }
    }

    /**
     * 应用图案马赛克（特殊图案效果）
     */
    applyPatternMosaic(imageData) {
        const { width, height, data } = imageData;
        const blockSize = Math.max(2, this.blockSize);
        
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                const blockWidth = Math.min(blockSize, width - x);
                const blockHeight = Math.min(blockSize, height - y);
                
                const avgColor = this.getBlockAverageColor(data, width, x, y, blockWidth, blockHeight);
                
                // 根据图案类型填充
                switch (this.pattern) {
                    case 'circle':
                        this.fillBlockWithCirclePattern(data, width, x, y, blockWidth, blockHeight, avgColor);
                        break;
                    case 'diamond':
                        this.fillBlockWithDiamondPattern(data, width, x, y, blockWidth, blockHeight, avgColor);
                        break;
                    default: // square
                        this.fillBlockWithColor(data, width, x, y, blockWidth, blockHeight, avgColor);
                }
            }
        }
    }

    /**
     * 获取图像块的平均颜色
     */
    getBlockAverageColor(data, imageWidth, startX, startY, blockWidth, blockHeight) {
        let r = 0, g = 0, b = 0, a = 0;
        let pixelCount = 0;
        
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                r += data[index];
                g += data[index + 1];
                b += data[index + 2];
                a += data[index + 3];
                pixelCount++;
            }
        }
        
        return {
            r: Math.floor(r / pixelCount),
            g: Math.floor(g / pixelCount),
            b: Math.floor(b / pixelCount),
            a: Math.floor(a / pixelCount)
        };
    }

    /**
     * 获取扩展区域的平均颜色（用于模糊）
     */
    getExtendedBlockAverageColor(data, imageWidth, startX, startY, blockWidth, blockHeight, extend) {
        const extendedStartX = Math.max(0, startX - extend);
        const extendedStartY = Math.max(0, startY - extend);
        const extendedEndX = Math.min(imageWidth, startX + blockWidth + extend);
        const extendedEndY = Math.min(data.length / (imageWidth * 4), startY + blockHeight + extend);
        
        return this.getBlockAverageColor(
            data, imageWidth, 
            extendedStartX, extendedStartY, 
            extendedEndX - extendedStartX, extendedEndY - extendedStartY
        );
    }

    /**
     * 用指定颜色填充图像块
     */
    fillBlockWithColor(data, imageWidth, startX, startY, blockWidth, blockHeight, color) {
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                data[index] = color.r;
                data[index + 1] = color.g;
                data[index + 2] = color.b;
                data[index + 3] = color.a;
            }
        }
    }

    /**
     * 用模糊效果填充图像块
     */
    fillBlockWithBlur(data, imageWidth, startX, startY, blockWidth, blockHeight, color) {
        // 简单的线性模糊（从边缘到中心）
        const centerX = startX + blockWidth / 2;
        const centerY = startY + blockHeight / 2;
        const maxDistance = Math.sqrt(blockWidth * blockWidth + blockHeight * blockHeight) / 2;
        
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                const blurFactor = distance / maxDistance;
                
                // 混合原始颜色和模糊颜色
                const originalR = data[index];
                const originalG = data[index + 1];
                const originalB = data[index + 2];
                const originalA = data[index + 3];
                
                data[index] = originalR * blurFactor + color.r * (1 - blurFactor);
                data[index + 1] = originalG * blurFactor + color.g * (1 - blurFactor);
                data[index + 2] = originalB * blurFactor + color.b * (1 - blurFactor);
                data[index + 3] = originalA;
            }
        }
    }

    /**
     * 用圆形图案填充图像块
     */
    fillBlockWithCirclePattern(data, imageWidth, startX, startY, blockWidth, blockHeight, color) {
        const centerX = startX + blockWidth / 2;
        const centerY = startY + blockHeight / 2;
        const radius = Math.min(blockWidth, blockHeight) / 2;
        
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                
                if (distance <= radius) {
                    data[index] = color.r;
                    data[index + 1] = color.g;
                    data[index + 2] = color.b;
                    data[index + 3] = color.a;
                } else {
                    // 边缘透明处理
                    data[index + 3] = Math.max(0, color.a * (1 - (distance - radius) / 2));
                }
            }
        }
    }

    /**
     * 用菱形图案填充图像块
     */
    fillBlockWithDiamondPattern(data, imageWidth, startX, startY, blockWidth, blockHeight, color) {
        const centerX = startX + blockWidth / 2;
        const centerY = startY + blockHeight / 2;
        
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                const dx = Math.abs(x - centerX);
                const dy = Math.abs(y - centerY);
                
                if (dx + dy <= Math.min(blockWidth, blockHeight) / 2) {
                    data[index] = color.r;
                    data[index + 1] = color.g;
                    data[index + 2] = color.b;
                    data[index + 3] = color.a;
                }
            }
        }
    }

    /**
     * 设置马赛克区域
     */
    setRegion(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * 预处理马赛克效果（性能优化）
     */
    preprocessMosaic(ctx) {
        if (this.width <= 0 || this.height <= 0) return;
        
        // 创建离屏canvas进行预处理
        if (!this.backgroundCanvas) {
            this.backgroundCanvas = document.createElement('canvas');
            this.backgroundCanvas.width = this.width;
            this.backgroundCanvas.height = this.height;
        }
        
        const offscreenCtx = this.backgroundCanvas.getContext('2d');
        const imageData = ctx.getImageData(this.x, this.y, this.width, this.height);
        
        this.applyPixelateMosaic(imageData);
        this.mosaicData = imageData;
    }

    drawRotationHandle(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y - 20;
        
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(centerX, this.y);
        ctx.lineTo(centerX, centerY);
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();
        
        ctx.restore();
    }

    containsPoint(x, y) {
        return x >= this.x && x <= this.x + this.width &&
               y >= this.y && y <= this.y + this.height;
    }

    static fromJSON(json) {
        const mosaic = new Mosaic(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            lineWidth: json.lineWidth,
            width: json.width,
            height: json.height,
            blockSize: json.blockSize,
            intensity: json.intensity,
            mosaicType: json.mosaicType,
            pattern: json.pattern,
            edgeSoftness: json.edgeSoftness,
            randomness: json.randomness
        });
        mosaic.id = json.id;
        mosaic.rotate = json.rotate || 0;
        mosaic.scale = json.scale || 1;
        mosaic.opacity = json.opacity || 1;
        return mosaic;
    }

    applyAlpha(color, alpha) {
        if (color.startsWith('rgba')) return color;
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
}