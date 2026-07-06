
// structs/StructTrie.js
import { StructHierarchy } from '../core/StructHierarchy.js';

export class StructTrie extends StructHierarchy {
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Trie';
        this.connectionColor = options.connectionColor || '#28a745';
        this.leafColor = options.leafColor || '#28a745';
        this.isEndOfWord = options.isEndOfWord || false;
    }

    // Trie节点
    createTrieNode(char, isEnd = false) {
        const node = new StructContainer({
            title: char || 'root',
            width: this.nodeWidth * 0.6,
            height: this.nodeHeight * 0.6,
            backgroundColor: isEnd ? '#d4edda' : '#f8f9fa',
            borderColor: isEnd ? '#28a745' : '#6c757d'
        });
        
        node.isEndOfWord = isEnd;
        return node;
    }

    // 插入单词
    insertWord(word) {
        if (!this.root) {
            this.root = this.createTrieNode('root');
            this.children = [this.root];
        }
        
        let currentNode = this.root;
        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            let found = false;
            
            // 查找是否已有该字符节点
            if (currentNode.children) {
                for (const child of currentNode.children) {
                    if (child.title === char) {
                        currentNode = child;
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) {
                const isEnd = (i === word.length - 1);
                const newNode = this.createTrieNode(char, isEnd);
                currentNode.addChild(newNode);
                currentNode = newNode;
            } else if (i === word.length - 1) {
                currentNode.isEndOfWord = true;
                currentNode.theme.backgroundColor = this.leafColor + '40';
                currentNode.theme.borderColor = this.leafColor;
            }
        }
        
        this.markDirty();
        return this;
    }

    // 批量插入单词
    insertWords(words) {
        words.forEach(word => this.insertWord(word));
        return this;
    }

    // 搜索单词
    searchWord(word) {
        let currentNode = this.root;
        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            let found = false;
            
            if (currentNode.children) {
                for (const child of currentNode.children) {
                    if (child.title === char) {
                        currentNode = child;
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) return false;
        }
        return currentNode.isEndOfWord;
    }

    // 获取所有单词
    getAllWords() {
        const words = [];
        this._collectWords(this.root, '', words);
        return words;
    }

    _collectWords(node, prefix, words) {
        if (node.isEndOfWord) {
            words.push(prefix);
        }
        if (node.children) {
            node.children.forEach(child => {
                this._collectWords(child, prefix + child.title, words);
            });
        }
    }
}