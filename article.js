(() => {
  'use strict';
  const status = document.getElementById('article-status');
  const detail = document.getElementById('article-detail');
  if (!status || !detail || !window.STM302Data) return;

  const text = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value ?? '');
  };
  const addTextWithBreaks = (node, value) => {
    String(value).split(/\r?\n/).forEach((line, index) => {
      if (index) node.append(document.createElement('br'));
      node.append(document.createTextNode(line));
    });
  };
  const imagePath = value => {
    if (!value) return '';
    if (/^(?:https?:)?\/\//i.test(value) || value.startsWith('assets/')) return value;
    return `assets/${value}`;
  };
  const renderBody = raw => {
    const body = document.getElementById('article-body');
    const fragment = document.createDocumentFragment();
    String(raw || '').replace(/^\uFEFF/,'').split(/\r?\n\s*\r?\n/).map(v => v.trim()).filter(Boolean).forEach(block => {
      if (/^##\s+/.test(block)) {
        const heading = document.createElement('h2');
        heading.textContent = block.replace(/^##\s+/, '');
        fragment.append(heading);
        return;
      }
      const lines = block.split(/\r?\n/);
      if (lines.every(line => /^[-•]\s*/.test(line))) {
        const list = document.createElement('ul');
        lines.forEach(line => {
          const item = document.createElement('li');
          item.textContent = line.replace(/^[-•]\s*/, '');
          list.append(item);
        });
        fragment.append(list);
        return;
      }
      const paragraph = document.createElement('p');
      addTextWithBreaks(paragraph, block);
      fragment.append(paragraph);
    });
    if (!fragment.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'content-empty';
      empty.textContent = '此文章尚未填寫內容。';
      fragment.append(empty);
    }
    body.replaceChildren(fragment);
  };
  const loadImage = (value, alt) => {
    const figure = document.getElementById('article-figure');
    const image = document.getElementById('article-image');
    const path = imagePath(value);
    if (!path) return;
    const candidates = window.STM302Data.imageCandidates(path);
    let next = 0;
    image.alt = alt || '';
    image.addEventListener('load', () => { figure.hidden = false; }, {once:true});
    image.addEventListener('error', () => {
      if (next < candidates.length) image.src = candidates[next++];
      else figure.hidden = true;
    });
    image.src = candidates[next++];
  };

  async function load() {
    try {
      const id = new URLSearchParams(window.location.search).get('id')?.trim();
      if (!id) throw new Error('網址缺少文章編號。');
      const [perspectives, media, articles] = await Promise.all([
        window.STM302Data.fetchKind('news-perspectives','news-perspectives.json'),
        window.STM302Data.fetchKind('news-media','news-media.json'),
        window.STM302Data.fetchKind('news-articles','news-articles.json').catch(() => [])
      ]);
      const perspective = perspectives.find(row => row.id === id || row.article_id === id);
      const mediaRow = media.find(row => row.id === id || row.article_id === id);
      const row = perspective || mediaRow;
      if (!row) throw new Error('找不到這篇文章，可能已下架或編號已變更。');
      const article = articles.find(item => item.id === (row.article_id || row.id));
      text('article-category', row.category);
      text('article-date', row.date.replaceAll('-', '.'));
      const time = document.getElementById('article-date');
      if (time) time.dateTime = row.date;
      text('article-title', row.title);
      document.title = `${row.title}｜STM302 永續科技管理研究室`;
      const back = document.getElementById('article-back');
      back.href = perspective ? 'news.html' : 'news-media.html';
      back.textContent = perspective ? '← 返回觀點資訊' : '← 返回媒體報導';
      renderBody(article?.content || row.paragraphs.join('\n\n'));
      loadImage(article?.image || row.image, row.image_alt || row.title);
      status.hidden = true;
      detail.hidden = false;
    } catch (error) {
      status.hidden = false;
      status.classList.add('content-error');
      status.textContent = `文章無法載入：${error.message}`;
    }
  }
  load();
})();
