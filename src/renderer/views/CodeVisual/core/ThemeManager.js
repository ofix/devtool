// ==================== 全局主题系统 ====================

/**
 * 主题管理器 - 单例模式
 * 管理所有表格的样式和颜色配置
 */
class ThemeManager {
    constructor() {
      this._themes = new Map();
      this._currentTheme = 'dark';
      this._listeners = [];
      
      // 注册默认主题
      this.registerTheme('dark', this._getDarkTheme());
      this.registerTheme('light', this._getLightTheme());
      this.registerTheme('blender', this._getBlenderTheme());
      this.registerTheme('monokai', this._getMonokaiTheme());
    }
  
    // ==================== 主题定义 ====================
  
    _getDarkTheme() {
      return {
        id: 'dark',
        name: '暗色主题',
        // 表格样式
        table: {
          headerBg: '#2d2d2d',
          headerText: '#ffffff',
          rowBg: '#3a3a3a',
          rowAltBg: '#3f3f3f',
          text: '#cccccc',
          border: '#4a4a4a',
          frozenBg: 'rgba(255,255,255,0.05)',
          collapsedBg: 'rgba(100,100,100,0.3)',
          hiddenBg: 'rgba(255,0,0,0.1)',
        },
        // 高亮样式
        highlight: {
          bg: 'rgba(255, 193, 7, 0.2)',
          border: '#ffc107',
        },
        // 展开样式
        expanded: {
          bg: 'rgba(33, 150, 243, 0.15)',
        },
        // 类型颜色映射
        types: {
          string: '#4CAF50',
          number: '#2196F3',
          boolean: '#FF9800',
          object: '#9C27B0',
          array: '#F44336',
          null: '#757575',
          pointer: '#FF5722',
          reference: '#00BCD4',
          unknown: '#888888',
        },
        // 特殊元素
        elements: {
          referenceCircle: '#4CAF50',
          pointerCircle: '#FF9800',
          resizeHandle: 'rgba(255,255,255,0.15)',
          resizeHandleActive: '#1976D2',
          collapseButtonBg: 'rgba(255,255,255,0.1)',
          collapseButtonText: '#ffffff',
          expandButtonBg: '#1976D2',
          expandButtonText: '#ffffff',
          collapseButtonDefault: '#757575',
        },
        // 字体
        font: {
          family: 'monospace',
          size: 13,
          headerSize: 14,
          typeSize: 0.7,
        },
        // 尺寸
        spacing: {
          cellPadding: 4,
          rowHeight: 28,
          headerHeight: 32,
          indentSize: 20,
          circleRadius: 6,
          resizeHandleSize: 6,
        },
      };
    }
  
    _getLightTheme() {
      return {
        id: 'light',
        name: '亮色主题',
        table: {
          headerBg: '#e8e8e8',
          headerText: '#333333',
          rowBg: '#ffffff',
          rowAltBg: '#f5f5f5',
          text: '#333333',
          border: '#cccccc',
          frozenBg: 'rgba(0,0,0,0.03)',
          collapsedBg: 'rgba(150,150,150,0.2)',
          hiddenBg: 'rgba(255,0,0,0.05)',
        },
        highlight: {
          bg: 'rgba(255, 193, 7, 0.3)',
          border: '#f57c00',
        },
        expanded: {
          bg: 'rgba(33, 150, 243, 0.1)',
        },
        types: {
          string: '#2E7D32',
          number: '#0D47A1',
          boolean: '#E65100',
          object: '#6A1B9A',
          array: '#C62828',
          null: '#616161',
          pointer: '#BF360C',
          reference: '#00695C',
          unknown: '#888888',
        },
        elements: {
          referenceCircle: '#2E7D32',
          pointerCircle: '#E65100',
          resizeHandle: 'rgba(0,0,0,0.1)',
          resizeHandleActive: '#1976D2',
          collapseButtonBg: 'rgba(0,0,0,0.05)',
          collapseButtonText: '#333333',
          expandButtonBg: '#1976D2',
          expandButtonText: '#ffffff',
          collapseButtonDefault: '#999999',
        },
        font: {
          family: 'monospace',
          size: 13,
          headerSize: 14,
          typeSize: 0.7,
        },
        spacing: {
          cellPadding: 4,
          rowHeight: 28,
          headerHeight: 32,
          indentSize: 20,
          circleRadius: 6,
          resizeHandleSize: 6,
        },
      };
    }
  
    _getBlenderTheme() {
      return {
        id: 'blender',
        name: 'Blender风格',
        table: {
          headerBg: '#383838',
          headerText: '#dddddd',
          rowBg: '#424242',
          rowAltBg: '#484848',
          text: '#dddddd',
          border: '#555555',
          frozenBg: 'rgba(255,255,255,0.03)',
          collapsedBg: 'rgba(80,80,80,0.5)',
          hiddenBg: 'rgba(200,50,50,0.1)',
        },
        highlight: {
          bg: 'rgba(255, 200, 50, 0.15)',
          border: '#ffc800',
        },
        expanded: {
          bg: 'rgba(50, 150, 255, 0.12)',
        },
        types: {
          string: '#a8d8a8',
          number: '#8ab8ff',
          boolean: '#ffc864',
          object: '#c8a8ff',
          array: '#ff8a8a',
          null: '#999999',
          pointer: '#ff8a50',
          reference: '#50c8a0',
          unknown: '#888888',
        },
        elements: {
          referenceCircle: '#50c8a0',
          pointerCircle: '#ff8a50',
          resizeHandle: 'rgba(255,255,255,0.1)',
          resizeHandleActive: '#4a9aff',
          collapseButtonBg: 'rgba(255,255,255,0.05)',
          collapseButtonText: '#dddddd',
          expandButtonBg: '#4a9aff',
          expandButtonText: '#ffffff',
          collapseButtonDefault: '#888888',
        },
        font: {
          family: 'sans-serif',
          size: 12,
          headerSize: 13,
          typeSize: 0.65,
        },
        spacing: {
          cellPadding: 5,
          rowHeight: 26,
          headerHeight: 30,
          indentSize: 18,
          circleRadius: 5,
          resizeHandleSize: 5,
        },
      };
    }
  
    _getMonokaiTheme() {
      return {
        id: 'monokai',
        name: 'Monokai风格',
        table: {
          headerBg: '#272822',
          headerText: '#f8f8f2',
          rowBg: '#3e3d32',
          rowAltBg: '#45443a',
          text: '#f8f8f2',
          border: '#49483e',
          frozenBg: 'rgba(255,255,255,0.03)',
          collapsedBg: 'rgba(150,150,150,0.2)',
          hiddenBg: 'rgba(255,0,0,0.08)',
        },
        highlight: {
          bg: 'rgba(255, 215, 0, 0.2)',
          border: '#ffd700',
        },
        expanded: {
          bg: 'rgba(102, 217, 239, 0.12)',
        },
        types: {
          string: '#a6e22e',
          number: '#ae81ff',
          boolean: '#fd971f',
          object: '#66d9ef',
          array: '#f92672',
          null: '#888888',
          pointer: '#fd971f',
          reference: '#a1efe4',
          unknown: '#888888',
        },
        elements: {
          referenceCircle: '#a1efe4',
          pointerCircle: '#fd971f',
          resizeHandle: 'rgba(255,255,255,0.1)',
          resizeHandleActive: '#66d9ef',
          collapseButtonBg: 'rgba(255,255,255,0.05)',
          collapseButtonText: '#f8f8f2',
          expandButtonBg: '#66d9ef',
          expandButtonText: '#272822',
          collapseButtonDefault: '#888888',
        },
        font: {
          family: 'monospace',
          size: 13,
          headerSize: 14,
          typeSize: 0.7,
        },
        spacing: {
          cellPadding: 4,
          rowHeight: 28,
          headerHeight: 32,
          indentSize: 20,
          circleRadius: 6,
          resizeHandleSize: 6,
        },
      };
    }
  
    // ==================== 主题管理 ====================
  
    /**
     * 注册主题
     */
    registerTheme(id, theme) {
      theme.id = id;
      this._themes.set(id, theme);
      return this;
    }
  
    /**
     * 获取主题
     */
    getTheme(id) {
      return this._themes.get(id) || this._themes.get('dark');
    }
  
    /**
     * 设置当前主题
     */
    setCurrentTheme(id) {
      if (this._themes.has(id)) {
        this._currentTheme = id;
        this._notifyListeners();
      }
      return this;
    }
  
    /**
     * 获取当前主题
     */
    getCurrentTheme() {
      return this.getTheme(this._currentTheme);
    }
  
    /**
     * 获取当前主题ID
     */
    getCurrentThemeId() {
      return this._currentTheme;
    }
  
    /**
     * 获取所有主题列表
     */
    getThemes() {
      return Array.from(this._themes.keys());
    }
  
    /**
     * 监听主题变化
     */
    onChange(listener) {
      this._listeners.push(listener);
      return this;
    }
  
    /**
     * 移除监听
     */
    offChange(listener) {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
      return this;
    }
  
    _notifyListeners() {
      const theme = this.getCurrentTheme();
      for (const listener of this._listeners) {
        try {
          listener(theme);
        } catch (error) {
          console.error('Theme listener error:', error);
        }
      }
    }
  
    // ==================== 获取样式工具 ====================
  
    /**
     * 获取类型颜色
     */
    getTypeColor(type) {
      const theme = this.getCurrentTheme();
      return theme.types[type] || theme.types.unknown;
    }
  
    /**
     * 获取表格样式
     */
    getTableStyle() {
      const theme = this.getCurrentTheme();
      return theme.table;
    }
  
    /**
     * 获取高亮样式
     */
    getHighlightStyle() {
      const theme = this.getCurrentTheme();
      return theme.highlight;
    }
  
    /**
     * 获取展开样式
     */
    getExpandedStyle() {
      const theme = this.getCurrentTheme();
      return theme.expanded;
    }
  
    /**
     * 获取元素样式
     */
    getElementStyle() {
      const theme = this.getCurrentTheme();
      return theme.elements;
    }
  
    /**
     * 获取字体配置
     */
    getFontConfig() {
      const theme = this.getCurrentTheme();
      return theme.font;
    }
  
    /**
     * 获取间距配置
     */
    getSpacingConfig() {
      const theme = this.getCurrentTheme();
      return theme.spacing;
    }
  
    /**
     * 获取字段颜色（支持自定义覆盖）
     */
    getFieldColor(field, customColors = null) {
      // 优先使用自定义颜色
      if (customColors && customColors.has(field.id)) {
        return customColors.get(field.id);
      }
      // 其次使用类型颜色
      if (field.type) {
        return this.getTypeColor(field.type);
      }
      return this.getTypeColor('unknown');
    }
  
    /**
     * 判断是否为指针或引用
     */
    isPointerOrReference(field) {
      return field.isPointer || field.isReference || 
             field.type === 'pointer' || field.type === 'reference';
    }
  
    /**
     * 获取指针/引用颜色
     */
    getPointerColor(field) {
      const elements = this.getElementStyle();
      if (field.isReference || field.type === 'reference') {
        return elements.referenceCircle;
      }
      if (field.isPointer || field.type === 'pointer') {
        return elements.pointerCircle;
      }
      return null;
    }
  }

  export default ThemeManager;