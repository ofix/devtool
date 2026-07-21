import FieldType from "./FieldType.js";
/**
 * 字段高度计算 Mixin
 * 为任意字段提供高度计算能力
 */
const FieldHeightMixin = (Base) => class extends Base {
    constructor(...args) {
      super(...args);
      this._heightConfig = {
        lineHeight: 30,
        padding: 8,
        indentSize: 20,
        optionTitleHeight: 35,
        useCache: true
      };
      this._heightCache = new Map();
    }
  
    /**
     * 配置高度参数
     */
    configHeight(options) {
      this._heightConfig = { ...this._heightConfig, ...options };
      this._clearCache();
      return this;
    }
  
    /**
     * 计算当前字段的总高度
     * @param {string} mode - 'all' | 'active'
     * @param {Object} state - 当前状态（用于 Union 类型）
     * @param {number} depth - 嵌套深度
     */
    calcHeight(mode = 'all', state = null, depth = 0) {
      const config = this._heightConfig;
      
      // 缓存检查
      if (config.useCache) {
        const key = this._cacheKey(mode, state, depth);
        if (this._heightCache.has(key)) {
          return this._heightCache.get(key);
        }
      }
  
      let height = 0;
  
      // 1. 叶子字段（基本类型）
      if (this.isLeaf()) {
        height = (this.height || config.lineHeight) + config.padding;
        this._saveCache(mode, state, depth, height);
        return height;
      }
  
      // 2. Union 字段
      if (this.type === 'union') {
        height = this._calcUnionHeight(mode, state, depth);
        this._saveCache(mode, state, depth, height);
        return height;
      }
  
      // 3. Union Option 作为标题
      if (this.type === 'union_option') {
        height = config.optionTitleHeight + config.padding;
        this._saveCache(mode, state, depth, height);
        return height;
      }
  
      // 4. 数组字段
      if (this.type === 'array') {
        height = this._calcArrayHeight(mode, state, depth);
        this._saveCache(mode, state, depth, height);
        return height;
      }
  
      // 5. 对象字段（有子字段）
      if (this.children && this.children.length > 0) {
        height = (this.height || config.lineHeight) + config.padding;
        for (const child of this.children) {
          height += child.calcHeight(mode, state, depth + 1);
        }
        this._saveCache(mode, state, depth, height);
        return height;
      }
  
      // 6. 默认
      height = (this.height || config.lineHeight) + config.padding;
      this._saveCache(mode, state, depth, height);
      return height;
    }
  
    /**
     * 计算 Union 类型的高度
     * @private
     */
    _calcUnionHeight(mode, state, depth) {
      const config = this._heightConfig;
      let height = 0;
  
      if (mode === 'all') {
        for (const option of this.options) {
          // 选项标题
          height += option.calcHeight(mode, state, depth);
          // 选项内的字段
          for (const child of option.children) {
            height += child.calcHeight(mode, state, depth + 1);
          }
          height += config.padding;
        }
      } else {
        const active = this.getActiveOption(state);
        if (active) {
          for (const child of active.children) {
            height += child.calcHeight(mode, state, depth + 1);
          }
        } else {
          height += config.lineHeight + config.padding;
        }
      }
  
      return height;
    }
  
    /**
     * 计算数组类型的高度
     * @private
     */
    _calcArrayHeight(mode, state, depth) {
      const config = this._heightConfig;
      let height = (this.height || config.lineHeight) + config.padding;
  
      // 数组标题行显示长度信息
      for (const element of this.elements) {
        height += element.calcHeight(mode, state, depth + 1);
      }
  
      return height;
    }
  
    /**
     * 计算总行数
     */
    calcRows(mode = 'all', state = null) {
      const height = this.calcHeight(mode, state);
      return Math.ceil(height / this._heightConfig.lineHeight);
    }
  
    /**
     * 获取高度分解详情（调试用）
     */
    calcDetail(mode = 'all', state = null, depth = 0) {
      const config = this._heightConfig;
      const detail = {
        key: this.key,
        label: this.label,
        type: this.type,
        depth: depth,
        height: 0,
        children: []
      };
  
      // 叶子字段
      if (this.isLeaf()) {
        detail.height = (this.height || config.lineHeight) + config.padding;
        detail.value = this.getDisplayValue();
        return detail;
      }
  
      // Union 字段
      if (this.type === 'union') {
        let total = 0;
  
        if (mode === 'all') {
          for (const option of this.options) {
            const optDetail = {
              key: option.key,
              label: option.label,
              type: 'union_option',
              isTitle: true,
              height: config.optionTitleHeight + config.padding,
              children: []
            };
  
            let optHeight = optDetail.height;
            for (const child of option.children) {
              const childDetail = child.calcDetail(mode, state, depth + 1);
              optDetail.children.push(childDetail);
              optHeight += childDetail.height;
            }
  
            optDetail.height = optHeight;
            detail.children.push(optDetail);
            total += optHeight + config.padding;
          }
        } else {
          const active = this.getActiveOption(state);
          if (active) {
            for (const child of active.children) {
              const childDetail = child.calcDetail(mode, state, depth + 1);
              detail.children.push(childDetail);
              total += childDetail.height;
            }
          } else {
            detail.children.push({
              type: 'placeholder',
              label: '无激活选项',
              height: config.lineHeight + config.padding
            });
            total += config.lineHeight + config.padding;
          }
        }
  
        detail.height = total;
        return detail;
      }
  
      // Union Option
      if (this.type === 'union_option') {
        detail.height = config.optionTitleHeight + config.padding;
        detail.isTitle = true;
        return detail;
      }
  
      // 数组字段
      if (this.type === 'array') {
        let total = (this.height || config.lineHeight) + config.padding;
        detail.arrayInfo = {
          length: this.getLength(),
          elementType: this.getElementTypeName()
        };
  
        for (const element of this.elements) {
          const elemDetail = element.calcDetail(mode, state, depth + 1);
          detail.children.push(elemDetail);
          total += elemDetail.height;
        }
  
        detail.height = total;
        return detail;
      }
  
      // 对象字段
      if (this.children && this.children.length > 0) {
        let total = (this.height || config.lineHeight) + config.padding;
        for (const child of this.children) {
          const childDetail = child.calcDetail(mode, state, depth + 1);
          detail.children.push(childDetail);
          total += childDetail.height;
        }
        detail.height = total;
        return detail;
      }
  
      return detail;
    }
  
    /**
     * 生成缓存键
     * @private
     */
    _cacheKey(mode, state, depth) {
      const stateStr = state ? JSON.stringify(state) : 'null';
      return `${this.key}_${mode}_${stateStr}_${depth}`;
    }
  
    /**
     * 保存缓存
     * @private
     */
    _saveCache(mode, state, depth, height) {
      if (this._heightConfig.useCache) {
        const key = this._cacheKey(mode, state, depth);
        this._heightCache.set(key, height);
      }
    }
  
    /**
     * 清空缓存
     * @private
     */
    _clearCache() {
      this._heightCache.clear();
    }
  
    /**
     * 清空所有缓存（包括子字段）
     */
    clearCache() {
      this._clearCache();
      for (const child of this.children) {
        if (child.clearCache) {
          child.clearCache();
        }
      }
    }
  
    /**
     * 获取缓存统计
     */
    cacheStats() {
      let total = this._heightCache.size;
      for (const child of this.children) {
        if (child.cacheStats) {
          const stats = child.cacheStats();
          total += stats.size || 0;
        }
      }
      return { size: total, local: this._heightCache.size };
    }
  };