// app.js
const $   = s => document.querySelector(s);
const url = '/api/chat';

let radarChart;
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

ui.btn.addEventListener('click', handleAnalyze);
ui.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); } });

/* 原生自动增高 + 动画 */
const tx = document.getElementById('urlInput');
tx.addEventListener('input', () => {
  tx.style.height = 'auto';
  tx.style.height = tx.scrollHeight + 'px';
});

async function handleAnalyze(){
  const raw = ui.input.value.trim();
  if (!raw) return;
  showProgress();
  try {
    const { content, title } = await fetchContent(raw);
    const report             = await analyzeContent(content, title);
    render(report);
  } catch (e) {
    console.error(e);
    showSummary('We could not retrieve the page. Please paste text directly.');
  }
  hideProgress();
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

async function analyzeContent(content, title){
  const prompt = buildPrompt(content, title);
  const body   = { model: 'moonshot-v1-8k', messages:[{role:'user', content:prompt}], temperature:0.25, max_tokens:2048 };
  const res    = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  const json   = await res.json();
  return parseReport(json.choices[0].message.content);
}

function buildPrompt(content, title){
  return `Role: You are "FactLens", a fact-opinion-bias detector.
Output MUST follow the structure below.

Steps:
1. Summarize the core message in ≤25 words.
2. Split sentences; tag each as <fact> or <opinion>.
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
1. <fact>sentence</fact>
…

Opinions:
1. <opinion>sentence</opinion>
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
${content}`;
}

function parseReport(md){
  const r = { facts:[], opinions:[], bias:{}, summary:'', publisher:'', pr:'', credibility:8 };
  const cred = md.match(/Credibility:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (cred) r.credibility = parseFloat(cred[1]);
  const fBlock = md.match(/Facts:([\s\S]*?)Opinions:/);
  if (fBlock) r.facts = fBlock[1].split('\n').filter(l=>l.includes('<fact>')).map(l=>l.replace(/^\d+\.\s*<fact>(.*)<\/fact>.*/,'$1').trim());
  const oBlock = md.match(/Opinions:([\s\S]*?)Bias:/);
  if (oBlock) r.opinions = oBlock[1].split('\n').filter(l=>l.includes('<opinion>')).map(l=>l.replace(/^\d+\.\s*<opinion>(.*)<\/opinion>.*/,'$1').trim());
  const bBlock = md.match(/Bias:([\s\S]*?)Publisher tip:/);
  if (bBlock){
    const b = bBlock[1];
    r.bias = {
      emotional : (b.match(/Emotional words:\s*(\d+)/)||[,0])[1],
      binary    : (b.match(/Binary opposition:\s*(\d+)/)||[,0])[1],
      mind      : (b.match(/Mind-reading:\s*(\d+)/)||[,0])[1],
      fallacy   : (b.match(/Logical fallacy:\s*(\d+)/)||[,0])[1],
      stance    : (b.match(/Overall stance:\s*(.+?)\s*(?:\n|$)/)||[, 'neutral 0%'])[1]
    };
  }
  const pub = md.match(/Publisher tip:\s*(.+?)\s*(?:PR tip|$)/);
  if (pub) r.publisher = pub[1].trim();
  const pr  = md.match(/PR tip:\s*(.+?)\s*(?:Summary|$)/);
  if (pr) r.pr = pr[1].trim();
  const sum = md.match(/Summary:\s*(.+)/);
  if (sum) r.summary = sum[1].trim();
  return r;
}

function render(r){
  showSummary(r.summary);
  // 1. 四维得分（平滑 Emotional Neutrality）
  const ts = Math.min(10, 0.5 + (r.credibility || 8));
  const fd = Math.min(10, 1.5 + (r.facts.length || 0) * 1.8);
  const ebRaw = (r.bias.emotional + r.bias.binary + r.bias.mind);
  const eb = smoothNeutrality(ebRaw);   // ← 平滑函数
  const cs = Math.min(10, 0.5 + (ts + fd + eb) / 3);
  // 2. 渲染
  drawBars({ transparency: ts, factDensity: fd, emotion: eb, consistency: cs });
  drawRadar([ts, fd, eb, cs]);
  // 3. 其余卡片
  list(ui.fact,    r.facts);
  list(ui.opinion, r.opinions);
  bias(ui.bias,    r.bias);
  ui.pub.textContent = r.publisher;
  ui.pr.textContent  = r.pr;
  ui.fourDim.classList.remove('hidden');
  ui.results.classList.remove('hidden');
}

/* 平滑中性度：0-15 处 → 10-0 分，非线性下降 */
function smoothNeutrality(n){
  if (n <= 2)  return 10 - n * 0.5;        // 0-2 处：9.5-10
  if (n <= 5)  return 9   - (n - 2) * 1.2; // 3-5 处：8.6-5.4
  if (n <= 9)  return 5.4 - (n - 5) * 0.9; // 6-9 处：5-1.2
  return Math.max(0, 1.2 - (n - 9) * 0.15); // ≥10 处：1.2→0
}

function list(ul, arr){
  ul.innerHTML = arr.length ? arr.map(s=>`<li>${s}</li>`).join('') : '<li>None detected</li>';
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
function showProgress(){
  ui.progress.classList.remove('hidden');
  ui.fourDim.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.summary.classList.add('hidden');
}
function hideProgress(){
  ui.progress.classList.add('hidden');
}
