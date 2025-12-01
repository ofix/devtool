 import FileTree from "../core/FileTree.js";

  // ------------------------------
  // 用法示例：模拟用户排序交互场景
  // ------------------------------
  async function demo() {
    // 1. 模拟 SSH2 ls -l 输出（包含 /usr/share/www 及相关目录）
    const mockLsOutput = `total 64
  drwxr-xr-x  5 root  root   160 Oct 25 10:00 /usr/
  drwxr-xr-x  3 root  root    96 Oct 25 10:01 /usr/bin/
  drwxr-xr-x  4 root  root   128 Oct 25 10:02 /usr/share/
  drwxr-xr-x  2 root  root    64 Oct 25 10:03 /usr/share/www/
  -rw-r--r--  1 root  root  2048 Oct 25 10:04 /usr/share/www/style.css
  -rw-r--r--  1 root  root  1024 Oct 25 10:05 /usr/share/www/index.html
  drwxr-xr-x  2 root  root    64 Oct 25 10:06 /usr/share/docs/
  -rw-r--r--  1 root  root   512 Oct 25 10:07 /usr/share/docs/readme.md
  drwxr-xr-x  2 root  root    64 Oct 25 10:08 /usr/lib/
  -rwxr-xr-x  1 root  root  4096 Oct 25 10:09 /usr/lib/libutil.so`;
  
    // 2. 创建实例（默认禁用排序）
    const fileTree = new FileTree(mockLsOutput, {
      initialRootPath: '/usr/share/www',
      showPermissions: true,
      showSize: true,
      showDate: true,
      sortConfig: {
        enabled: false // 默认不排序，由用户触发
      }
    });
  
    console.log('=== 1. 初始状态（禁用排序） ===');
    fileTree.print();
    // 输出：按添加顺序显示（style.css 在前，index.html 在后）
  
    // 3. 用户点击"按名称排序"（升序）
    console.log('\n=== 2. 用户点击：按名称升序排序 ===');
    fileTree.updateSortConfig({
      enabled: true,
      field: SortField.NAME,
      direction: SortDirection.ASC
    });
    fileTree.print();
    // 输出：按名称排序（index.html 在前，style.css 在后）
  
    // 4. 用户点击"切换排序方向"（升序→降序）
    console.log('\n=== 3. 用户点击：切换为名称降序 ===');
    fileTree.toggleSortDirection();
    fileTree.print();
    // 输出：按名称降序（style.css 在前，index.html 在后）
  
    // 5. 用户点击"按大小排序"（降序）
    console.log('\n=== 4. 用户点击：按大小降序排序 ===');
    fileTree.updateSortConfig({
      field: SortField.SIZE,
      direction: SortDirection.DESC
    });
    fileTree.print();
    // 输出：按大小降序（style.css 2048B 在前，index.html 1024B 在后）
  
    // 6. 导航上层目录，验证排序规则生效（兄弟节点也按大小排序）
    console.log('\n=== 5. 返回上层目录，验证排序规则 ===');
    fileTree.navigateUp(); // 到 /usr/share
    fileTree.print();
    // 输出：www/ 和 docs/ 按大小排序（www/ 包含更大文件，在前）
  
    // 7. 禁用排序，恢复添加顺序
    console.log('\n=== 6. 用户点击：禁用排序 ===');
    fileTree.updateSortConfig({ enabled: false });
    fileTree.print();
    // 输出：恢复初始添加顺序
  }
  
  // 执行示例
  demo();




// 假设前端有如下排序按钮：
const sortButtons = {
    name: document.getElementById('sort-by-name'),
    size: document.getElementById('sort-by-size'),
    date: document.getElementById('sort-by-date'),
    toggleDirection: document.getElementById('toggle-sort-direction')
  };
  
  // 1. 用户点击"按名称排序"
  sortButtons.name.addEventListener('click', () => {
    fileTree.updateSortConfig({
      enabled: true,
      field: SortField.NAME,
      direction: SortDirection.ASC
    });
    // 重新渲染文件树
    renderFileTree(fileTree.getFormattedCurrentTree());
  });
  
  // 2. 用户点击"切换排序方向"
  sortButtons.toggleDirection.addEventListener('click', () => {
    fileTree.toggleSortDirection();
    renderFileTree(fileTree.getFormattedCurrentTree());
  });
  
  // 3. 用户点击"禁用排序"
  document.getElementById('disable-sort').addEventListener('click', () => {
    fileTree.updateSortConfig({ enabled: false });
    renderFileTree(fileTree.getFormattedCurrentTree());
  });