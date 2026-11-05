(() => {
  'use strict';
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const toggle = document.querySelector('.menu-toggle');
  const links = document.getElementById('navLinks');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const dropdowns = Array.from(document.querySelectorAll('.nav-members')).map(nav => ({
    nav, button: nav.querySelector('.member-nav-toggle'),
    submenu: nav.querySelector('.member-submenu'), anchor: nav.querySelector('a'),
    label: nav.classList.contains('nav-publications') ? '研究成果' : nav.classList.contains('nav-news') ? '最新消息' : '成員'
  }));
  function setDropdownOpen(item, open) {
    item.nav.classList.toggle('submenu-open', open);
    item.button?.setAttribute('aria-expanded', String(open));
    item.button?.setAttribute('aria-label', (open ? '收合' : '展開') + item.label + '選單');
  }
  function closeDropdowns(except) {
    dropdowns.forEach(item => { if (item !== except) setDropdownOpen(item, false); });
  }
  function setMenuOpen(open) {
    links?.classList.toggle('open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
    if (!open) closeDropdowns();
  }
  if (toggle && links) {
    toggle.addEventListener('click', () => setMenuOpen(!links.classList.contains('open')));
    links.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
  }
  dropdowns.forEach(item => {
    if (!item.button || !item.submenu) return;
    const open = () => { closeDropdowns(item); setDropdownOpen(item, true); };
    item.button.addEventListener('click', () => {
      const next = !item.nav.classList.contains('submenu-open');
      closeDropdowns(item); setDropdownOpen(item, next);
    });
    item.nav.addEventListener('mouseenter', () => { if (hoverPointer.matches) open(); });
    item.nav.addEventListener('mouseleave', () => {
      if (hoverPointer.matches && !item.nav.contains(document.activeElement)) setDropdownOpen(item, false);
    });
    item.nav.addEventListener('focusin', event => { if (event.target === item.anchor) open(); });
    item.nav.addEventListener('focusout', event => {
      if (!item.nav.contains(event.relatedTarget)) setDropdownOpen(item, false);
    });
    item.nav.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && (event.target === item.anchor || event.target === item.button)) {
        event.preventDefault(); open(); item.submenu.querySelector('a')?.focus();
      }
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.site-header')) setMenuOpen(false);
    else closeDropdowns(dropdowns.find(item => item.nav.contains(event.target)));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const mobileOpen = links?.classList.contains('open');
    const active = dropdowns.find(item => item.nav.classList.contains('submenu-open'));
    if (!mobileOpen && !active) return;
    setMenuOpen(false);
    if (mobileOpen) toggle?.focus(); else active?.button?.focus();
  });

  const industryResults = document.getElementById('industry-results');
  const academicResearch = document.getElementById('academic-research');
  if (industryResults && academicResearch) {
    function showResearchCategory() {
      const academic = window.location.hash === '#academic-research';
      industryResults.hidden = academic;
      academicResearch.hidden = !academic;
    }
    window.addEventListener('hashchange', showResearchCategory);
    showResearchCategory();
  }

  const currentMembers = document.getElementById('current-members');
  const alumniMembers = document.getElementById('alumni-members');
  if (currentMembers && alumniMembers) {
    function showMemberCategory() {
      const alumni = window.location.hash === '#alumni-members';
      currentMembers.classList.toggle('is-hidden', alumni);
      alumniMembers.classList.toggle('is-visible', alumni);
    }
    window.addEventListener('hashchange', showMemberCategory);
    showMemberCategory();
  }

  // 桌機與手機共用：向下捲動後顯示固定於視窗右下角的回到頁首按鈕。
  document.querySelector('.back-to-top-bar')?.remove();
  document.querySelector('.back-to-top')?.remove();

  const button = document.createElement('button');
  button.className = 'back-to-top';
  button.type = 'button';
  button.setAttribute('aria-label', '回到頁首');
  button.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M5 15l7-7 7 7"></path>
    </svg>`;
document.body.append(button);
const syncBackToTop = () => {
  const visible = window.scrollY > 320;
  button.classList.toggle('is-visible', visible);
  button.tabIndex = visible ? 0 : -1;
};
let backToTopTicking = false;
const requestBackToTopSync = () => {
  if (backToTopTicking) return;
  backToTopTicking = true;
  window.requestAnimationFrame(() => {
    syncBackToTop();
    backToTopTicking = false;
  });
};
button.addEventListener('click', () => {
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  window.scrollTo({
    top: 0,
    behavior: reduceMotion ? 'auto' : 'smooth'
  });
  button.blur();
});
window.addEventListener('scroll', requestBackToTopSync, {
  passive: true
});
requestBackToTopSync();

  // 原本 HTML 的 assets 圖片保持相同檔名；副檔名更換時自動嘗試其他格式。
  const refreshAssetImages = () => {
    document.querySelectorAll('img[src]').forEach(image => {
      const original = new URL(image.getAttribute('src'), window.location.href);
      if (original.origin !== window.location.origin || !/\/assets\/.*\.(png|jpe?g|webp|avif)$/i.test(original.pathname)) return;
      const stem = original.pathname.replace(/\.(png|jpe?g|webp|avif)$/i, '');
      const paths = [original.pathname, ...['png','jpg','jpeg','webp','avif'].map(ext => `${stem}.${ext}`)].filter((p,i,all)=>all.indexOf(p)===i);
      let next = 0;
      const tryNext = () => {
        if (next >= paths.length) return;
        const url = new URL(original);
        url.pathname = paths[next++];
        image.src = url.href;
      };
      image.addEventListener('error', tryNext);
      tryNext();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshAssetImages, {once:true});
  else refreshAssetImages();
})();
