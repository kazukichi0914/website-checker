const addForm = document.getElementById('addForm');
const urlInput = document.getElementById('urlInput');
const titleInput = document.getElementById('titleInput');
const siteList = document.getElementById('siteList');
const emptyMsg = document.getElementById('emptyMsg');
const statusMsg = document.getElementById('statusMsg');
const checkNowBtn = document.getElementById('checkNowBtn');

async function getSites() {
  const { sites } = await chrome.storage.local.get({ sites: [] });
  return sites;
}

async function saveSites(sites) {
  await chrome.storage.local.set({ sites });
}

function formatTime(ts) {
  if (!ts) return '未チェック';
  const d = new Date(ts);
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function render() {
  const sites = await getSites();
  siteList.innerHTML = '';
  emptyMsg.hidden = sites.length > 0;

  sites
    .slice()
    .sort((a, b) => (b.hasUpdate ? 1 : 0) - (a.hasUpdate ? 1 : 0))
    .forEach((site) => {
      const li = document.createElement('li');
      if (site.hasUpdate) li.classList.add('has-update');

      const info = document.createElement('div');
      info.className = 'site-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'site-title';
      titleEl.textContent = site.title || site.url;

      const urlEl = document.createElement('div');
      urlEl.className = 'site-url';
      urlEl.textContent = site.url;

      const metaEl = document.createElement('div');
      metaEl.className = 'site-meta' + (site.error ? ' error' : '');
      metaEl.textContent = site.error
        ? `エラー: ${site.error}`
        : `最終チェック: ${formatTime(site.lastChecked)}`;

      info.appendChild(titleEl);
      info.appendChild(urlEl);
      info.appendChild(metaEl);

      info.addEventListener('click', async () => {
        window.open(site.url, '_blank');
        if (site.hasUpdate) {
          const current = await getSites();
          const target = current.find((s) => s.id === site.id);
          if (target) target.hasUpdate = false;
          await saveSites(current);
          chrome.runtime.sendMessage({ type: 'CHECK_NOW' }).catch(() => {});
          render();
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = '削除';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const current = await getSites();
        await saveSites(current.filter((s) => s.id !== site.id));
        render();
      });

      if (site.hasUpdate) {
        const dot = document.createElement('span');
        dot.className = 'update-dot';
        li.appendChild(dot);
      }

      li.appendChild(info);
      li.appendChild(removeBtn);
      siteList.appendChild(li);
    });

  updateBadgeFromSites(sites);
}

function updateBadgeFromSites(sites) {
  const count = sites.filter((s) => s.hasUpdate).length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = normalizeUrl(urlInput.value.trim());
  if (!url) {
    statusMsg.textContent = '正しいURL(http/https)を入力してください。';
    return;
  }

  const sites = await getSites();
  if (sites.some((s) => s.url === url)) {
    statusMsg.textContent = 'そのURLはすでに登録されています。';
    return;
  }

  sites.push({
    id: crypto.randomUUID(),
    url,
    title: titleInput.value.trim(),
    hash: null,
    lastChecked: null,
    lastUpdated: null,
    hasUpdate: false,
    error: null,
  });

  await saveSites(sites);
  urlInput.value = '';
  titleInput.value = '';
  statusMsg.textContent = '登録しました。';
  render();
});

checkNowBtn.addEventListener('click', async () => {
  checkNowBtn.disabled = true;
  statusMsg.textContent = 'チェック中...';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
    statusMsg.textContent = res && res.updatedCount > 0
      ? `${res.updatedCount}件のサイトが更新されていました。`
      : 'チェックが完了しました(更新はありませんでした)。';
  } catch {
    statusMsg.textContent = 'チェックに失敗しました。';
  } finally {
    checkNowBtn.disabled = false;
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sites) {
    render();
  }
});

render();
