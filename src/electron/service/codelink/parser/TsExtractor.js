import { globalCache } from '../../cache/MemoryCache.js';

function traverseNode(node, cb) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    cb(n);
    stack.push(...n.children.reverse());
  }
}

function parseField(node) {
  let fieldName = null;
  let refTypeName = null;
  traverseNode(node, (n) => {
    if (n.type === 'identifier' && !fieldName) fieldName = n.text;
    if (['type_identifier', 'generic_type'].includes(n.type)) {
      const id = n.children.find(c => c.type === 'identifier');
      if (id) refTypeName = id.text;
    }
  });
  return { fieldName, refTypeName };
}

export default class TsExtractor {
  static extract(rootNode, filePath) {
    const symbols = [];
    traverseNode(rootNode, (node) => {
      if (!['class_declaration', 'interface_declaration'].includes(node.type)) return;
      const idNode = node.children.find(c => c.type === 'identifier');
      if (!idNode) return;
      const name = idNode.text;
      const symbolId = globalCache.genHash(`${filePath}#${name}`);

      const extendsList = [];
      const heritage = node.children.find(c => c.type === 'heritage_clause');
      if (heritage) {
        traverseNode(heritage, (n) => {
          if (n.type === 'type_identifier') {
            const id = n.children.find(x => x.type === 'identifier');
            if (id) extendsList.push(id.text);
          }
        });
      }

      const fields = [];
      const refTypeNames = new Set();
      const body = node.children.find(c => c.type === 'class_body' || c.type === 'interface_body');
      if (body) {
        traverseNode(body, (child) => {
          if (child.type !== 'property_definition') return;
          const { fieldName, refTypeName } = parseField(child);
          if (!fieldName) return;
          fields.push({ name: fieldName, typeRaw: child.text, refTypeName });
          if (refTypeName) refTypeNames.add(refTypeName);
        });
      }

      symbols.push({
        symbolId,
        lang: 'typescript',
        name,
        kind: node.type === 'class_declaration' ? 'class' : 'interface',
        defineFilePath: filePath,
        extends: [...new Set(extendsList)],
        fields,
        refTypeNames: Array.from(refTypeNames)
      });
    });
    return symbols;
  }
}