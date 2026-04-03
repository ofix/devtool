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

        // 用 Map 去重（key = 股票唯一标识）
        const resultMap = new Map();

        function dfs(node) {
            for (const stock of node.stockSet) {

                resultMap.set(stock.code, stock); // 自动覆盖重复，只留一个
            }
            // 继续遍历子节点
            for (const child of node.children.values()) {
                dfs(child);
            }
        }

        dfs(current);

        // 转数组返回
        return Array.from(resultMap.values());
    }
}