import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import CPP from 'tree-sitter-cpp';
import TS from 'tree-sitter-typescript';
import JAVA from 'tree-sitter-java';

const parserPool = new Map();

export function getParser(lang) {
  if (parserPool.has(lang)) return parserPool.get(lang);
  const parser = new Parser();
  switch (lang) {
    case 'c':
      parser.setLanguage(C);
      break;
    case 'cpp':
      parser.setLanguage(CPP);
      break;
    case 'typescript':
      parser.setLanguage(TS.typescript);
      break;
    case 'java':
      parser.setLanguage(JAVA);
      break;
  }
  parserPool.set(lang, parser);
  return parser;
}

export function getLangFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  if (['c', 'h'].includes(ext)) return 'c';
  if (['cpp', 'hpp', 'cc', 'cxx', 'hxx'].includes(ext)) return 'cpp';
  if (['ts', 'tsx'].includes(ext)) return 'typescript';
  if (ext === 'java') return 'java';
  return null;
}