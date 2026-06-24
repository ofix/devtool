import { globalCache } from '../../cache/MemoryCache.js';

function traverseNode(node, callback) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    callback(n);
    for (let i = n.children.length - 1; i >= 0; i--) {
      stack.push(n.children[i]);
    }
  }
}

function parseField(fieldDeclNode) {
  let fieldName = null;
  let refTypeName = null;
  traverseNode(fieldDeclNode, (n) => {
    if (n.type === 'identifier' && !fieldName) fieldName = n.text;
    if (n.type === 'struct_specifier') {
      const id = n.children.find(c => c.type === 'identifier');
      if (id) refTypeName = id.text;
    }
  });
  return { fieldName, refTypeName };
}

export default class CExtractor {
  static extract(rootNode, filePath) {
    const symbols = [];
    traverseNode(rootNode, (node) => {
      if (node.type !== 'struct_specifier') return;
      const idNode = node.children.find(c => c.type === 'identifier');
      if (!idNode) return;
      const name = idNode.text;
      const symbolId = globalCache.genHash(`${filePath}#${name}`);
      const body = node.children.find(c => c.type === 'field_declaration_list');

      const fields = [];
      const refTypeNames = new Set();
      if (body) {
        traverseNode(body, (child) => {
          if (child.type !== 'field_declaration') return;
          const { fieldName, refTypeName } = parseField(child);
          if (!fieldName) return;
          fields.push({ name: fieldName, typeRaw: child.text, refTypeName });
          if (refTypeName) refTypeNames.add(refTypeName);
        });
      }

      symbols.push({
        symbolId,
        lang: 'c',
        name,
        kind: 'struct',
        defineFilePath: filePath,
        extends: [],
        fields,
        refTypeNames: Array.from(refTypeNames)
      });
    });
    return symbols;
  }
}