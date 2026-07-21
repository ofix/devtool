// example.js

import CodeProjectParser from './parser/CodeProjectParser.js';

async function main() {
  const parser = new CodeProjectParser({
    includePaths: ['/usr/include', '/usr/local/include'],
    classPaths: [],
    maxWorkers: 4
  });

  // 查看支持的语言
  console.log('Supported languages:', parser.getSupportedLanguages());

  // 解析 C 文件
  const cResult = await parser.parseFile('/path/to/file.c');
  console.log('C file structs:', Array.from(cResult.structs.keys()));

  // 解析 C++ 文件
  const cppResult = await parser.parseFile('/path/to/file.cpp');
  console.log('C++ file classes:', Array.from(cppResult.classes.keys()));
  console.log('C++ file structs:', Array.from(cppResult.structs.keys()));

  // 解析 Java 文件
  const javaResult = await parser.parseFile('/path/to/File.java');
  console.log('Java file classes:', Array.from(javaResult.classes.keys()));
  console.log('Java file methods:', Array.from(javaResult.functions.keys()));

  // 获取特定类型定义
  const typeDef = parser.getTypeDefinition('MyClass', '/path/to/File.java');
  console.log('Type definition:', typeDef);

  // 批量解析
  const files = [
    '/path/to/file1.c',
    '/path/to/file2.cpp',
    '/path/to/File3.java'
  ];
  const results = await parser.parseFiles(files);
  console.log('Parsed', results.length, 'files');

  // 解析目录
  const dirResults = await parser.parseDirectory('/path/to/source', {
    pattern: /\.(c|cpp|java)$/
  });
  console.log('Found', dirResults.length, 'source files');

  // 获取统计
  const stats = parser.getStats();
  console.log('Parser stats:', stats);

  parser.shutdown();
}

main().catch(console.error);