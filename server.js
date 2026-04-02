#!/usr/bin/env node
/**
 * Alpha-Perp 看板后端代理服务器
 * 
 * 同时提供：
 * 1. 静态文件服务（HTML/CSS/JS）
 * 2. Binance API 代理（解决 CORS）
 * 
 * 启动：node server.js
 * 访问：http://129.226.220.91:3001
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 80;
const HOST = '0.0.0.0';

const BINANCE_SPOT = 'https://api.binance.com';
const BINANCE_FUTURES = 'https://fapi.binance.com';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function log(status, method, pathname) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${status} ${method} ${pathname}`);
}

function proxyRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: 15000
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
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'text/plain',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

async function handleApi(req, res, pathname, query) {
  let targetUrl;
  
  if (pathname === '/api/spot') {
    targetUrl = `${BINANCE_SPOT}/api/v3/ticker/24hr`;
  } else if (pathname === '/api/futures') {
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/ticker/24hr`;
  } else if (pathname === '/api/funding') {
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/premiumIndex`;
  } else if (pathname === '/api/klines') {
    const symbol = (query && query.symbol) ? query.symbol : 'BTCUSDT';
    const limit = (query && query.limit) ? query.limit : '13';
    targetUrl = `${BINANCE_SPOT}/api/v3/klines?symbol=${symbol}&interval=5m&limit=${limit}`;
  } else if (pathname === '/api/oi') {
    const symbol = (query && query.symbol) ? query.symbol : 'BTCUSDT';
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${symbol}`;
  } else if (pathname === '/api/globalLongShort') {
    const symbol = (query && query.symbol) ? query.symbol : 'BTCUSDT';
    targetUrl = `${BINANCE_FUTURES}/fapi/v1/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=5`;
  } else {
    res.writeHead(404);
    res.end('API not found');
    return;
  }
  
  try {
    const data = await proxyRequest(targetUrl);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
    log(200, 'API', pathname);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
    log(500, 'API', pathname);
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

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
    await handleApi(req, res, pathname, query);
    return;
  }

  // 静态文件
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);
  
  // 安全检查：防止目录遍历
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  serveStatic(req, res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log('\n🚀 Alpha-Perp 看板服务器已启动');
  console.log(`   访问地址: http://129.226.220.91:${PORT}`);
  console.log(`   API 代理: http://129.226.220.91:${PORT}/api/*`);
  console.log(`   静态文件: http://129.226.220.91:${PORT}/index.html`);
  console.log('\n按 Ctrl+C 停止\n');
});
