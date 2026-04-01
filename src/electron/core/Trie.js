// Trie 树节点
class TrieNode {
    constructor() {
        this.children = new Map();
        this.stockSet = new Set(); // 自动去重
    }
}

// Trie 树
export default class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(keyword, stock) {
        if (!keyword) return;
        let node = this.root;
        for (const char of keyword) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char);
        }
        node.stockSet.add(stock);
    }

    search(prefix) {
        if (!prefix) return [];

        let current = this.root;
        for (const char of prefix) {
            if (!current.children.has(char)) return [];
            current = current.children.get(char);
        }

        // 收集所有子树的股票
        const matches = new Set();

        // 正确遍历：把所有节点的 Set 全部合并到一个总 Set 里
        function dfs(node) {
            for (const s of node.stockSet) {
                matches.add(s);
            }
            for (const child of node.children.values()) {
                dfs(child);
            }
        }

        dfs(current);

        // 转成数组返回
        return Array.from(matches);
    }
}