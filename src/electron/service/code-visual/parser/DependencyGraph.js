// parser/DependencyGraph.js

export class DependencyGraph {
    constructor() {
      this.nodes = new Map();
      this.cycles = [];
      this.topologicalOrder = [];
    }
  
    /**
     * 添加或更新节点
     */
    addNode(filePath, dependencies = []) {
      if (!this.nodes.has(filePath)) {
        this.nodes.set(filePath, {
          filePath,
          dependencies: new Set(dependencies),
          dependents: new Set(),
          status: 'idle',
          structs: []
        });
      } else {
        const node = this.nodes.get(filePath);
        dependencies.forEach(dep => node.dependencies.add(dep));
      }
  
      // 更新反向依赖
      dependencies.forEach(dep => {
        if (!this.nodes.has(dep)) {
          this.addNode(dep, []);
        }
        this.nodes.get(dep).dependents.add(filePath);
      });
  
      this.detectCycles();
      this.updateTopologicalOrder();
    }
  
    /**
     * 检测循环依赖（使用DFS）
     */
    detectCycles() {
      const visited = new Set();
      const recursionStack = new Set();
      const cycles = [];
  
      const dfs = (nodePath, path) => {
        visited.add(nodePath);
        recursionStack.add(nodePath);
        path.push(nodePath);
  
        const node = this.nodes.get(nodePath);
        if (node) {
          for (const dep of node.dependencies) {
            if (!visited.has(dep)) {
              dfs(dep, [...path]);
            } else if (recursionStack.has(dep)) {
              // 找到循环
              const cycleStart = path.indexOf(dep);
              cycles.push(path.slice(cycleStart));
            }
          }
        }
  
        recursionStack.delete(nodePath);
      };
  
      for (const [nodePath] of this.nodes) {
        if (!visited.has(nodePath)) {
          dfs(nodePath, []);
        }
      }
  
      this.cycles = cycles;
    }
  
    /**
     * 更新拓扑排序（用于解析顺序）
     */
    updateTopologicalOrder() {
      const inDegree = new Map();
      const queue = [];
      const result = [];
  
      // 计算入度
      for (const [nodePath] of this.nodes) {
        inDegree.set(nodePath, 0);
      }
      for (const [, node] of this.nodes) {
        for (const dep of node.dependencies) {
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
  
      // 入度为0的节点入队
      for (const [nodePath, degree] of inDegree) {
        if (degree === 0) {
          queue.push(nodePath);
        }
      }
  
      // Kahn算法
      while (queue.length > 0) {
        const nodePath = queue.shift();
        result.push(nodePath);
  
        const node = this.nodes.get(nodePath);
        if (node) {
          for (const dep of node.dependencies) {
            const newDegree = (inDegree.get(dep) || 0) - 1;
            inDegree.set(dep, newDegree);
            if (newDegree === 0) {
              queue.push(dep);
            }
          }
        }
      }
  
      this.topologicalOrder = result;
    }
  
    /**
     * 获取文件的解析顺序（依赖在前）
     */
    getParseOrder(filePath) {
      const order = [];
      const visited = new Set();
  
      const dfs = (path) => {
        if (visited.has(path)) return;
        visited.add(path);
  
        const node = this.nodes.get(path);
        if (node) {
          for (const dep of node.dependencies) {
            dfs(dep);
          }
        }
        order.push(path);
      };
  
      dfs(filePath);
      return order.reverse();
    }
  
    /**
     * 获取循环依赖链
     */
    getCycles() {
      return this.cycles;
    }
  
    /**
     * 检查是否有循环依赖
     */
    hasCycles() {
      return this.cycles.length > 0;
    }
  
    /**
     * 获取依赖树（JSON格式）
     */
    getDependencyTree(filePath, depth = 3) {
      const node = this.nodes.get(filePath);
      if (!node) return null;
  
      const buildTree = (path, currentDepth) => {
        const n = this.nodes.get(path);
        if (!n || currentDepth === 0) {
          return { 
            path, 
            ...(n ? { hasMore: n.dependencies.size > 0 } : {}) 
          };
        }
  
        return {
          path,
          dependencies: Array.from(n.dependencies).map(dep => 
            buildTree(dep, currentDepth - 1)
          )
        };
      };
  
      return buildTree(filePath, depth);
    }
  
    /**
     * 获取节点状态
     */
    getNodeStatus(filePath) {
      const node = this.nodes.get(filePath);
      return node ? node.status : null;
    }
  
    /**
     * 更新节点状态
     */
    setNodeStatus(filePath, status, error = null) {
      const node = this.nodes.get(filePath);
      if (node) {
        node.status = status;
        if (error) node.error = error;
      }
    }
  
    /**
     * 获取所有依赖文件的路径
     */
    getAllDependencies(filePath) {
      const result = new Set();
      const visited = new Set();
  
      const dfs = (path) => {
        if (visited.has(path)) return;
        visited.add(path);
  
        const node = this.nodes.get(path);
        if (node) {
          for (const dep of node.dependencies) {
            result.add(dep);
            dfs(dep);
          }
        }
      };
  
      dfs(filePath);
      return Array.from(result);
    }
  
    /**
     * 获取被依赖的文件（反向依赖）
     */
    getDependents(filePath) {
      const node = this.nodes.get(filePath);
      return node ? Array.from(node.dependents) : [];
    }
  
    /**
     * 获取依赖图统计
     */
    getStats() {
      let totalDependencies = 0;
      for (const [, node] of this.nodes) {
        totalDependencies += node.dependencies.size;
      }
  
      return {
        totalNodes: this.nodes.size,
        totalDependencies,
        averageDependencies: this.nodes.size > 0 ? totalDependencies / this.nodes.size : 0,
        cycles: this.cycles.length,
        hasCycles: this.cycles.length > 0
      };
    }
  }
  
  export default DependencyGraph;