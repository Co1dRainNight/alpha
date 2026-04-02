#!/usr/bin/env node
/**
 * Alpha-Perp 看板后端代理
 * 解决浏览器直连 Binance API 的 CORS 问题
 * 
 * 启动：node server.js
 * 端口：http://localhost:3001
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const BINANCE_SPOT = 'https://api.binance.com';
const BINANCE_FUTURES = 'https://fapi.binance.com';

// MIME 类型
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// 日志函数
function log(req, res, status, url) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${status} ${req.method} ${url}`);
}

// 创建 HTTP 请求
function proxyRequest(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        ...headers
      },
      timeout: 10000
    };
    
    client.get(targetUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Request timeout')));
  });
}

// 处理静态文件
function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
}

// 处理 API 代理请求
async function handleProxy(req, res, path, query) {
  // 解析 target URL
  let targetUrl;
  
  if (path === '/api/spot') {
    targetUrl = `${BINANCE_SPOT}/api/v3/ticker/24hr`;
  } else if (path === '/api/futures') {
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/ticker/24hr`;
  } else if (path === '/api/funding') {
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/premiumIndex`;
  } else if (path === '/api/klines') {
    const symbol = query.get('symbol') || 'BTCUSDT';
    const limit = query.get('limit') || '12';
    targetUrl = `${BINANCE_SPOT}/api/v3/klines?symbol=${symbol}&interval=5m&limit=${limit}`;
  } else if (path === '/api/oi') {
    const symbol = query.get('symbol') || 'BTCUSDT';
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${symbol}`;
  } else if (path === '/api/globalLongShort') {
    const symbol = query.get('symbol') || 'BTCUSDT';
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=5`;
  } else {
    res.writeHead(404);
    res.end('Unknown API endpoint');
    return;
  }
  
  try {
    const data = await proxyRequest(targetUrl);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
    log(req, res, 200, path);
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
    log(req, res, 500, path);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const query = url.searchParams;

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  // API 代理
  if (pathname.startsWith('/api/')) {
    await handleProxy(req, res, pathname, query);
    return;
  }

  // 静态文件
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);
  
  serveStatic(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n🚀 Alpha-Perp 看板代理服务器已启动`);
  console.log(`   本地访问: http://localhost:${PORT}`);
  console.log(`   按 Ctrl+C 停止\n`);
});
