import Component from "./Component.js"
import Matrix from "./Matrix.js"

class StructUnion extends Component {
    constructor(options = {}) {
        // 父类自动初始化 children、parent、transform相关字段
        super(options);
        // 当前激活子元素下标（对应children数组）
        this.activeChildIndex = options.activeChildIndex ?? 0;
        // 嵌套层级激活状态缓存 Map<层级路径字符串, 激活下标>
        this.nestedActiveCache = new Map();
        // 每一层级缩进像素，统一配置
        this.indentSize = options.indentSize ?? 24;
    }

    // 切换激活子项，自动打脏
    setActiveIndex(index) {
        if (index < 0 || index >= this.children.length) return;
        this.activeChildIndex = index;
        this._markDirty();
    }

    getActiveChild() {
        return this.children[this.activeChildIndex] ?? null;
    }

    // 获取下拉框选项列表（供UI下拉组件使用）
    getDropdownOptions() {
        return this.children.map((child, idx) => ({
            label: child.name || `field_${idx}`,
            value: idx
        }));
    }

    /**
     * 读取嵌套路径对应的激活下标
     * @param {string} path 层级路径 "0.1.2"
     */
    getNestedActive(path) {
        return this.nestedActiveCache.get(path) ?? 0;
    }

    setNestedActive(path, idx) {
        this.nestedActiveCache.set(path, idx);
        this._markDirty();
    }

    /**
     * 重写渲染逻辑
     * 1. 仅渲染activeChild，其余children跳过
     * 2. 递归子StructUnion时叠加缩进平移，实现层级缩进
     * @param {CanvasRenderingContext2D} ctx
     * @param {Matrix} parentWorldMat 父全局变换矩阵
     * @param {number} depth 当前嵌套深度，用于计算缩进
     */
    draw(ctx, depth = 0) {
        if (!this.visible) return;
        ctx.save();
        // 应用自身全局变换

        const activeChild = this.getActiveChild();
        if (!activeChild) {
            ctx.restore();
            return;
        }

        // 层级缩进：深度 * 缩进像素，仅X轴向右偏移
        const indentOffset = depth * this.indentSize;
        ctx.translate(indentOffset, 0);

        // 判断子元素是否也是联合体，递归携带深度+1
        if (activeChild instanceof StructUnion) {
            // 拼接当前层级唯一路径，用于读取嵌套激活状态
            const path = String(this.activeChildIndex);
            const subActiveIdx = this.getNestedActive(path);
            activeChild.setActiveIndex(subActiveIdx);
            // 递归绘制，深度+1，叠加缩进
            activeChild.draw(ctx, depth + 1);
        } else {
            // 普通Component/Struct，直接绘制
            activeChild.draw(ctx);
        }
        ctx.restore();
    }

    /**
     * 重写hitTest：仅对激活子元素做命中检测，未激活直接返回null
     * @param {number} worldX 已抵消上层所有父变换的坐标
     * @param {number} worldY 已抵消上层所有父变换的坐标
     * @param {number} depth 嵌套深度，用于缩进坐标修正
     * @returns Component|null
     */
    hitTest(worldX, worldY, depth = 0) {
        if (!this.visible || this.frozen) return null;
        const localMat = this.getLocalTransform();
        const selfInv = localMat.inverse();
        if (!selfInv) return null;
        let localPoint = selfInv.apply(worldX, worldY);

        // 修正缩进带来的X偏移
        const indentOffset = depth * this.indentSize;
        localPoint.x -= indentOffset;

        const activeChild = this.getActiveChild();
        if (!activeChild) return null;

        // 递归检测嵌套Union，深度+1
        if (activeChild instanceof StructUnion) {
            const path = String(this.activeChildIndex);
            const subIdx = this.getNestedActive(path);
            activeChild.setActiveIndex(subIdx);
            return activeChild.hitTest(localPoint.x, localPoint.y, depth + 1);
        }

        // 普通组件直接检测
        return activeChild.hitTest(localPoint.x, localPoint.y);
    }

    // 序列化扩展
    toJSON() {
        const json = super.toJSON();
        json.activeChildIndex = this.activeChildIndex;
        json.indentSize = this.indentSize;
        json.nestedActiveCache = Array.from(this.nestedActiveCache.entries());
        return json;
    }

    fromJSON(data) {
        super.fromJSON(data);
        this.activeChildIndex = data.activeChildIndex ?? 0;
        this.indentSize = data.indentSize ?? 24;
        this.nestedActiveCache = new Map(data.nestedActiveCache ?? []);
        this._markDirty();
        return this;
    }
}

export default StructUnion;