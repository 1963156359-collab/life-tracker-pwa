/* =========================================================================
   本地静态服务器（开发者工具，零依赖） 用法：node tools/serve.js
   -------------------------------------------------------------------------
   作用：把 life-tracker-pwa 目录通过 http 暴露给同一 Wi-Fi 下的手机，
   使手机浏览器能访问并“添加到主屏幕”（PWA 安装/离线缓存要求 http(s)）。
   监听 0.0.0.0:8080（局域网可访问），可用环境变量 PORT 改端口。
   按 Ctrl+C 停止。本脚本只是本地文件服务，应用数据依旧只存手机浏览器。
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { res.writeHead(400); res.end('Bad Request'); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ 生活记录 PWA 已启动，手机访问地址见上方提示（http://<电脑IP>:' + PORT + '）');
  console.log('   本机自测： http://127.0.0.1:' + PORT);
  console.log('   按 Ctrl+C 停止服务');
});
