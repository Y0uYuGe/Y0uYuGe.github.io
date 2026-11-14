// 博客正文的增强：代码高亮、mermaid 图、$$ 公式。文章页自己用，导图首页的右侧面板也用。
// 脚本都按需加载：没有代码块就不加载高亮，没有 mermaid 就不加载 mermaid。
const VENDOR = new URL('../vendor/', import.meta.url).href;
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const loaded = new Map();

function load(src, css) {
  const key = src || css;
  if (!loaded.has(key)) loaded.set(key, new Promise((ok, fail) => {
    if (css) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = css;
      document.head.appendChild(l);
      return ok();
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = fail;
    document.head.appendChild(s);
  }));
  return loaded.get(key);
}

async function highlight(root) {
  const blocks = [...root.querySelectorAll('pre code')].filter((c) => !c.classList.contains('language-mermaid'));
  if (!blocks.length) return;
  const hl = VENDOR + 'vditor/dist/js/highlight.js/';
  load(null, hl + 'styles/' + (dark ? 'github-dark' : 'github') + '.min.css');
  await load(hl + 'highlight.min.js');
  for (const b of blocks) {
    const lang = (/language-(\S+)/.exec(b.className) || [])[1];
    if (lang && !window.hljs.getLanguage(lang)) b.className = b.className.replace(/language-\S+/, 'language-plaintext');
    try { window.hljs.highlightElement(b); } catch {}
  }
}

async function mermaidBlocks(root) {
  const blocks = root.querySelectorAll('code.language-mermaid');
  if (!blocks.length) return;
  await load(VENDOR + 'vditor/dist/js/mermaid/mermaid.min.js');
  if (!window.__mmInit) { window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' }); window.__mmInit = true; }
  const nodes = [...blocks].map((code) => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    code.parentElement.replaceWith(div);
    return div;
  });
  window.mermaid.run({ nodes }).catch(() => {});
}

// 只处理 $$…$$ 公式块（行内 $ 和代码、shell 变量太容易撞）
async function math(root) {
  if (!root.textContent.includes('$$')) return;
  const k = VENDOR + 'vditor/dist/js/katex/';
  load(null, k + 'katex.min.css');
  await load(k + 'katex.min.js');
  for (const el of root.querySelectorAll('p, li, td')) {
    if (!el.textContent.includes('$$') || el.closest('pre, code')) continue;
    el.innerHTML = el.innerHTML.replace(/\$\$([\s\S]+?)\$\$/g, (all, tex) => {
      try {
        const t = document.createElement('textarea');
        t.innerHTML = tex.replace(/<br\s*\/?>/g, '\n');
        return window.katex.renderToString(t.value, { displayMode: true, throwOnError: false });
      } catch { return all; }
    });
  }
}

export function enhance(root) {
  if (!root) return;
  for (const a of root.querySelectorAll('a[href^="http"]')) a.target = '_blank';
  highlight(root).catch(() => {});
  mermaidBlocks(root).catch(() => {});
  math(root).catch(() => {});
}

// 文章页：增强正文；滚动时目录里高亮当前小节
if (document.body?.dataset.page === 'article') {
  enhance(document.querySelector('.post-body'));
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length) {
    const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const onScroll = () => {
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < 90) cur = h;
      links.forEach((a) => a.classList.toggle('on', a.hash.slice(1) === cur?.id));
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}
