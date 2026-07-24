import FieldCtrl from "./FieldCtrl.js";
import FieldType from "./FieldType.js";

class UnionFieldCtrl extends FieldCtrl {
    constructor({ key, label, value = '', height = 30 }) {
        super({ key, label, type: FieldType.UNION, value, height });
        this.options = options;  // 存储选项配置
        // 布局相关，Union 字段特有
        this.isCollapsible = true; // 是否可折叠组件
        this.isCollapsed = false; // 是否已收起
        this.isCollapsing = false; // 是否收起中，（动画效果）
        this.headerHeight = 20; // 全部展开情况下，标题栏高度
        // 缓存：展开状态完整高度 header + 子总和
        this.expandedHeight = 0;
        this.headerBox = { x: 0, y: 0, width: 0, height: 0 }; // 标题栏包围盒，用于HitTest和分割线绘制，相对父容器坐标
        this.collapedBox = { x: 0, y: 0, width: 0, height: 0 }; // 组件折叠后的包围盒，比原有的标题栏包围盒可能会大一点，用于HitTest和分割线绘制，相对父容器坐标
        this.collapsedHeight = 0;  // 折叠后的高度
    }

    // 对外统一同步写入父类height，不破坏外部代码读取 field.height
    refreshHeight() {
        if (this.isExpanded) {
            this.height = this.expandedHeight;
        } else {
            this.height = this.headerHeight;
        }
    }

    // Union切换激活分支
    switchActiveChild(union, newChild) {
        union.activeChild = newChild;
        // 关键：新分支如果是容器，先递归测量整棵分支
        if (newChild) {
            measureAll(newChild);
        }
        union.measure();
        // 继续向上冒泡更新祖先
        let p = union.parent;
        while (p) {
            p.measure();
            p = p.parent;
        }
        requestLayoutArrange();
    }

    measureHeight() {
        if (this.isEditMode) {
            // 编辑态：累加所有children高度
            let sum = this.children.reduce((s, c) => s + c.height, 0);
            this.expandedHeight = this.headerHeight + sum + gap;
        } else {
            // 运行态：只取activeChild
            const childH = this.activeChild ? this.activeChild.height : 0;
            this.expandedHeight = this.headerHeight + childH;
        }

        this.refreshHeight();
    }

    expand() { // 展开
        this.isCollapsed = true;
        this.refreshHeight(); // 更新自身 height
        // 向上冒泡刷新所有祖先
        let p = this.parent;
        while (p) {
            p.measureHeight();
            p = p.parent;
        }
        requestLayoutArrange();
    }

    /**
     * 添加一个选项
     */
    addOption(name, condition, fields) {
        this.options.push({
            name,
            condition: condition || null,
            fields: fields || []
        });
        return this;
    }

    get headerHeight() {
        if (this.isCollapsed) {
            return this.collapsedHeight;
        }
        return this.headerHeight;
    }

    // 计算Body的高度
    calcBodyHeight(node) {
        let height = 0;
        for (let i = 0; i < node.length; i++) {
            let child = node.children[i];
            if (child.isVisible()) {
                if (child.height === 0) {
                    height += this.calcBodyHeight(child);
                }
                height += child.height;
            }
        }
        return height;
    }

    getBodyHeight() {
        if (this.isCollapsed) {
            return 0;
        }
        return this.bodyHeight;
    }



    /**
     * 获取当前激活的选项
     */
    getActiveOption(state) {
        for (const option of this.options) {
            if (option.condition && typeof option.condition === 'function') {
                try {
                    if (option.condition(state)) {
                        return option;
                    }
                } catch (e) {
                    console.warn(`选项 "${option.name}" 条件判断失败:`, e);
                }
            }
        }
        return this.options[0] || null;
    }

    /**
     * 获取全部展开后的字段列表
     * @param {Object} state - 当前状态（仅 active 模式需要）
     * @param {string} mode - 'all' | 'active'
     * @returns {Array} 字段列表，每个字段带有深度信息
     */
    getFlattenFields(state = null, mode = 'all') {
        const result = [];

        if (mode === 'all') {
            // 全部展开：遍历所有选项
            for (const option of this.options) {
                // 添加选项标题（标记为标题，用于渲染）
                result.push({
                    isTitle: true,
                    name: option.name,
                    fields: option.fields
                });

                // 递归展开选项下的所有字段
                for (const field of option.fields) {
                    this._flattenField(field, result, 1);
                }
            }
        } else {
            // 仅激活选项
            const active = this.getActiveOption(state);
            if (active) {
                for (const field of active.fields) {
                    this._flattenField(field, result, 0);
                }
            }
        }

        return result;
    }

    /**
     * 递归扁平化字段
     * @private
     */
    _flattenField(field, result, depth) {
        if (field.isUnion()) {
            // 如果子字段还是 Union，递归展开
            const subFields = field.getFlattenFields(null, 'all');
            for (const item of subFields) {
                if (item.isTitle) {
                    result.push({
                        isTitle: true,
                        name: item.name,
                        depth: depth,
                        fields: item.fields
                    });
                } else {
                    result.push({
                        ...item,
                        depth: (item.depth || 0) + depth
                    });
                }
            }
        } else if (field.isObject()) {
            // Object 类型：先添加自身，再展开子字段
            result.push({
                field: field,
                depth: depth,
                isObjectTitle: true
            });
            for (const child of field.children) {
                this._flattenField(child, result, depth + 1);
            }
        } else {
            // 叶子字段：直接添加
            result.push({
                field: field,
                depth: depth,
                isLeaf: true
            });
        }
    }

    /**
     * 获取所有选项名称
     */
    getOptionNames() {
        return this.options.map(opt => opt.name);
    }

    doDraw(ctx, level) {
        // 绘制标题栏（一个下拉选择框+union的字段名称）
        // 模式单选
        if (this.mode == 'full') { // 递归绘制单元格
            for (let i = 0; i < this.children.length; i++) {
                let child = this.children[i];
                if (child.isVisible()) { // 只绘制单个子元素
                    child.doDraw(ctx, level++);
                }
            }
        } else {
            this.activeChild.doDraw(ctx, level);
        }
    }

}

export default UnionFieldCtrl;