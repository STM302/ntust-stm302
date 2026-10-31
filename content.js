/* Google Sheets CSV 來源。只有讀取功能，不含帳號、API Key 或寫入權限。 */
(() => {
  'use strict';
  const schema = {
    'alumni-members': ['姓名','學位','論文題目','研究所','畢業年份','年份註記','顯示'],
    publications: ['文獻標題','年份','類別','作者','期刊或會議','補充資訊','索引','顯示'],
    'news-perspectives': ['編號','日期','類別','標題','內文','圖片說明','連結文字','連結網址','顯示'],
    'news-media': ['編號','日期','類別','標題','內文','圖片說明','連結文字','連結網址','顯示'],
    news: ['編號','日期','類別','標題','內文','圖片說明','連結文字','連結網址','顯示']
  };
  const extensions = ['png','jpg','jpeg','webp','avif'];
  let configPromise;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  async function request(url, format, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {cache:'no-store', credentials:'omit', signal:controller.signal});
      check(response.ok, `HTTP ${response.status}：${url}`);
      return await (format === 'json' ? response.json() : response.text());
    } finally { clearTimeout(timer); }
  }
  function csv(text) {
    check(!/^\s*</.test(text), '收到網頁而非 CSV，請使用「發布到網路」的 CSV 連結。');
    const rows = [], row = [];
    let field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    const cell = () => { row.push(field); field = ''; closed = false; };
    const line = () => { cell(); rows.push(row.splice(0)); };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else field += c;
      } else if (c === '"') {
        check(!field && !closed, 'CSV 引號格式錯誤。'); quoted = true;
      } else if (c === ',') cell();
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; line(); }
      else { check(!closed, 'CSV 引號後有多餘內容。'); field += c; }
    }
    check(!quoted, 'CSV 引號未關閉。');
    if (field || row.length || closed) line();
    return rows;
  }
  function parse(text, kind) {
    const rows = csv(text), header = rows.shift()?.map(value => value.trim()) || [];
    check(new Set(header).size === header.length, '工作表有重複欄位名稱。');
    schema[kind].forEach(name => check(header.includes(name), `工作表缺少「${name}」欄位。`));
    const mapped = [];
    rows.forEach((values, i) => {
      if (values.every(v => !v.trim())) return;
      check(values.length <= header.length, `第 ${i+2} 列欄位數量錯誤。`);
      const row = Object.fromEntries(header.map((name,j) => [name,(values[j]||'').trim()]));
      const show = row['顯示'].toLowerCase();
      check(['','是','否','true','false','1','0'].includes(show), `第 ${i+2} 列「顯示」請填是或否。`);
      if (['否','false','0'].includes(show)) return;
      const year = name => {
        const v = row[name];
        if (!v) return null;
        check(/^\d{4}$/.test(v) && +v >= 1900 && +v <= 2200, `第 ${i+2} 列「${name}」請填四位數年份；共同指導請填在年份註記。`);
        return +v;
      };
      if (kind === 'alumni-members') mapped.push({name:row['姓名'],degree:row['學位'],thesis:row['論文題目'],institute:row['研究所'],graduation_year:year('畢業年份'),year_note:row['年份註記']});
      if (kind === 'publications') mapped.push({
        title:row['文獻標題'],year:year('年份'),type:row['類別'],
        authors:row['作者'].split(/[;；\n]+/).map(v=>v.trim()).filter(Boolean),
        venue:row['期刊或會議'],detail:row['補充資訊'],annual_index:row['索引']||'',
        url:row['文獻連結']||'',link_status:row['連結查核狀態']||'待查證',
        quartile:row['JCR分區']||'',category:row['學科分類']||'',
        grade_source:row['等級來源']||'',jcr_status:row['JCR查核狀態']||'待查證',
        sjr_year:header.includes('SJR資料年度')?year('SJR資料年度'):null,
        sjr_value:row['SJR指標']||'',sjr_quartile:row['SJR分區']||'',
        sjr_category:row['SJR學科分類']||'',sjr_source:row['SJR來源']||'',
        sjr_status:row['SJR查核狀態']||'待查證',grade_note:row['分區查核備註']||''
      });
      if (['news','news-perspectives','news-media'].includes(kind)) {
        check(/^[a-zA-Z0-9_-]+$/.test(row['編號']), `第 ${i+2} 列「編號」只能含英文字母、數字、-、_。`);
        check(!mapped.some(r=>r.id===row['編號']), `消息編號 ${row['編號']} 重複。`);
        check(!row['連結文字'] || Boolean(row['連結網址']), `第 ${i+2} 列有連結文字時，請一起填寫連結網址。`);
        mapped.push({id:row['編號'],date:row['日期'],category:row['類別'],title:row['標題'],paragraphs:row['內文'].split(/\r?\n\s*\r?\n/).filter(Boolean),image:`assets/${row['編號']}.png`,image_auto:true,image_alt:row['圖片說明'],...(row['連結網址']?{link:{url:row['連結網址'],text:row['連結文字']||row['標題']}}:{})});
      }
    });
    if (kind === 'publications') {
      const seen = new Set();
      return mapped.sort((a,b)=>(b.year??0)-(a.year??0)).filter(row=>{
        const key=row.title.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
        if(seen.has(key)) return false;
        seen.add(key); return true;
      });
    }
    return mapped;
  }
  function publishedURL(value) {
    const url = new URL(value);
    check(url.protocol === 'https:' && url.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/e\/[^/]+\/pub$/.test(url.pathname) && url.searchParams.get('output') === 'csv' && /^\d+$/.test(url.searchParams.get('gid') || ''), '請填各工作表發布後的 CSV 網址，網址應包含 output=csv 與 gid。');
    return url.href;
  }
  function config() {
    return configPromise ||= request('site-config.json','json',4000).catch(error => {
      console.warn('STM302 設定無法讀取，使用原有 JSON。',error); return {};
    });
  }
  async function load(root, render) {
    const kind=root.dataset.content;
    check(window.location.protocol !== 'file:', '此為線上版，請透過網站網址或 VS Code Live Server 開啟。');
    const settings=schema[kind] ? await config() : {};
    const source=settings.sources?.[kind];
    if (source?.csv_url) {
      try {
        const data=parse(await request(publishedURL(source.csv_url),'text'),kind);
        render(data);
        root.dataset.loadedFrom='google-sheets';
        return;
      } catch(error) {
        console.warn(`STM302 ${kind} 試算表讀取失敗，使用 JSON 備份。`,error);
        root.dataset.syncError=error.message;
      }
    }
    render(await request(root.dataset.source,'json',4000));
    root.dataset.loadedFrom='json';
  }
  function imageCandidates(path) {
    const url=new URL(path,window.location.href);
    if(url.origin!==window.location.origin || !/\/assets\//.test(url.pathname)) return [path];
    const stem=url.pathname.replace(/\.(png|jpe?g|webp|avif)$/i,'');
    return [url.pathname,...extensions.map(ext=>`${stem}.${ext}`)].filter((v,i,all)=>all.indexOf(v)===i).map(p=>{
      const candidate=new URL(url); candidate.pathname=p;
      if (candidate.protocol === 'file:') candidate.search='';
      else candidate.searchParams.set('imgv',String(Date.now()));
      return candidate.href;
    });
  }
  // 將已知出版社的 DOI 轉為 HTML 文獻頁；原試算表網址不變。
  function documentPageURL(value) {
    try {
      const url = new URL(value);
      if (url.hostname !== 'doi.org' || !['http:', 'https:'].includes(url.protocol)) return value;
      const doi = decodeURIComponent(url.pathname.slice(1));
      if (/^10\.1080\/[a-z0-9.]+$/i.test(doi)) return 'https://www.tandfonline.com/doi/abs/' + doi;
      if (/^10\.1049\/rpg2\.\d+$/i.test(doi)) return 'https://ietresearch.onlinelibrary.wiley.com/doi/abs/' + doi;
      if (/^10\.23055\/ijietap\.\d{4}\.\d+\.\d+\.\d+$/i.test(doi)) return 'https://ijietap.com/index.php/ijie/article/view/' + doi.split('.').pop();
      const mdpi = doi.match(/^10\.3390\/(su|pr)(\d{1,2})(\d{2})(\d{4})$/i);
      if (mdpi) return 'https://www.mdpi.com/' + (mdpi[1].toLowerCase() === 'su' ? '2071-1050' : '2227-9717') + '/' + Number(mdpi[2]) + '/' + Number(mdpi[3]) + '/' + Number(mdpi[4]);
      if (/^10\.4028\/www\.scientific\.net\/AMM\.\d+\.\d+$/i.test(doi)) return 'https://www.scientific.net/' + doi.split('/').pop();
      return value;
    } catch { return value; }
  }
  function isDocumentPage(value) {
    if (!value) return false;
    try {
      const url=new URL(documentPageURL(value));
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return false;
      const decoded=decodeURIComponent(url.href).toLowerCase();
      if (/\.pdf\b|\/pdf(?:\/|\b)|pdfft|delivery\.cfm|\/stamp\/|format=pdf|type=pdf|download=/.test(decoded)) return false;
      if (url.hostname==='scholar.google.com') return url.pathname==='/citations' && url.searchParams.get('view_op')==='view_citation' && Boolean(url.searchParams.get('citation_for_view'));
      if (url.hostname==='www.sciencedirect.com') return /^\/science\/article\/(?:abs\/)?pii\/[a-z0-9]+\/?$/i.test(url.pathname);
      if (url.hostname==='ieeexplore.ieee.org') return /^\/(?:abstract\/)?document\/\d+\/?$/.test(url.pathname);
      if (url.hostname==='papers.ssrn.com') return url.pathname==='/sol3/papers.cfm' && /^\d+$/.test(url.searchParams.get('abstract_id')||'');
      if (url.hostname==='link.springer.com') return /^\/(?:article|chapter)\//.test(url.pathname);
      if (url.hostname==='onlinelibrary.wiley.com') return /^\/doi\/(?:abs\/|full\/)?10\./.test(url.pathname);
      if (url.hostname === 'www.tandfonline.com') return /^\/doi\/(?:abs\/|full\/)?10\.1080\/[a-z0-9.]+$/i.test(url.pathname);
      if (url.hostname === 'ietresearch.onlinelibrary.wiley.com') return /^\/doi\/(?:abs\/|full\/)?10\.1049\/[a-z0-9.]+$/i.test(url.pathname);
      if (url.hostname === 'www.mdpi.com') return /^\/\d{4}-\d{4}\/\d+\/\d+\/\d+\/?$/.test(url.pathname);
      if (url.hostname === 'www.emerald.com') return /^\/jhtt\/article\/doi\/10\.1108\/[a-z0-9-]+\/\d+$/i.test(url.pathname);
      if (url.hostname === 'www.cetjournal.it') return /^\/index.php\/cet\/article\/view\/\d+$/.test(url.pathname);
      if (url.hostname === 'ijietap.com') return /^\/index.php\/ijie\/article\/view\/\d+$/.test(url.pathname);
      if (url.hostname === 'www.proquest.com') return /^\/docview\/\d+$/.test(url.pathname);
      if (url.hostname === 'www.nature.com') return /^\/articles\/[a-z0-9.-]+$/i.test(url.pathname);
      if (url.hostname === 'research.ebsco.com') return /^\/c\/[a-z0-9]+\/search\/details\/[a-z0-9]+\/related-items$/i.test(url.pathname);
      if (url.hostname === 'www.scientific.net') return /^\/AMM\.\d+\.\d+$/.test(url.pathname);
      return false; // DOI 可能轉向 PDF，未確認的其他網址暫不直接提供連結。
    } catch { return false; }
  }
  function isNonPdfSource(value) {
    if (!value) return false;
    try {
      const url=new URL(value);
      if (!['http:','https:'].includes(url.protocol) || /\.pdf\b|\/pdf(?:\/|\b)|pdfft|delivery\.cfm|\/stamp\/|format=pdf|type=pdf|download/i.test(decodeURIComponent(url.href))) return false;
      if (isDocumentPage(value)) return true;
      return ['clarivate.com','www.clarivate.com','jcr.clarivate.com','jcr.help.clarivate.com','clarivate.libguides.com','journalcitationreports.zendesk.com'].includes(url.hostname);
    } catch { return false; }
  }
  window.STM302Data={load,parse,publishedURL,imageCandidates,isDocumentPage,isNonPdfSource,documentPageURL};
})();

/* 研究成果、畢業論文、消息優先讀取試算表，原 JSON 作為備份。 */
(() => {
  'use strict';
  function setup(root) {
    const status = root.querySelector('.content-status');
    const list = document.getElementById(root.dataset.target || 'content-list');
    const text = value => String(value ?? '');
    function element(tag, className, value) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = text(value);
      return node;
    }
    function requireValue(condition, message) {
      if (!condition) throw new Error(message);
    }
    const isString = value => typeof value === 'string';
    const validYear = year => year == null || (Number.isInteger(year) && year >= 1900 && year <= 2200);
    function optionalStrings(row, fields, label) {
      fields.forEach(field => requireValue(row[field] == null || isString(row[field]), `${label}：${field} 必須為文字。`));
    }
    function safeURL(value, image = false) {
      if (!value) return '';
      const url = new URL(value, window.location.href);
      const allowed = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
      const localImage = image && window.location.protocol === 'file:' && url.protocol === 'file:' && url.href.startsWith(new URL('assets/', window.location.href).href);
      requireValue(allowed.includes(url.protocol) || localImage, '連結必須為 http、https 或電子郵件網址；離線圖片須位於 assets 資料夾。');
      return value;
    }
    function photo(path, name) {
      const placeholder = () => {
        const node = element('div', 'member-photo-placeholder', '照片位置');
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', `${name}的照片預留位置`);
        return node;
      };
      const image = element('img', 'member-photo');
      const key = name.trim().split(/\s+/).at(-1);
      const paths = [
        ...window.STM302Data.imageCandidates(`assets/member-${encodeURIComponent(key)}.png`),
        ...(path ? window.STM302Data.imageCandidates(safeURL(path, true)) : [])
      ];
      let next = 0;
      image.src = paths[next++];
      image.alt = `${name}的照片`;
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        if (next < paths.length) image.src = paths[next++];
        else image.replaceWith(placeholder());
      });
      return image;
    }
    const collator = new Intl.Collator('zh-Hant', { numeric: true });
    function orderedGroups(rows, getKey) {
      const groups = new Map();
      rows.forEach(row => {
        const key = getKey(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      return groups;
    }
    function isProfessor(name) {
      const normalized = name.normalize('NFKC').toLowerCase().replace(/[^a-z]/g, '');
      return /^(tckuo|kuotc|tsaichikuo|kuotsaichi|kuotsaic|kuotsai)$/.test(normalized);
    }
    function publications(rows) {
      requireValue(Array.isArray(rows), '研究成果必須為陣列。');
      rows.forEach((row, i) => {
        const label = `研究成果第 ${i + 1} 筆`;
        requireValue(row && isString(row.title) && row.title.trim(), `${label}：請填寫 title。`);
        requireValue(validYear(row.year), `${label}：year 必須為年份數字，缺漏時填 null。`);
        requireValue(isString(row.type) && row.type.trim(), `${label}：請填寫 type。`);
        requireValue(Array.isArray(row.authors) && row.authors.every(isString), `${label}：authors 必須是姓名文字的陣列。`);
        optionalStrings(row, ['venue', 'detail', 'url', 'link_status', 'annual_index', 'quartile', 'category', 'grade_source', 'jcr_status'], label);
        for (const field of ['url','grade_source']) {
          if (row[field]) requireValue(['https:','http:'].includes(new URL(row[field],window.location.href).protocol), `${label}：${field} 必須為 HTTP(S) 連結。`);
        }
      });
      const sorted = [...rows].sort((a, b) =>
        (b.year ?? 0) - (a.year ?? 0) || collator.compare(a.type, b.type) || collator.compare(a.title, b.title));
      const fragment = document.createDocumentFragment();
      for (const entries of orderedGroups(sorted, row => row.year == null ? 'unknown' : `${row.year}|${row.type}`).values()) {
        const first = entries[0];
        const section = element('section', 'publication-type');
        const typeLabel = first.type === '待核對項目' ? '其他研究成果' : first.type;
        section.append(element('h2', 'publication-group-heading', first.year == null ? '年份未提供' : `${first.year} · ${typeLabel}`));
        const ol = element('ol', 'publication-list');
        entries.forEach(row => {
          const li = element('li');
          li.append(element('span', 'publication-title', row.title));
          const authors = element('span', 'publication-authors');
          row.authors.forEach((name, i) => {
            if (i) authors.append(document.createTextNode('; '));
            authors.append(isProfessor(name) ? element('strong', 'author-kuo', name) : document.createTextNode(name));
          });
          li.append(authors);
          const venueLine = element('span', 'publication-venue');
          if (row.venue) venueLine.append(document.createTextNode(`（${row.venue}）`));
          if (row.type === 'Journal articles' || row.type === '待核對項目') {
            const indexVerified = Boolean(row.annual_index?.trim());
            const quartileKnown = /^Q[1-4]$/.test(row.quartile || '');
            // 收錄別與 JCR 分區皆由人工維護；非空白索引及有效 Q 值直接顯示。
            const quartileVerified = quartileKnown;
            const labels = [];
            if (indexVerified) labels.push(`（${row.annual_index}）`);
            if (quartileVerified) labels.push(`（${row.quartile}）`);
            if (labels.length) venueLine.append(element('span', 'publication-metrics', labels.join('')));
          }
          if (window.STM302Data.isDocumentPage(row.url)) {
            if (row.venue) venueLine.append(document.createTextNode(' '));
            const link = element('a', 'publication-source', '連結');
            link.href = safeURL(window.STM302Data.documentPageURL(row.url));
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            venueLine.append(link);
          }
          if (row.venue || venueLine.children.length) li.append(venueLine);
          if (row.detail) li.append(element('span', 'publication-venue', row.detail));
          ol.append(li);
        });
        section.append(ol);
        fragment.append(section);
      }
      if (!rows.length) fragment.append(element('p', 'content-empty', '目前尚無研究成果。'));
      list.replaceChildren(fragment);
    }
    function industryResults(rows) {
      requireValue(Array.isArray(rows), '產學成果必須為陣列。');
      const fragment = document.createDocumentFragment();
      const cards = element('div', 'service-grid industry-guidance-grid');
      rows.forEach((row, i) => {
        requireValue(row && isString(row.title) && row.title.trim(), `產學成果第 ${i + 1} 筆：請填寫 title。`);
        requireValue(validYear(row.year), '產學成果 year 必須為年份數字或 null。');
        optionalStrings(row, ['partner', 'description'], '產學成果');
        const article = element('article', 'industry-guidance-card');
        article.append(element('h4', '', row.title));
        if (row.year != null) article.append(element('p', '', String(row.year)));
        if (row.partner) article.append(element('p', '', row.partner));
        if (row.description) {
          const details = element('ul');
          details.append(element('li', '', row.description));
          article.append(details);
        }
        cards.append(article);
      });
      if (rows.length) fragment.append(cards);
      if (!rows.length) fragment.append(element('p', 'content-empty', '目前尚無產學成果。'));
      list.replaceChildren(fragment);
    }
    function currentMembers(data) {
      requireValue(data && Array.isArray(data.group_order) && data.group_order.every(isString), 'group_order 必須是分類文字陣列。');
      requireValue(Array.isArray(data.members), 'members 必須為成員陣列。');
      data.members.forEach((row, i) => {
        const label = `成員第 ${i + 1} 筆`;
        requireValue(row && isString(row.name) && row.name.trim(), `${label}：請填寫 name。`);
        requireValue(isString(row.group) && row.group.trim(), `${label}：請填寫 group。`);
        optionalStrings(row, ['photo', 'motto'], label);
        if (row.photo) safeURL(row.photo, true);
      });
      const current = data.members;
      const groups = [...new Set([...data.group_order, ...current.map(row => row.group)])];
      const currentFragment = document.createDocumentFragment();
      groups.forEach(group => {
        const entries = current.filter(row => row.group === group);
        if (!entries.length) return;
        const section = element('section', 'member-level');
        section.append(element('h3', '', group));
        const grid = element('div', 'member-card-grid');
        entries.forEach(row => {
          const card = element('article', 'member-card');
          const info = element('div', 'member-info');
          info.append(element('h4', '', row.name));
          if (row.motto) info.append(element('p', 'member-motto', row.motto));
          card.append(photo(row.photo, row.name), info);
          grid.append(card);
        });
        section.append(grid);
        currentFragment.append(section);
      });
      if (!current.length) currentFragment.append(element('p', 'content-empty', '主要成員名單待補。'));
      list.replaceChildren(currentFragment);
    }
    function alumniMembers(rows) {
      requireValue(Array.isArray(rows), '畢業成員必須為陣列。');
      rows.forEach((row, i) => {
        const label = `畢業成員第 ${i + 1} 筆`;
        requireValue(row && isString(row.name) && row.name.trim(), `${label}：請填寫 name。`);
        requireValue(validYear(row.graduation_year), `${label}：graduation_year 必須為數字或 null。`);
        optionalStrings(row, ['thesis', 'institute', 'degree', 'year_note'], label);
      });
      const alumni = [...rows].sort((a, b) => (b.graduation_year ?? 0) - (a.graduation_year ?? 0));
      const alumniFragment = document.createDocumentFragment();
      if (alumni.length) {
        const ol = element('ol', 'publication-list alumni-list');
        alumni.forEach(row => {
          const li = element('li');
          li.append(element('span', 'alumni-name', row.name));
          const details = [row.thesis ? `${row.degree || ''}論文題目：${row.thesis}` : '', row.institute, `${row.graduation_year ?? '年份未提供'}${row.year_note ? `（${row.year_note}）` : ''}`].filter(value => value !== '' && value != null);
          li.append(document.createTextNode(`，${details.join('，')}`));
          ol.append(li);
        });
        alumniFragment.append(ol);
      }
      if (!alumni.length) alumniFragment.append(element('p', 'alumni-placeholder', '畢業成員名單待補'));
      list.replaceChildren(alumniFragment);
    }
    function news(rows) {
      requireValue(Array.isArray(rows), '最新消息必須為陣列。');
      rows.forEach((row, i) => {
        const label = `消息第 ${i + 1} 筆`;
        requireValue(row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && !Number.isNaN(Date.parse(row.date)) && new Date(row.date).toISOString().slice(0, 10) === row.date, `${label}：date 請填有效的 YYYY-MM-DD 日期。`);
        requireValue(isString(row.title) && row.title.trim(), `${label}：請填寫 title。`);
        requireValue(isString(row.category), `${label}：category 必須為文字。`);
        requireValue(Array.isArray(row.paragraphs) && row.paragraphs.every(isString), `${label}：paragraphs 必須為段落文字陣列。`);
        optionalStrings(row, ['image', 'image_alt'], label);
        if (row.image) safeURL(row.image, true);
        if (row.link) {
          requireValue(isString(row.link.url) && isString(row.link.text), `${label}：link 請填 url 和 text。`);
          safeURL(row.link.url);
        }
      });
      const fragment = document.createDocumentFragment();
      [...rows].sort((a, b) => b.date.localeCompare(a.date)).forEach(row => {
        const article = element('article');
        const time = element('time', '', row.date.replaceAll('-', '.'));
        time.dateTime = row.date;
        const content = element('div');
        const heading = element('h2');
        if (row.link) {
          const link = element('a', 'news-title-link', row.title);
          link.href = safeURL(row.link.url);
          heading.append(link);
        } else heading.textContent = row.title;
        content.append(element('span', 'category', row.category), heading);
        row.paragraphs.forEach(paragraph => content.append(element('p', '', paragraph)));
        if (row.image) {
          const image = element('img', 'news-image');
          const paths = window.STM302Data.imageCandidates(safeURL(row.image, true));
          let next = 0;
          image.hidden = true;
          image.addEventListener('load', () => { image.hidden = false; });
          image.addEventListener('error', () => {
            if (next < paths.length) image.src = paths[next++];
            else image.remove();
          });
          image.src = paths[next++];
          image.alt = row.image_alt || row.title;
          image.loading = 'lazy';
          content.append(image);
        }
        article.append(time, content);
        fragment.append(article);
      });
      if (!rows.length) fragment.append(element('p', 'content-empty', root.dataset.content === 'news-perspectives' ? '目前尚無觀點資訊。' : root.dataset.content === 'news-media' ? '目前尚無媒體報導。' : '目前尚無最新消息。'));
      list.replaceChildren(fragment);
    }
    async function load() {
      try {
        const render = { 'industry-results': industryResults, publications, 'current-members': currentMembers, 'alumni-members': alumniMembers, news, 'news-perspectives': news, 'news-media': news }[root.dataset.content];
        requireValue(render, '此頁的內容類型未設定。');
        await window.STM302Data.load(root, render);
        status.hidden = true;
      } catch (error) {
        status.hidden = false;
        status.classList.add('content-error');
        status.textContent = `內容無法載入：${error.message}`;
      } finally {
        root.setAttribute('aria-busy', 'false');
      }
    }
    return load();
  }
  window.siteContentReady = Promise.all(Array.from(document.querySelectorAll('[data-content]'), setup));
})();
