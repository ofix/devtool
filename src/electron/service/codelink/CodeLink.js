import path from 'path';
import { parseQueue } from './task/ParseTaskQueue.js';
import { getLangFromExt } from './parser/ParserLoader.js';
import { globalCache } from './cache/MemoryCache.js';

async function startParse(entryFile, projectRoot) {
  const absFile = path.resolve(entryFile);
  const lang = getLangFromExt(absFile);
  if (!lang) throw new Error('Unsupported file extension');

  console.log(`Start lazy parse entry: ${absFile}, lang: ${lang}`);
  await parseQueue.addTask(absFile, path.resolve(projectRoot), 0, lang);
  console.log('All dependent files parsed finished');
  console.log('Total symbols count:', globalCache.symbolMap.size);
}

// Demo
startParse('./test/Main.java', './code-root')
  .catch(e => console.error(e));

// startParse('./linux/kernel/fork.c', './linux-kernel')
// startParse('./src/App.ts', './ts-project')