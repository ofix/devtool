// parser/core/ASTWalker.js

/**
 * AST 遍历器 - 提供统一的树遍历接口
 */
export class ASTWalker {
    constructor() {
      this.visitors = new Map();
      this.defaultVisitor = null;
    }
  
    /**
     * 注册节点访问器
     */
    registerVisitor(nodeType, visitor) {
      if (!this.visitors.has(nodeType)) {
        this.visitors.set(nodeType, []);
      }
      this.visitors.get(nodeType).push(visitor);
      return this;
    }
  
    /**
     * 注册默认访问器
     */
    setDefaultVisitor(visitor) {
      this.defaultVisitor = visitor;
      return this;
    }
  
    /**
     * 遍历 AST
     */
    walk(node, context = {}) {
      if (!node) return context;
  
      // 调用对应类型的访问器
      const nodeType = node.type || 'unknown';
      const visitors = this.visitors.get(nodeType) || [];
      
      for (const visitor of visitors) {
        try {
          visitor(node, context);
        } catch (error) {
          console.error(`Error in visitor for ${nodeType}:`, error);
        }
      }
  
      // 调用默认访问器
      if (this.defaultVisitor) {
        try {
          this.defaultVisitor(node, context);
        } catch (error) {
          console.error('Error in default visitor:', error);
        }
      }
  
      return context;
    }
  
    /**
     * 深度优先遍历
     */
    walkDepthFirst(node, context = {}) {
      if (!node) return context;
  
      // 先访问当前节点
      this.walk(node, context);
  
      // 遍历子节点
      if (node.children) {
        for (const child of node.children) {
          this.walkDepthFirst(child, context);
        }
      }
  
      return context;
    }
  
    /**
     * 广度优先遍历
     */
    walkBreadthFirst(node, context = {}) {
      if (!node) return context;
  
      const queue = [node];
      while (queue.length > 0) {
        const current = queue.shift();
        this.walk(current, context);
  
        if (current.children) {
          for (const child of current.children) {
            queue.push(child);
          }
        }
      }
  
      return context;
    }
  
    /**
     * 从树中查找特定节点
     */
    findNodes(node, predicate, results = []) {
      if (!node) return results;
  
      if (predicate(node)) {
        results.push(node);
      }
  
      if (node.children) {
        for (const child of node.children) {
          this.findNodes(child, predicate, results);
        }
      }
  
      return results;
    }
  
    /**
     * 从树中查找第一个匹配的节点
     */
    findFirst(node, predicate) {
      if (!node) return null;
  
      if (predicate(node)) {
        return node;
      }
  
      if (node.children) {
        for (const child of node.children) {
          const found = this.findFirst(child, predicate);
          if (found) return found;
        }
      }
  
      return null;
    }
  }
  
  export default ASTWalker;