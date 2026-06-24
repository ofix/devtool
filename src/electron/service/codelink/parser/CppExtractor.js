import { globalCache } from '../../cache/MemoryCache.js';

function traverseNode(node, callback) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    callback(n);
    stack.push(...n.children.reverse());
  }
}

function parseField(node) {
  let fieldName = null;
  let refTypeName = null;
  traverseNode(node, (n) => {
    if (n.type === 'identifier' && !fieldName) fieldName = n.text;
    if (['class_specifier', 'struct_specifier', 'type_identifier'].includes(n.type)) {
      const id = n.children.find(c => c.type === 'identifier');
      if (id) refTypeName = id.text;
    }
  });
  return { fieldName, refTypeName };
}

export default class CppExtractor {
  static extract(rootNode, filePath) {
    const symbols = [];
    traverseNode(rootNode, (node) => {
      if (!['class_specifier', 'struct_specifier'].includes(node.type)) return;
      const idNode = node.children.find(c => c.type === 'identifier');
      if (!idNode) return;
      const name = idNode.text;
      const symbolId = globalCache.genHash(`${filePath}#${name}`);

      // 继承父类
      const extendsList = [];
      const baseClause = node.children.find(c => c.type === 'base_clause');
      if (baseClause) {
        traverseNode(baseClause, (n) => {
          if (n.type === 'type_identifier') {
            const id = n.children.find(x => x.type === 'identifier');
            if (id) extendsList.push(id.text);
          }
        });
      }

      const fields = [];
      const refTypeNames = new Set();
      const body = node.children.find(c => c.type === 'field_declaration_list');
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
        lang: 'cpp',
        name,
        kind: node.type === 'class_specifier' ? 'class' : 'struct',
        defineFilePath: filePath,
        extends: [...new Set(extendsList)],
        fields,
        refTypeNames: Array.from(refTypeNames)
      });
    });
    return symbols;
  }
}