import Shape from "./Shape.js";
class ShapeGroup extends Shape {
    constructor(options = {}) {
      super(options);
      this._children = [];
      this.clip = options.clip || null;
    }
  
    add(child) {
      if (child.parent) {
        child.parent.remove(child);
      }
      child.parent = this;
      this._children.push(child);
      this.fire('add', { child });
      return this;
    }
  
    remove(child) {
      const index = this._children.indexOf(child);
      if (index !== -1) {
        this._children.splice(index, 1);
        child.parent = null;
        this.fire('remove', { child });
      }
      return this;
    }
  
    getChildren() {
      return this._children;
    }
  
    find(predicate) {
      const results = [];
      for (const child of this._children) {
        if (predicate(child)) {
          results.push(child);
        }
        if (child instanceof Group) {
          results.push(...child.find(predicate));
        }
      }
      return results;
    }
  
    hitTest(x, y) {
      if (!this.visible || this.frozen) return null;
      
      // 从后往前遍历（上层优先）
      for (let i = this._children.length - 1; i >= 0; i--) {
        const child = this._children[i];
        const hit = child.hitTest(x, y);
        if (hit) {
          return hit;
        }
      }
      return super.hitTest(x, y) ? this : null;
    }
  
    toJSON() {
      return {
        ...super.toJSON(),
        children: this._children.map(child => child.toJSON())
      };
    }
  }

  export default ShapeGroup;