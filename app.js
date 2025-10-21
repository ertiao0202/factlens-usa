// app.js
const $   = s => document.querySelector(s);
const url = '/api/chat';

let radarChart;
// ===== 请求锁 & 冷却 =====
let isAnalyzing = false;
const COOL_DOWN = 1200; // ms

const ui = {
  input   : $('#urlInput'),
  btn     : $('#analyzeBtn'),
  progress: $('#progress'),
  summary : $('#summary'),
  fourDim : $('#fourDim'),
  results : $('#results'),
  fact    : $('#factList'),
  opinion : $('#opinionList'),
  bias    : $('#biasList'),
  pub     : $('#pubAdvice'),
  pr      : $('#prAdvice'),
  radarEl : $('#radar')
};

/* 原生自动增高 + 动画 */
const tx = document.getElementById('urlInput');
tx.addEventListener('input', () => {
  tx.style.height = 'auto';
  tx.style.height = tx.scrollHeight + 'px';
});

/* ===== 工具函数 ===== */
function smoothNeutrality(n){
  if (n <= 2)  return 10 - n * 0.5;
  if (n <= 5)  return 9   - (n - 2) * 1.2;
  if (n <= 9)  return 5.4 - (n - 5) * 0.9;
  return Math.max(0, 1.2 - (n - 9) * 0.15);
}

function listConf(ul, arr){
  if (!arr.length) {
    ul.innerHTML = '<li>None detected</li>';
    return;
  }
  ul.innerHTML = arr.map(item => {
    const cert = item.cert;   // ← 用 cert 代替 conf
    let cls = '';
    if (cert >= 0.8) cls = 'conf-high';
    else if (cert >= 0.5) cls = 'conf-mid';
    else cls = 'conf-low';
    return `<li class="${cls}" title="confidence ${(cert*100).toFixed(0)}%">${item.text}</li>`;
  }).join('');
}

function bias(ul, b){
  ul.innerHTML = `
    <li>Emotional words: ${b.emotional}</li>
    <li>Binary opposition: ${b.binary}</li>
    <li>Mind-reading: ${b.mind}</li>
    <li>Logical fallacy: ${b.fallacy}</li>
    <li>Overall stance: ${b.stance}</li>
  `;
}

function showSummary(txt){
  ui.summary.textContent = txt;
  ui.summary.classList.remove('hidden');
}

/* ===== 三态切换 ===== */
const skeleton = $('#skeleton');
const real     = $('#results');

function showSkeleton(){ skeleton.classList.remove('hidden'); real.classList.add('hidden'); }
function showReal()    { skeleton.classList.add('hidden');    real.classList.remove('hidden'); }

function showProgress(){ showSkeleton(); }        // ① 骨架
function hideProgress(){ showReal(); }            // ③ 真实

function drawBars({ transparency, factDensity, emotion, consistency }){
  const max = 10;
  document.getElementById('tsVal').textContent = transparency.toFixed(1);
  document.getElementById('fdVal').textContent = factDensity.toFixed(1);
  document.getElementById('ebVal').textContent = emotion.toFixed(1);
  document.getElementById('csVal').textContent = consistency.toFixed(1);
  document.getElementById('tsBar').style.width = `${(transparency / max) * 100}%`;
  document.getElementById('fdBar').style.width = `${(factDensity / max) * 100}%`;
  document.getElementById('ebBar').style.width = `${(emotion / max) * 100}%`;
  document.getElementById('csBar').style.width = `${(consistency / max) * 100}%`;
}

function drawRadar(data){
  if (typeof window.Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ui.radarEl, {
    type:'radar',
    data:{
      labels:['Credibility','Fact Density','Neutrality','Consistency'],
      datasets:[{
        label:'Score',
        data,
        backgroundColor:'rgba(37,99,235,0.2)',
        borderColor:'#2563eb',
        pointBackgroundColor:'#2563eb'
      }]
    },
    options:{ scales:{ r:{ suggestedMin:0, suggestedMax:10 } }, plugins:{ legend:{ display:false } } }
  });
}

/* ===== 主流程（带锁 & 冷却 & 流式）===== */
async function handleAnalyze(){
  if (isAnalyzing) return;          // ① 请求锁
  const raw = ui.input.value.trim();
  if (!raw) {
    hideProgress();                 // 空输入直接退出
    return;
  }
  isAnalyzing = true;               // ② 加锁
  showProgress();                   // ③ 骨架屏
  try {
    const { content, title } = await fetchContent(raw);
    await analyzeContent(content, title);   // 流式渲染
  } catch (e) {
    console.error(e);
    showSummary('We could not retrieve the page. Please paste text directly.');
    await new Promise(r => setTimeout(r, COOL_DOWN));
  } finally {
    isAnalyzing = false;            // ④ 解锁
    hideProgress();                 // ⑤ 真实内容
  }
}

async function fetchContent(raw){
  if (raw.startsWith('http')){
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(raw)}`);
    if (!res.ok) throw new Error('fetch failed');
    const txt = await res.text();
    return { content: txt.slice(0, 3500), title: raw };
  }
  return { content: raw.slice(0, 3500), title: 'Pasted text' };
}

/* ===== 流式渲染 ===== */
async function analyzeContent(content, title){
  const prompt = buildPrompt(content, title);
  const body   = { model: 'moonshot-v1-8k', messages:[{role:'user', content:prompt}], temperature:0.25, max_tokens:2048, stream: true };

  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const parts = buffer.split('\n');
    buffer = parts.pop(); // 保留不完整行
    for (const chunk of parts) {
      if (chunk.startsWith('data:')) {
        const data = chunk.slice(5).trim();
        if (data === '[DONE]') return; // 结束标记
        try {
          const json = JSON.parse(data);
          const delta = json.choices[0].delta.content;
          if (delta) await renderStream(delta); // 逐句渲染
        } catch (e) {/* 忽略非 JSON 块 */}
      }
    }
  }
}

/* 逐句渲染（先写摘要，可扩展） */
async function renderStream(text){
  ui.summary.textContent += text;
  ui.summary.classList.remove('hidden');
}

/* ===== 核心模板：强制逐句拆分 + 标签 ===== */
function buildPrompt(content, title){
  return `Role: You are "FactLens", a fact-opinion-bias detector.
Output MUST follow the structure below; otherwise the parser will break.

Steps:
1. Summarize the core message in ≤25 words.
2. **Split every sentence**; tag each as `<fact>` or `<opinion>`.  
   For every sentence, prepend `conf:0.XX` (XX=confidence 00-99, no decimals beyond 2).
3. Count bias signals:  
   a) Emotional words: only **attack/derogatory** sentiment (exclude praise, wonder, joy).  
   b) Binary opposition: **hostile labels** (us-vs-them, enemy, evil, traitor, etc.).  
   c) Mind-reading: claims about **motives/intentions** without evidence.  
   d) Logical fallacy: classic types (slippery slope, straw man, ad hominem, etc.).  
   For each category, give **confidence 0-1** and **original snippet**.
4. One actionable publisher tip (verb-first, ≤100 chars).
5. One ≤30-word PR reply (with data/date/source).
6. ≤20-word third-person summary (no "author"/"this article").

Template:
Title: ${title}
Credibility: X/10 (one sentence)

Facts:
1. conf:0.XX <fact>sentence</fact>
…

Opinions:
1. conf:0.XX <opinion>sentence</opinion>
…

Bias:
- Emotional words: N  conf:0.XX  eg: <eg>snippet</eg>
- Binary opposition: N  conf:0.XX  eg: <eg>snippet</eg>
- Mind-reading: N  conf:0.XX  eg: <eg>snippet</eg>
- Logical fallacy: N  conf:0.XX  type:<type>slippery/straw/ad hom</type>  eg: <eg>snippet</eg>
- Overall stance: neutral/leaning/critical X%

Publisher tip:
xxx

PR tip:
xxx

Summary:
xxx

Text:
${content}

Before you generate the above, briefly replay the text in your mind and write down the 3 most likely reader misinterpretations.  
Then output EXACTLY the template above with no extra sections or free text. Do NOT output anything else.`;
}

/* ===== 解析报告（零捕获组，彻底绕过 V8 严格模式）===== */
function parseReport(md){
  const r = { facts:[], opinions:[], bias:{}, summary:'', publisher:'', pr:'', credibility:8 };

  const cred = md.match(/Credibility:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (cred) r.credibility = parseFloat(cred[1]);

  const fBlock = md.match(/Facts:([\s\S]*?)Opinions:/);
  const oBlock = md.match(/Opinions:([\s\S]*?)Bias:/);
  const bBlock = md.match(/Bias:([\s\S]*?)Publisher tip:/);
  const pub    = md.match(/Publisher tip:\s*(.+?)\s*(?:PR tip|$)/);
  const pr     = md.match(/PR tip:\s*(.+?)\s*(?:Summary|$)/);
  const sum    = md.match(/Summary:\s*(.+)/);

  // =====  已修复：改用普通捕获组，避免把 conf 当保留字 =====
  if (fBlock) {
    r.facts = fBlock[1].split('\n')
             .filter(l => l.includes('<fact>'))
             .map(l => {
               const m = l.match(/^ *\d+\.\s*conf:([\d.]+)/);
               const cert = m ? parseFloat(m[1]) : 1;
               const txt  = l.replace(/^ *\d+\.\s*conf:[\d.]+\s*<fact>(.*?)<\/fact>.*/, '$1').trim();
               return { text: txt, cert };
             });
  }
  if (oBlock) {
    r.opinions = oBlock[1].split('\n')
              .filter(l => l.includes('<opinion>'))
              .map(l => {
                const m = l.match(/^ *\d+\.\s*conf:([\d.]+)/);
                const cert = m ? parseFloat(m[1]) : 1;
                const txt  = l.replace(/^ *\d+\.\s*conf:[\d.]+\s*<opinion>(.*?)<\/opinion>.*/, '$1').trim();
                return { text: txt, cert };
              });
  }
  // ===== 修复结束 =====

  if (bBlock) {
    const b = bBlock[1];
    r.bias = {
      emotional : (b.match(/Emotional words:\s*(\d+)/)||[,0])[1],
      binary    : (b.match(/Binary opposition:\s*(\d+)/)||[,0])[1],
      mind      : (b.match(/Mind-reading:\s*(\d+)/)||[,0])[1],
      fallacy   : (b.match(/Logical fallacy:\s*(\d+)/)||[,0])[1],
      stance    : (b.match(/Overall stance:\s*(.+?)\s*(?:\n|$)/)||[, 'neutral 0%'])[1]
    };
  }
  if (pub) r.publisher = pub[1].trim();
  if (pr)  r.pr = pr[1].trim();
  if (sum) r.summary = sum[1].trim();
  return r;
}
