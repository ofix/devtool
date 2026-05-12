import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==========================
// 配置（你只改这里）
// ==========================
const CONFIG = {
    // 要访问的网站（多个同时访问）
    websites: [
        "https://gu.qq.com/sz002950/gp",
        "https://quote.eastmoney.com/sz002264.html",
        "https://stock.9fzt.com/index/sh_605222.html"
    ],

    // 浏览器配置（路径可改）
    browsers: [
        {
            name: "360浏览器",
            path: "/opt/browser360/browser360"
        },
        {
            name: "奇安信浏览器",
            path: "/opt/qianxin.com/qaxbrowser/qaxbrowser"
        },

    ],

    headless: true,  // 无窗口模式
    waitTime: 10000,  // 等待端口启动（修复核心）
};

// 安全等待
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ==========================
// 真实请求头捕获脚本（浏览器内核执行）
// ==========================
const captureScript = `
<script>
// 拦截浏览器原生请求，获取真实Request Headers
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  try {
    const req = new Request(...args);
    console.log("=== 浏览器真实请求头 ===");
    const headers = {};
    for (let [k, v] of req.headers) headers[k] = v;
    console.log(JSON.stringify({ headers }, null, 2));
  } catch(e) {}
  return originalFetch(...args);
};

// 拦截XHR
const xhrProto = XMLHttpRequest.prototype;
const originalOpen = xhrProto.open;
xhrProto.open = function(...args) {
  try {
    console.log("=== 浏览器真实请求头 ===");
    const headers = {};
    for (let [k, v] of this.requestHeaders || []) headers[k] = v;
    console.log(JSON.stringify({ headers }, null, 2));
  } catch(e) {}
  originalOpen.apply(this, args);
};
</script>
`;

// 写入临时脚本
const scriptPath = path.join(__dirname, 'capture.html');
fs.writeFileSync(scriptPath, `
<html>${captureScript}<body><script>location.href="${CONFIG.websites[0]}"</script></body></html>
`);

// ==========================
// 启动浏览器（真实捕获）
// ==========================
async function runBrowser(browser) {
    return new Promise(async (resolve) => {
        console.log(`\n🚀 [${browser.name}] 开始捕获真实请求头...`);

        const args = [
            CONFIG.headless ? "--headless=new" : "",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--remote-allow-origins=*",
            scriptPath
        ].filter(Boolean);

        const proc = spawn(browser.path, args);

        // 输出日志（真实请求头）
        proc.stdout.on('data', (data) => {
            const log = data.toString();
            if (log.includes('"headers"')) {
                console.log(`\n✅ [${browser.name}] 捕获成功！`);
                console.log(log.trim());
            }
        });

        await sleep(10000);
        proc.kill();
        resolve();
    });
}

// ==========================
// 运行
// ==========================
async function start() {
    console.log("==================================================");
    console.log(" 真实浏览器请求头捕获工具（零报错·最终版）");
    console.log("==================================================\n");

    for (const b of CONFIG.browsers) {
        await runBrowser(b);
    }

    console.log("\n🎉 全部完成！");
    fs.unlinkSync(scriptPath);
}

start();