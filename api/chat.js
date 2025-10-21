// api/chat.js  —— CommonJS 版，支持流式
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const upstream = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method : 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KIMI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...req.body, stream: true }), // 强制流式
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return res.status(upstream.status).send(text);
  }

  // 逐块转发，保持 SSE 格式
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  upstream.body.on('data', chunk => res.write(chunk));
  upstream.body.on('end', () => res.end());
};
