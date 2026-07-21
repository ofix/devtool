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
        this.collpasedHeight = 0;  // 折叠后的高度
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