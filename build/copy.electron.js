const fs = require('fs');
const path = require('path');

// 递归拷贝文件夹：不存在则创建，存在则覆盖
const copyDirs = (src, dest) => {
  const srcDir = path.resolve(src);
  const destDir = path.resolve(dest);

  // 自动创建目标目录（递归创建父级，已存在则忽略）
  fs.mkdirSync(destDir, { recursive: true });

  // 遍历源目录，递归拷贝文件/子目录
  fs.readdirSync(srcDir).forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    // 是目录就递归，是文件就直接覆盖拷贝
    fs.statSync(srcPath).isDirectory()
      ? copyDirs(srcPath, destPath)
      : fs.copyFileSync(srcPath, destPath);
  });
};

// 配置源目录和目标目录（直接修改这里）
copyDirs('src/electron', 'dist/electron');