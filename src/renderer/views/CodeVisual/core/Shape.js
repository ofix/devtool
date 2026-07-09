import EventTarget from "./EventTarget.js"
import Matrix from "./Matrix.js"
class Shape extends EventTarget {
    constructor(options = {}) {
        super();
        this.id = options.id || `shape_${Date.now()}_${Math.random()}`;
        this.name = options.name || '';

        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 0;
        this.height = options.height || 0;
        this.rotation = options.rotation || 0; // 弧度
        this.scaleX = options.scaleX || 1;
        this.scaleY = options.scaleY || 1;
        this.originX = options.originX || 0; // 变换原点
        this.originY = options.originY || 0;

        // 缓存矩阵（懒计算）
        this._localTransform = null;
        this._globalTransform = null;
        this._transformDirty = true;

        // 样式
        this.visible = options.visible !== undefined ? options.visible : true;
        // 冻结的不可修改类别（但可以移动）
        this.frozen = options.frozen !== undefined ? options.frozen : false;
        // 被冻结时的视觉样式（可选）
        this.frozenOpacity = options.frozenOpacity || 0.6;
        this.frozenCursor = options.frozenCursor || 'default';

        this.opacity = options.opacity || 1;
        this.fill = options.fill || 'transparent';
        this.stroke = options.stroke || '#000000';
        this.strokeWidth = options.strokeWidth || 2;
        this.cursor = options.cursor || 'default';

        // 父子关系
        this._parent = null;
        this._isHover = false;
        this._attrs = options.attrs || {};
    }

    // 属性访问器（自动标记脏）

    setX(x) {
        if (this.x !== x) {
            this.x = x;
            this._markDirty();
        }
        return this;
    }

    setY(y) {
        if (this.y !== y) {
            this.y = y;
            this._markDirty();
        }
        return this;
    }

    setRotation(rotation) {
        if (this.rotation !== rotation) {
            this.rotation = rotation;
            this._markDirty();
        }
        return this;
    }

    setScale(scaleX, scaleY) {
        if (this.scaleX !== scaleX || this.scaleY !== scaleY) {
            this.scaleX = scaleX;
            this.scaleY = scaleY;
            this._markDirty();
        }
        return this;
    }

    // 变换矩阵（懒计算）  
    _markDirty() {
        this._transformDirty = true;
        this._localTransform = null;
        this._globalTransform = null;
        // 通知父级
        if (this._parent) {
            this._parent._markDirty();
        }
    }

    // 是否应该响应事件
    canInteract() {
        return this.visible && !this.frozen;
    }

    // 冻结（不可交互）
    freeze() {
        if (!this.frozen) {
            this.frozen = true;
        }
        return this;
    }

    // 解冻（恢复交互）
    unfreeze() {
        if (this.frozen) {
            this.frozen = false;
        }
        return this;
    }

    // 切换冻结状态
    toggleFrozen() {
        return this.frozen ? this.unfreeze() : this.freeze();
    }

    // 获取本地变换矩阵
    getLocalTransform() {
        if (this._transformDirty || !this._localTransform) {
            this._localTransform = this._buildLocalTransform();
        }
        return this._localTransform;
    }

    _buildLocalTransform() {
        // 从属性构建矩阵
        let matrix = new Matrix();

        // 平移到位置
        matrix = matrix.translate(this.x, this.y);

        // 如果有变换原点，先平移到原点
        if (this.originX !== 0 || this.originY !== 0) {
            matrix = matrix.translate(this.originX, this.originY);
        }

        // 旋转
        if (this.rotation !== 0) {
            matrix = matrix.rotate(this.rotation);
        }

        // 缩放
        if (this.scaleX !== 1 || this.scaleY !== 1) {
            matrix = matrix.scale(this.scaleX, this.scaleY);
        }

        // 移回
        if (this.originX !== 0 || this.originY !== 0) {
            matrix = matrix.translate(-this.originX, -this.originY);
        }

        return matrix;
    }

    // 获取全局变换矩阵
    getGlobalTransform() {
        if (this._transformDirty || !this._globalTransform) {
            let matrix = this.getLocalTransform();
            let parent = this._parent;

            while (parent) {
                if (parent instanceof Shape) {
                    matrix = parent.getLocalTransform().multiply(matrix);
                }
                parent = parent.parent;
            }

            this._globalTransform = matrix;
            this._transformDirty = false;
        }
        return this._globalTransform;
    }

    // 获取逆矩阵
    getGlobalInverseTransform() {
        try {
            return this.getGlobalTransform().inverse();
        } catch (error) {
            return null;
        }
    }

    // 坐标转换
    worldToLocal(worldX, worldY) {
        const inverse = this.getGlobalInverseTransform();
        if (!inverse) return { x: worldX, y: worldY };
        return inverse.apply(worldX, worldY);
    }

    localToWorld(localX, localY) {
        const transform = this.getGlobalTransform();
        return transform.apply(localX, localY);
    }

    /**
     * 碰撞检测（只检测是否碰撞）
     * @param {number} worldX - 世界坐标X
     * @param {number} worldY - 世界坐标Y
     * @returns {boolean} 是否碰撞
     */
    hitTest(worldX, worldY) {
        if (!this.visible) return false;
        return this.containsPoint(worldX, worldY);
    }

    // 碰撞检测
    containsPoint(worldX, worldY) {
        if (!this.visible || !this.frozen) return false;

        // 快速检测：检查包围盒
        const bbox = this.getWorldBoundingBox();
        if (worldX < bbox.x || worldX > bbox.x + bbox.width ||
            worldY < bbox.y || worldY > bbox.y + bbox.height) {
            return false;
        }

        // 如果没有旋转和缩放，使用快速矩形检测
        if (this.rotation === 0 && this.scaleX === 1 && this.scaleY === 1) {
            return this._containsRect(worldX, worldY);
        }

        // 有变换，使用矩阵转换
        try {
            const local = this.worldToLocal(worldX, worldY);
            return this._containsLocalPoint(local.x, local.y);
        } catch (error) {
            return false;
        }
    }

    // 快速矩形检测（无变换）
    _containsRect(worldX, worldY) {
        // 如果形状有父级，需要考虑父级的变换
        if (this._parent) {
            // 转换到父级坐标系
            const parentLocal = this._parent.worldToLocal(worldX, worldY);
            const local = this.worldToLocal(parentLocal.x, parentLocal.y);
            return this._containsLocalPoint(local.x, local.y);
        }

        return worldX >= this.x && worldX <= this.x + this.width &&
            worldY >= this.y && worldY <= this.y + this.height;
    }

    // 本地坐标检测（子类重写）
    _containsLocalPoint(x, y) {
        return x >= 0 && x <= this.width &&
            y >= 0 && y <= this.height;
    }

    // 包围盒
    getWorldBoundingBox() {
        // 考虑所有变换
        const corners = [
            { x: 0, y: 0 },
            { x: this.width, y: 0 },
            { x: this.width, y: this.height },
            { x: 0, y: this.height }
        ];

        const worldCorners = corners.map(c => this.localToWorld(c.x, c.y));

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const corner of worldCorners) {
            minX = Math.min(minX, corner.x);
            minY = Math.min(minY, corner.y);
            maxX = Math.max(maxX, corner.x);
            maxY = Math.max(maxY, corner.y);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    getLocalBoundingBox() {
        return {
            x: 0,
            y: 0,
            width: this.width,
            height: this.height
        };
    }

    translate(dx, dy) {
        this.x += dx;
        this.y += dy;
        this._markDirty();
        return this;
    }

    rotate(angle) {
        this.rotation += angle;
        this._markDirty();
        return this;
    }

    scale(sx, sy) {
        this.scaleX *= sx;
        this.scaleY *= sy || sx;
        this._markDirty();
        return this;
    }

    // 设置位置（保持其他变换不变）
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this._markDirty();
        return this;
    }

    // 设置变换原点
    setOrigin(originX, originY) {
        this.originX = originX;
        this.originY = originY;
        this._markDirty();
        return this;
    }

    // 绘制
    draw(ctx) {
        if (!this.visible) return;

        ctx.save();

        // 应用变换
        const matrix = this.getLocalTransform();
        ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);

        // 设置透明度
        ctx.globalAlpha = this.opacity;

        // 绘制形状
        this.render(ctx);

        ctx.restore();
    }

    render(ctx) {
        // 子类重写
        this._drawDefault(ctx);
    }

    _drawDefault(ctx) {
        // 默认绘制矩形
        if (this.fill && this.fill !== 'transparent') {
            ctx.fillStyle = this.fill;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        if (this.stroke && this.stroke !== 'transparent' && this.strokeWidth > 0) {
            ctx.strokeStyle = this.stroke;
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeRect(0, 0, this.width, this.height);
        }
    }

    // 序列化
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            originX: this.originX,
            originY: this.originY,
            visible: this.visible,
            frozen: this.frozen,
            opacity: this.opacity,
            fill: this.fill,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            cursor: this.cursor,
            attrs: this._attrs
        };
    }

    fromJSON(data) {
        this.id = data.id || this.id;
        this.name = data.name || this.name;
        this.x = data.x || 0;
        this.y = data.y || 0;
        this.width = data.width || 0;
        this.height = data.height || 0;
        this.rotation = data.rotation || 0;
        this.scaleX = data.scaleX || 1;
        this.scaleY = data.scaleY || 1;
        this.originX = data.originX || 0;
        this.originY = data.originY || 0;
        this.visible = data.visible !== undefined ? data.visible : true;
        this.frozen = data.frozen !== undefined ? data.frozen : true;
        this.opacity = data.opacity || 1;
        this.fill = data.fill || 'transparent';
        this.stroke = data.stroke || 'transparent';
        this.strokeWidth = data.strokeWidth || 0;
        this.cursor = data.cursor || 'default';
        this._attrs = data.attrs || {};
        this._markDirty();
        return this;
    }

    clone() {
        const json = this.toJSON();
        const clone = new this.constructor();
        clone.fromJSON(json);
        return clone;
    }
}

export default Shape;

