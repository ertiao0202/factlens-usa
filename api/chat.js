// api/chat.js（CommonJS，已加超时&兜底）
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing KIMI_API_KEY' });

  try {
    const upstream = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify(req.body),
      signal : AbortSignal.timeout(5000), // 5 秒超时
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: text });
    }
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    // 任何网络/超时错误都返回 504，不再抛到构建层
    return res.status(504).json({ error: 'Upstream timeout', detail: err.message });
  }
};
