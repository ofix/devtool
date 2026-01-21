import Shape from "./Shape.js";

// 高斯模糊标注类
export default class GaussianBlur extends Shape {
    constructor(x, y, options = {}) {
        super(x, y);
        this.type = 'gaussian_blur';
        this.strokeStyle = options.strokeStyle || '#FF0000';
        this.fillStyle = options.fillStyle || 'transparent';
        this.lineWidth = options.lineWidth || 1;
        this.dashed = false;
        this.width = options.width || 100; // 模糊区域宽度
        this.height = options.height || 100; // 模糊区域高度
        this.blurRadius = options.blurRadius || 10; // 高斯模糊半径（关键参数）
        this.blurIntensity = options.blurIntensity || 1; // 模糊强度 (0-1)
        this.blurQuality = options.blurQuality || 'medium'; // 模糊质量：low, medium, high
        this.blurType = options.blurType || 'gaussian'; // 模糊类型：gaussian, box, motion
        this.motionAngle = options.motionAngle || 0; // 运动模糊角度
        this.isDrawing = false;
        this.backgroundCanvas = null; // 用于模糊处理的离屏canvas
        this.blurData = null; // 存储模糊处理后的数据
        this.backgroundColor = options.backgroundColor || 'transparent';
        
        // 高斯模糊特有的属性
        this.edgeFeathering = options.edgeFeathering || 0.2; // 边缘羽化程度
        this.iterations = options.iterations || 1; // 模糊迭代次数
    }

    draw(ctx) {
        const transformedCtx = this.applyTransform(ctx);
        
        // 如果模糊区域太小，不绘制
        if (this.width <= 0 || this.height <= 0) {
            this.restoreTransform(transformedCtx);
            return;
        }
        
        // 保存当前画布状态
        transformedCtx.save();
        
        // 绘制模糊效果
        if (this.blurData) {
            // 使用预处理好的模糊数据
            transformedCtx.putImageData(this.blurData, this.x, this.y);
        } else {
            // 实时生成模糊效果
            this.generateBlur(transformedCtx);
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
     * 生成模糊效果
     */
    generateBlur(ctx) {
        // 获取当前区域的图像数据
        const imageData = ctx.getImageData(this.x, this.y, this.width, this.height);
        
        // 根据模糊类型处理图像数据
        switch (this.blurType) {
            case 'gaussian':
                this.applyGaussianBlur(imageData);
                break;
            case 'box':
                this.applyBoxBlur(imageData);
                break;
            case 'motion':
                this.applyMotionBlur(imageData);
                break;
            default:
                this.applyGaussianBlur(imageData);
        }
        
        // 应用边缘羽化效果
        if (this.edgeFeathering > 0) {
            this.applyEdgeFeathering(imageData);
        }
        
        // 绘制处理后的图像数据
        ctx.putImageData(imageData, this.x, this.y);
    }

    /**
     * 应用高斯模糊（核心算法）
     */
    applyGaussianBlur(imageData) {
        const { width, height, data } = imageData;
        const radius = Math.max(1, this.blurRadius);
        
        // 根据质量设置确定卷积核大小
        let kernelSize;
        switch (this.blurQuality) {
            case 'low': kernelSize = radius * 2 + 1; break;
            case 'medium': kernelSize = radius * 3 + 1; break;
            case 'high': kernelSize = radius * 4 + 1; break;
            default: kernelSize = radius * 3 + 1;
        }
        
        // 确保卷积核大小为奇数
        kernelSize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize;
        
        // 生成高斯卷积核
        const kernel = this.generateGaussianKernel(kernelSize, radius);
        
        // 多次迭代应用模糊（增强效果）
        for (let iter = 0; iter < this.iterations; iter++) {
            // 水平模糊
            this.applyConvolution(data, width, height, kernel, true);
            // 垂直模糊
            this.applyConvolution(data, width, height, kernel, false);
        }
    }

    /**
     * 应用盒式模糊（快速模糊算法）
     */
    applyBoxBlur(imageData) {
        const { width, height, data } = imageData;
        const radius = Math.max(1, this.blurRadius);
        
        // 盒式模糊：简单平均模糊
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const avgColor = this.getNeighborhoodAverageColor(data, width, height, x, y, radius);
                this.setPixelColor(data, width, x, y, avgColor);
            }
        }
    }

    /**
     * 应用运动模糊
     */
    applyMotionBlur(imageData) {
        const { width, height, data } = imageData;
        const radius = Math.max(1, this.blurRadius);
        const angle = this.motionAngle * Math.PI / 180; // 转换为弧度
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // 沿着运动方向采样像素
                const motionColor = this.getMotionLineAverageColor(data, width, height, x, y, radius, angle);
                this.setPixelColor(data, width, x, y, motionColor);
            }
        }
    }

    /**
     * 生成高斯卷积核
     */
    generateGaussianKernel(size, sigma) {
        const kernel = [];
        const center = Math.floor(size / 2);
        let sum = 0;
        
        for (let i = 0; i < size; i++) {
            const x = i - center;
            const value = Math.exp(-(x * x) / (2 * sigma * sigma));
            kernel.push(value);
            sum += value;
        }
        
        // 归一化卷积核
        for (let i = 0; i < size; i++) {
            kernel[i] /= sum;
        }
        
        return kernel;
    }

    /**
     * 应用卷积运算
     */
    applyConvolution(data, width, height, kernel, horizontal) {
        const tempData = new Uint8ClampedArray(data);
        const kernelSize = kernel.length;
        const radius = Math.floor(kernelSize / 2);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                
                for (let k = 0; k < kernelSize; k++) {
                    const offset = k - radius;
                    let sampleX, sampleY;
                    
                    if (horizontal) {
                        sampleX = Math.max(0, Math.min(width - 1, x + offset));
                        sampleY = y;
                    } else {
                        sampleX = x;
                        sampleY = Math.max(0, Math.min(height - 1, y + offset));
                    }
                    
                    const index = (sampleY * width + sampleX) * 4;
                    const weight = kernel[k];
                    
                    r += tempData[index] * weight;
                    g += tempData[index + 1] * weight;
                    b += tempData[index + 2] * weight;
                    a += tempData[index + 3] * weight;
                }
                
                const index = (y * width + x) * 4;
                data[index] = Math.max(0, Math.min(255, r));
                data[index + 1] = Math.max(0, Math.min(255, g));
                data[index + 2] = Math.max(0, Math.min(255, b));
                data[index + 3] = Math.max(0, Math.min(255, a));
            }
        }
    }

    /**
     * 获取邻域平均颜色（用于盒式模糊）
     */
    getNeighborhoodAverageColor(data, width, height, x, y, radius) {
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const sampleX = Math.max(0, Math.min(width - 1, x + dx));
                const sampleY = Math.max(0, Math.min(height - 1, y + dy));
                
                const index = (sampleY * width + sampleX) * 4;
                r += data[index];
                g += data[index + 1];
                b += data[index + 2];
                a += data[index + 3];
                count++;
            }
        }
        
        return {
            r: Math.floor(r / count),
            g: Math.floor(g / count),
            b: Math.floor(b / count),
            a: Math.floor(a / count)
        };
    }

    /**
     * 获取运动线平均颜色（用于运动模糊）
     */
    getMotionLineAverageColor(data, width, height, x, y, radius, angle) {
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;
        
        for (let d = -radius; d <= radius; d++) {
            const dx = Math.round(d * Math.cos(angle));
            const dy = Math.round(d * Math.sin(angle));
            const sampleX = Math.max(0, Math.min(width - 1, x + dx));
            const sampleY = Math.max(0, Math.min(height - 1, y + dy));
            
            const index = (sampleY * width + sampleX) * 4;
            r += data[index];
            g += data[index + 1];
            b += data[index + 2];
            a += data[index + 3];
            count++;
        }
        
        return {
            r: Math.floor(r / count),
            g: Math.floor(g / count),
            b: Math.floor(b / count),
            a: Math.floor(a / count)
        };
    }

    /**
     * 设置像素颜色
     */
    setPixelColor(data, width, x, y, color) {
        const index = (y * width + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = color.a;
    }

    /**
     * 应用边缘羽化效果
     */
    applyEdgeFeathering(imageData) {
        const { width, height, data } = imageData;
        const featherDistance = Math.min(width, height) * this.edgeFeathering;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // 计算到边缘的距离
                const distLeft = x;
                const distRight = width - 1 - x;
                const distTop = y;
                const distBottom = height - 1 - y;
                const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                
                if (minDist < featherDistance) {
                    const featherFactor = minDist / featherDistance;
                    const index = (y * width + x) * 4;
                    data[index + 3] = Math.floor(data[index + 3] * featherFactor);
                }
            }
        }
    }

    /**
     * 设置模糊区域
     */
    setRegion(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * 预处理模糊效果（性能优化）
     */
    preprocessBlur(ctx) {
        if (this.width <= 0 || this.height <= 0) return;
        
        // 创建离屏canvas进行预处理
        if (!this.backgroundCanvas) {
            this.backgroundCanvas = document.createElement('canvas');
            this.backgroundCanvas.width = this.width;
            this.backgroundCanvas.height = this.height;
        }
        
        const imageData = ctx.getImageData(this.x, this.y, this.width, this.height);
        this.applyGaussianBlur(imageData);
        this.blurData = imageData;
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
        const blur = new GaussianBlur(json.x, json.y, {
            strokeStyle: json.strokeStyle,
            fillStyle: json.fillStyle,
            lineWidth: json.lineWidth,
            width: json.width,
            height: json.height,
            blurRadius: json.blurRadius,
            blurIntensity: json.blurIntensity,
            blurQuality: json.blurQuality,
            blurType: json.blurType,
            motionAngle: json.motionAngle,
            edgeFeathering: json.edgeFeathering,
            iterations: json.iterations
        });
        blur.id = json.id;
        blur.rotate = json.rotate || 0;
        blur.scale = json.scale || 1;
        blur.opacity = json.opacity || 1;
        return blur;
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