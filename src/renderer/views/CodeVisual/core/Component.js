import EventTarget from "./EventTarget.js"
import Matrix from "./Matrix.js"

class Component extends EventTarget {
    constructor(options = {}) {
        super(options.parent || null, options.children || []);
        this.id = options.id || `shape_${Date.now()}_${Math.random()}`;
        this.name = options.name || '';
        this.zIndex = options.zIndex || 0;

        // 原始变换数值 - 唯一数据源
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.scaleX = options.scaleX ?? 1;
        this.scaleY = options.scaleY ?? 1;
        this.skewX = options.skewX ?? 0;
        this.skewY = options.skewY ?? 0;
        this.rotateAngle = options.rotateAngle ?? 0;

        // 本地变换缓存矩阵
        this.localTransform = null;
        this.transformDirty = true;

        // 几何尺寸（仅本地图形尺寸，不含位移）
        this.width = options.width || 0;
        this.height = options.height || 0;
        this.minWidth = options.minWidth || 48;
        this.minHeight = options.minHeight || 20;

        // 样式
        this.visible = options.visible ?? true;
        this.frozen = options.frozen ?? false;
        this.frozenOpacity = options.frozenOpacity || 0.6;
        this.frozenCursor = options.frozenCursor || 'default';
        this.opacity = options.opacity ?? 1;
        this.fill = options.fill || 'transparent';
        this.stroke = options.stroke || '#000000';
        this.strokeWidth = options.strokeWidth || 2;
        this.cursor = options.cursor || 'default';

        this._isHover = false;
        // 删除全局bbox缓存，父矩阵多变无法复用
    }

    getRect() { return { x: 0, y: 0, w: this.width, h: this.height } }
    getMinSize() { return { minWidth: this.minWidth, minHeight: this.minHeight } }
    setMinWidth(v) { this.minWidth = v; return this; }
    setMinHeight(v) { this.minHeight = v; return this; }
    getMinWidth() { return this.minWidth; }
    getMinHeight() { return this.minHeight; }
    setZIndex(z) { this.zIndex = z; return this; }
    getZIndex() { return this.zIndex; }

    // 位移操作
    setX(val) { this.x = val; this._markDirty(); return this; }
    setY(val) { this.y = val; this._markDirty(); return this; }
    setPosition(x, y) { this.x = x; this.y = y; this._markDirty(); return this; }
    translate(dx, dy) { this.x += dx; this.y += dy; this._markDirty(); return this; }

    // 缩放
    setScale(sx, sy = sx) { this.scaleX = sx; this.scaleY = sy; this._markDirty(); return this; }
    scale(sx, sy = sx) { this.scaleX *= sx; this.scaleY *= sy; this._markDirty(); return this; }

    // 旋转、斜切
    setRotateAngle(deg) { this.rotateAngle = deg; this._markDirty(); return this; }
    rotate(deg) { this.rotateAngle += deg; this._markDirty(); return this; }
    setSkewX(deg) { this.skewX = deg; this._markDirty(); return this; }
    setSkewY(deg) { this.skewY = deg; this._markDirty(); return this; }

    // 脏标记：仅清空本地矩阵缓存
    _markDirty() {
        this.transformDirty = true;
        this.localTransform = null;
    }

    // 生成本地变换缓存矩阵（包含x/y平移、缩放、旋转、斜切）
    getLocalTransform() {
        if (!this._transformDirty && this.localTransform) {
            return this.localTransform.clone();
        }
        const cx = this.width / 2;
        const cy = this.height / 2;
    
        // 变换组装顺序：
        // 1. 全局位移 x,y
        // 2. 还原原点：translate(-cx, -cy)
        // 3. 缩放、斜切、旋转（中心变形）
        // 4. 偏移到中心：translate(cx, cy)
        let mat = new Matrix().translate(this.x, this.y);
        mat = mat.translate(cx, cy);
    
        if (this.rotateAngle) mat = mat.rotate(this.rotateAngle);
        if (this.skewX) mat = mat.skewX(this.skewX);
        if (this.skewY) mat = mat.skewY(this.skewY);
    
        mat = mat.scale(this.scaleX, this.scaleY);
        mat = mat.translate(-cx, -cy);
    
        this.localTransform = mat;
        this.transformDirty = false;
        return mat.clone();
    }

    // 本地原始无变换矩形
    getLocalBoundingBox() {
        return { x: 0, y: 0, width: this.width, height: this.height };
    }

    /**
     * 计算当前组件在父合并矩阵下的世界轴对齐包围盒
     * 本地顶点固定 [0,0] [w,0] [w,h] [0,h]，位移x/y已包含在localTransform内
     * 旋转/斜切后自动扩大包围盒，完全包裹图形
     * @param {Matrix} parentWorldMat 父层级所有变换合并正向矩阵
     */
    getBoundingBox(parentWorldMat) {
        const localMat = this.getLocalTransform();
        const totalWorldMat = parentWorldMat.multiply(localMat);
        // 本地图形四角，不含x/y（x/y在变换矩阵里）
        const localCorners = [
            { x: 0, y: 0 },
            { x: this.width, y: 0 },
            { x: this.width, y: this.height },
            { x: 0, y: this.height },
        ];
        // 全部转换为世界坐标
        const worldCorners = localCorners.map(p => totalWorldMat.apply(p.x, p.y));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of worldCorners) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    // 判断点是否在本地原始矩形内
    pointInRect(x, y) {
        return x >= 0 && x <= this.width && y >= 0 && y <= this.height;
    }

    /**
     * 命中检测核心
     * @param {number} worldX 已抵消所有父容器变换的坐标
     * @param {number} worldY 已抵消所有父容器变换的坐标
     * @returns Component|null 命中组件
     */
    hitTest(worldX, worldY) {
        if (!this.visible || this.frozen) return null;

        const localMat = this.getLocalTransform();
        const selfInv = localMat.inverse();
        if (!selfInv) return null;

        // 当前光标已剥离全部父变换，仅抵消自身局部变换得到本地坐标
        const local = selfInv.apply(worldX, worldY);

        // 倒序遍历子元素，传入【当前组件抵消完的光标】给子（子只需抵消自身）
        for (let i = this.children.length - 1; i >= 0; i--) {
            const hit = this.children[i].hitTest(local.x, local.y);
            if (hit) return hit;
        }

        // 子无命中，检测自身矩形
        return this.pointInRect(local.x, local.y) ? this : null;
    }

    canInteract() { return this.visible && !this.frozen; }
    freeze() { this.frozen = true; return this; }
    unfreeze() { this.frozen = false; return this; }
    toggleFrozen() { return this.frozen ? this.unfreeze() : this.freeze(); }
    changeCursor(cursor) { this.fire('cursor:change', cursor); }

    // 渲染，自上而下传递父合并矩阵
    draw(ctx, parentWorldMat = new Matrix()) {
        if (!this.visible) return;
        ctx.save();
        const localMat = this.getLocalTransform();
        const renderMat = parentWorldMat.multiply(localMat);
        ctx.transform(renderMat.a, renderMat.b, renderMat.c, renderMat.d, renderMat.e, renderMat.f);
        ctx.globalAlpha = this.opacity;
        this.doDraw(ctx);
        ctx.restore();
        // 递归绘制子组件
        for (const child of this.children) {
            child.draw(ctx, renderMat);
        }
    }

    doDraw(ctx) {
        this._drawDefault(ctx);
    }
    _drawDefault(ctx) {
        if (this.fill !== 'transparent') {
            ctx.fillStyle = this.fill;
            ctx.fillRect(0, 0, this.width, this.height);
        }
        if (this.stroke !== 'transparent' && this.strokeWidth > 0) {
            ctx.strokeStyle = this.stroke;
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeRect(0, 0, this.width, this.height);
        }
    }

    // 序列化导出原始变换字段
    toJSON() {
        return {
            id: this.id, name: this.name,
            x: this.x, y: this.y,
            scaleX: this.scaleX, scaleY: this.scaleY,
            skewX: this.skewX, skewY: this.skewY,
            rotateAngle: this.rotateAngle,
            width: this.width, height: this.height,
            zIndex: this.zIndex, visible: this.visible, frozen: this.frozen,
            opacity: this.opacity, fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth, cursor: this.cursor,
        };
    }

    fromJSON(data) {
        this.id = data.id ?? this.id;
        this.name = data.name ?? this.name;
        this.x = data.x ?? 0; this.y = data.y ?? 0;
        this.scaleX = data.scaleX ?? 1; this.scaleY = data.scaleY ?? 1;
        this.skewX = data.skewX ?? 0; this.skewY = data.skewY ?? 0;
        this.rotateAngle = data.rotateAngle ?? 0;
        this.width = data.width ?? 0; this.height = data.height ?? 0;
        this.zIndex = data.zIndex ?? 0;
        this.visible = data.visible ?? true;
        this.frozen = data.frozen ?? false;
        this.opacity = data.opacity ?? 1;
        this.fill = data.fill || 'transparent';
        this.stroke = data.stroke || '#000';
        this.strokeWidth = data.strokeWidth || 2;
        this.cursor = data.cursor || 'default';
        this._markDirty();
        return this;
    }

    clone() {
        const json = this.toJSON();
        const inst = new this.constructor();
        inst.fromJSON(json);
        return inst;
    }
}

export default Component;