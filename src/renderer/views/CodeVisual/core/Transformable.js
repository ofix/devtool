import EventTarget from "./EventTarget.js";
import Matrix from "./Matrix.js";

class Transformable extends EventTarget {
    constructor(options = {}) {
        super(options.parent || null, options.children || []);
        
        // 完整变换属性
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.rotation = options.rotation || 0;
        this.scaleX = options.scaleX || 1;
        this.scaleY = options.scaleY || 1;
        this.originX = options.originX || 0;
        this.originY = options.originY || 0;
        this.width = options.width || 0;
        this.height = options.height || 0;
        
        // 缓存
        this._localTransform = null;
        this._globalTransform = null;
        this._transformDirty = true;
        this._type = 'transformable';
    }

    _markDirty() {
        this._transformDirty = true;
        this._localTransform = null;
        this._globalTransform = null;
        if (this.parent) {
            this.parent._markDirty();
        }
    }

    getLocalTransform() {
        if (this._transformDirty || !this._localTransform) {
            this._localTransform = this._buildLocalTransform();
        }
        return this._localTransform;
    }

    _buildLocalTransform() {
        let matrix = new Matrix();
        
        // 平移
        matrix = matrix.translate(this.x, this.y);
        
        // 原点
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

    getGlobalTransform() {
        if (this._transformDirty || !this._globalTransform) {
            let matrix = this.getLocalTransform();
            let parent = this.parent;
            
            while (parent) {
                if (parent instanceof Transformable) {
                    matrix = parent.getLocalTransform().multiply(matrix);
                }
                parent = parent.parent;
            }
            
            this._globalTransform = matrix;
            this._transformDirty = false;
        }
        return this._globalTransform;
    }
}