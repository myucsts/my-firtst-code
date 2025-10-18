(() => {
  const form = document.getElementById("settings-form");
  const ownerInput = document.getElementById("owner-input");
  const repoInput = document.getElementById("repo-input");
  const stateSelect = document.getElementById("state-select");
  const labelsInput = document.getElementById("labels-input");
  const sortSelect = document.getElementById("sort-select");
  const directionSelect = document.getElementById("direction-select");
  const perPageInput = document.getElementById("per-page-input");
  const tokenInput = document.getElementById("token-input");
  const clearTokenButton = document.getElementById("clear-token-button");
  const issuesList = document.getElementById("issues-list");
  const loadMoreButton = document.getElementById("load-more-button");
  const statusMessage = document.getElementById("status-message");
  const searchInput = document.getElementById("search-input");

  const storageKey = "gh-issues-board-settings";
  const tokenStorageKey = "gh-issues-board-token";

  let currentPage = 1;
  let hasMore = false;
  let activeRequest = null;
  let lastParamsHash = "";
  let issuesCache = [];

  init();

  function init() {
    restoreSettings();
    form.addEventListener("submit", handleSubmit);
    loadMoreButton.addEventListener("click", () => loadIssues({ reset: false }));
    clearTokenButton.addEventListener("click", clearToken);
    searchInput.addEventListener("input", debounce(renderIssues, 200));
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      ownerInput.value = saved.owner || "vercel";
      repoInput.value = saved.repo || "next.js";
      stateSelect.value = saved.state || "open";
      labelsInput.value = saved.labels || "";
      sortSelect.value = saved.sort || "created";
      directionSelect.value = saved.direction || "desc";
      perPageInput.value = saved.perPage || 20;
    } catch {
      // ignore malformed data
    }

    const savedToken = localStorage.getItem(tokenStorageKey);
    if (savedToken) {
      tokenInput.value = savedToken;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const params = getFormParams();
    persistSettings(params);
    if (tokenInput.value.trim()) {
      localStorage.setItem(tokenStorageKey, tokenInput.value.trim());
    }
    loadIssues({ reset: true });
  }

  function getFormParams() {
    return {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      state: stateSelect.value,
      labels: labelsInput.value
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(","),
      sort: sortSelect.value,
      direction: directionSelect.value,
      perPage: Math.min(
        100,
        Math.max(1, Number.parseInt(perPageInput.value, 10) || 20)
      ),
    };
  }

  function persistSettings(params) {
    localStorage.setItem(storageKey, JSON.stringify(params));
  }

  function clearToken() {
    localStorage.removeItem(tokenStorageKey);
    tokenInput.value = "";
    tokenInput.focus();
  }

  async function loadIssues({ reset }) {
    const params = getFormParams();
    if (!params.owner || !params.repo) {
      setStatus("オーナーとリポジトリを入力してください。", "error");
      return;
    }

    const paramsHash = JSON.stringify(params);
    if (reset || paramsHash !== lastParamsHash) {
      currentPage = 1;
      issuesCache = [];
      issuesList.innerHTML = "";
      lastParamsHash = paramsHash;
    }

    await fetchIssuesPage(params);
  }

  async function fetchIssuesPage(params) {
    if (activeRequest) {
      activeRequest.abort();
    }

    const controller = new AbortController();
    activeRequest = controller;
    setStatus("読み込み中...", "info");
    toggleFormDisabled(true);
    loadMoreButton.hidden = true;

    try {
      const url = new URL(
        `https://api.github.com/repos/${encodeURIComponent(
          params.owner
        )}/${encodeURIComponent(params.repo)}/issues`
      );

      url.searchParams.set("state", params.state);
      if (params.labels) {
        url.searchParams.set("labels", params.labels);
      }
      url.searchParams.set("sort", params.sort);
      url.searchParams.set("direction", params.direction);
      url.searchParams.set("per_page", params.perPage.toString());
      url.searchParams.set("page", currentPage.toString());

      const headers = {
        Accept: "application/vnd.github+json",
      };

      const token = tokenInput.value.trim() || localStorage.getItem(tokenStorageKey);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        await handleFetchError(response);
        return;
      }

      const issues = (await response.json()).filter(
        (issue) => !issue.pull_request
      );

      const linkHeader = response.headers.get("link");
      hasMore = Boolean(linkHeader && linkHeader.includes('rel="next"'));

      issuesCache.push(...issues);
      renderIssues();

      if (issues.length === 0 && currentPage === 1) {
        setStatus("Issue が見つかりませんでした。", "info");
      } else {
        const totalShown = issuesCache.length;
        setStatus(`表示中: ${totalShown.toLocaleString()} 件`, "success");
      }

      if (hasMore) {
        currentPage += 1;
        loadMoreButton.hidden = false;
      } else {
        loadMoreButton.hidden = true;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      console.error(error);
      setStatus("Issue の取得でエラーが発生しました。ネットワーク状態をご確認ください。", "error");
    } finally {
      toggleFormDisabled(false);
      activeRequest = null;
    }
  }

  async function handleFetchError(response) {
    let message = `Issue の取得に失敗しました (HTTP ${response.status}).`;

    switch (response.status) {
      case 401:
        message = "認証に失敗しました。アクセストークンを確認してください。";
        break;
      case 403:
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining === "0") {
          const reset = response.headers.get("x-ratelimit-reset");
          if (reset) {
            const resetDate = new Date(Number.parseInt(reset, 10) * 1000);
            message = `GitHub API のレート制限に達しました。${resetDate.toLocaleString()} 以降に再試行してください。アクセストークンを利用すると制限が緩和されます。`;
          } else {
            message =
              "GitHub API のレート制限に達しました。少し待ってから再試行するかアクセストークンを入力してください。";
          }
        } else {
          message =
            "GitHub API から拒否されました。アクセストークンやリクエスト内容を確認してください。";
        }
        break;
      case 404:
        message = "リポジトリが見つかりませんでした。オーナーとリポジトリ名を確認してください。";
        break;
      default:
        try {
          const body = await response.json();
          if (body && body.message) {
            message = `GitHub API エラー: ${body.message}`;
          }
        } catch {
          // ignore
        }
    }

    setStatus(message, "error");
  }

  function renderIssues() {
    issuesList.innerHTML = "";
    const keyword = searchInput.value.trim().toLowerCase();
    const filtered = keyword
      ? issuesCache.filter((issue) =>
          [issue.title, issue.body || ""].some((field) =>
            field.toLowerCase().includes(keyword)
          )
        )
      : issuesCache;

    if (filtered.length === 0) {
      const emptyMessage = document.createElement("li");
      emptyMessage.textContent = keyword
        ? "検索条件に一致する Issue がありません。"
        : "Issue がまだ読み込まれていません。";
      issuesList.appendChild(emptyMessage);
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((issue) => {
      fragment.appendChild(createIssueCard(issue));
    });
    issuesList.appendChild(fragment);
  }

  function createIssueCard(issue) {
    const li = document.createElement("li");
    li.className = "issue-card";

    const title = document.createElement("h3");
    title.className = "issue-title";
    const link = document.createElement("a");
    link.href = issue.html_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `#${issue.number} ${issue.title}`;
    title.appendChild(link);

    const status = document.createElement("span");
    status.className = `status-pill ${
      issue.state === "open" ? "status-open" : "status-closed"
    }`;
    status.textContent = issue.state;
    title.appendChild(status);

    li.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "issue-meta";
    meta.innerHTML = `
      作成: ${formatDate(issue.created_at)}
      ${issue.state === "open" ? "" : ` / クローズ: ${formatDate(issue.closed_at) || "-"}`}
      / 更新: ${formatDate(issue.updated_at)}
      / コメント: ${issue.comments.toLocaleString()} 件
    `;
    li.appendChild(meta);

    if (issue.labels && issue.labels.length > 0) {
      const labels = document.createElement("div");
      labels.className = "issue-labels";
      issue.labels.forEach((label) => {
        const span = document.createElement("span");
        span.className = "issue-label";
        span.textContent = label.name;
        if (label.color) {
          span.style.backgroundColor = `#${label.color}`;
          span.style.color = getContrastColor(label.color);
        }
        labels.appendChild(span);
      });
      li.appendChild(labels);
    }

    if (issue.body) {
      const body = document.createElement("div");
      body.className = "issue-body";
      body.textContent = issue.body;
      li.appendChild(body);
    }

    return li;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function getContrastColor(hexColor) {
    const hex = hexColor.replace("#", "");
    if (hex.length !== 6) {
      return "#1f2933";
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#1f2933" : "#f8fafc";
  }

  function setStatus(message, level) {
    statusMessage.textContent = message;
    statusMessage.dataset.level = level;
  }

  function toggleFormDisabled(disabled) {
    Array.from(form.elements).forEach((element) => {
      element.disabled = disabled && element !== tokenInput;
    });
    loadMoreButton.disabled = disabled;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), delay);
    };
  }
})();
