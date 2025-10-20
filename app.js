(() => {
  const STORAGE_KEY = "facility-safety-checklist:v1";
  const CONFIG_STORAGE_KEY = "facility-safety-checklist:config";
  const STATUS_LABELS = {
    ok: "適合",
    attention: "注意",
    issue: "不適合",
  };
  const STATUS_ORDER = ["ok", "attention", "issue"];

  const DEFAULT_CHECKLIST_SECTIONS = [
    {
      id: "entrance",
      title: "出入口・共用部",
      items: [
        {
          id: "entrance-doors",
          title: "出入口の施錠・開閉装置は正常に作動する",
          notePlaceholder: "異音・鍵の固さなど気づいた点を記録",
        },
        {
          id: "entrance-pathways",
          title: "通路や避難経路に障害物がない",
          notePlaceholder: "一時的な設置物がある場合は詳細に記載",
        },
        {
          id: "entrance-lighting",
          title: "共用部の照明は適切に点灯する",
          notePlaceholder: "交換予定の照明があれば記載",
        },
      ],
    },
    {
      id: "equipment",
      title: "設備・機器",
      items: [
        {
          id: "equipment-machinery",
          title: "主要設備が取扱手順どおりに運転・停止できる",
          notePlaceholder: "異常音/振動など",
        },
        {
          id: "equipment-emergency",
          title: "非常停止ボタン・ブレーカーへのアクセスが確保されている",
          notePlaceholder: "遮蔽物の有無を記録",
        },
        {
          id: "equipment-maintenance",
          title: "点検記録・保守点検シールが最新である",
          notePlaceholder: "期限切れのものを記載",
        },
      ],
    },
    {
      id: "safety",
      title: "防災・安全備品",
      items: [
        {
          id: "safety-extinguisher",
          title: "消火器・消火栓の設置位置と有効期限を確認した",
          notePlaceholder: "交換予定・不備があれば記載",
        },
        {
          id: "safety-emergency-exit",
          title: "避難誘導灯・非常口標識が点灯し視認できる",
          notePlaceholder: "不点灯箇所や暗い箇所を記録",
        },
        {
          id: "safety-firstaid",
          title: "救急箱の備品が揃っている",
          notePlaceholder: "不足している備品を記録",
        },
      ],
    },
    {
      id: "environment",
      title: "環境・衛生",
      items: [
        {
          id: "environment-cleanliness",
          title: "作業エリア・床の清掃が行き届いている",
          notePlaceholder: "油漏れ・濡れなど滑りやすい箇所の有無",
        },
        {
          id: "environment-waste",
          title: "廃棄物・資材が適切に区分・保管されている",
          notePlaceholder: "一時保管物や改善予定を記録",
        },
        {
          id: "environment-ppe",
          title: "必要な保護具が劣化なく配置されている",
          notePlaceholder: "交換必要な保護具を記録",
        },
      ],
    },
  ];

  const form = document.getElementById("inspection-form");
  const checklistContainer = document.getElementById("checklist-container");
  const summarySection = document.getElementById("summary");
  const statusMessage = document.getElementById("status-message");
  const reportTextArea = document.getElementById("report-text");

  const refreshSummaryButton = document.getElementById("refresh-summary");
  const copyReportButton = document.getElementById("copy-report");
  const resetStatusButton = document.getElementById("reset-status");
  const configInput = document.getElementById("config-input");
  const configFileInput = document.getElementById("config-file-input");
  const applyConfigButton = document.getElementById("apply-config");
  const resetConfigButton = document.getElementById("reset-config");
  const exportConfigButton = document.getElementById("export-config");
  const importConfigButton = document.getElementById("import-config");
  const copyConfigButton = document.getElementById("copy-config");

  const formFields = {
    facilityName: document.getElementById("facility-name"),
    facilityLocation: document.getElementById("facility-location"),
    inspectionDate: document.getElementById("inspection-date"),
    inspectorName: document.getElementById("inspector-name"),
    globalNotes: document.getElementById("global-notes"),
  };

  let checklistSections = [];
  let state = {
    form: {
      facilityName: "",
      facilityLocation: "",
      inspectionDate: "",
      inspectorName: "",
      globalNotes: "",
    },
    items: {},
  };

  init();

  function init() {
    checklistSections = loadChecklistConfig();
    loadState();
    pruneStateItems();
    initForm();
    initConfigEditor();
    renderChecklist();
    attachEventHandlers();
    updateSummary();
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.form && saved.items) {
        state = {
          form: { ...state.form, ...saved.form },
          items: { ...saved.items },
        };
      }
    } catch {
      state = { ...state };
    }
  }

  function loadChecklistConfig() {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        return parseChecklistConfig(stored);
      }
    } catch (error) {
      console.error("Failed to load checklist config", error);
    }
    return cloneChecklist(DEFAULT_CHECKLIST_SECTIONS);
  }

  function initConfigEditor() {
    if (!configInput) return;
    configInput.value = stringifyChecklist(checklistSections);
  }

  function stringifyChecklist(sections) {
    return JSON.stringify(sections, null, 2);
  }

  function parseChecklistConfig(rawText) {
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error("JSON の形式が正しくありません。構造を確認してください。");
    }
    return normalizeChecklist(data);
  }

  function normalizeChecklist(sections) {
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error("チェックリストは 1 件以上のカテゴリを含む配列で指定してください。");
    }

    const sectionIds = new Set();
    const itemIds = new Set();

    return sections.map((section, sectionIndex) => {
      if (!section || typeof section !== "object") {
        throw new Error(`カテゴリ ${sectionIndex + 1} の形式が正しくありません。`);
      }
      const id = String(section.id || "").trim();
      const title = String(section.title || "").trim();
      const items = Array.isArray(section.items) ? section.items : [];

      if (!id) {
        throw new Error(`カテゴリ ${sectionIndex + 1} に ID を設定してください。`);
      }
      if (sectionIds.has(id)) {
        throw new Error(`カテゴリ ID "${id}" が重複しています。`);
      }
      sectionIds.add(id);

      if (!title) {
        throw new Error(`カテゴリ ${sectionIndex + 1} にタイトルを設定してください。`);
      }
      if (items.length === 0) {
        throw new Error(`カテゴリ "${title}" に 1 件以上の点検項目を設定してください。`);
      }

      const normalizedItems = items.map((item, itemIndex) => {
        if (!item || typeof item !== "object") {
          throw new Error(`カテゴリ "${title}" の項目 ${itemIndex + 1} が不正です。`);
        }
        const itemId = String(item.id || "").trim();
        const itemTitle = String(item.title || "").trim();
        const notePlaceholder = item.notePlaceholder
          ? String(item.notePlaceholder)
          : "";

        if (!itemId) {
          throw new Error(`カテゴリ "${title}" の項目 ${itemIndex + 1} に ID を設定してください。`);
        }
        if (itemIds.has(itemId)) {
          throw new Error(`項目 ID "${itemId}" が重複しています。`);
        }
        itemIds.add(itemId);

        if (!itemTitle) {
          throw new Error(`項目 ID "${itemId}" にタイトルを設定してください。`);
        }

        return {
          id: itemId,
          title: itemTitle,
          notePlaceholder,
        };
      });

      return {
        id,
        title,
        items: normalizedItems,
      };
    });
  }

  function cloneChecklist(sections) {
    return normalizeChecklist(JSON.parse(JSON.stringify(sections)));
  }

  function pruneStateItems() {
    const validIds = new Set(getAllItemIds(checklistSections));
    const nextItems = {};
    let changed = false;
    Object.entries(state.items || {}).forEach(([itemId, itemState]) => {
      if (validIds.has(itemId)) {
        nextItems[itemId] = itemState;
      } else {
        changed = true;
      }
    });
    if (changed) {
      state.items = nextItems;
      saveState();
    }
  }

  function getAllItemIds(sections) {
    const ids = [];
    sections.forEach((section) => {
      section.items.forEach((item) => ids.push(item.id));
    });
    return ids;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function initForm() {
    Object.entries(formFields).forEach(([key, element]) => {
      if (state.form[key]) {
        element.value = state.form[key];
      }
      element.addEventListener("input", () => {
        state.form[key] = element.value;
        saveState();
        updateSummary();
      });
    });

    if (!state.form.inspectionDate) {
      const today = new Date().toISOString().slice(0, 10);
      formFields.inspectionDate.value = today;
      state.form.inspectionDate = today;
      saveState();
    }
  }

  function attachEventHandlers() {
    refreshSummaryButton.addEventListener("click", () => {
      updateSummary();
      setStatusMessage("要約を更新しました。", "info");
    });

    copyReportButton.addEventListener("click", handleCopyReport);
    resetStatusButton.addEventListener("click", handleReset);
    applyConfigButton.addEventListener("click", handleApplyConfig);
    resetConfigButton.addEventListener("click", handleResetConfig);
    exportConfigButton.addEventListener("click", handleExportConfig);
    importConfigButton.addEventListener("click", handleImportConfig);
    copyConfigButton.addEventListener("click", handleCopyConfig);
    if (configFileInput) {
      configFileInput.addEventListener("change", handleConfigFileSelected);
    }
  }

  function renderChecklist() {
    checklistContainer.innerHTML = "";

    checklistSections.forEach((section) => {
      const sectionEl = document.createElement("section");
      sectionEl.className = "checklist-group";

      const heading = document.createElement("h3");
      heading.textContent = section.title;
      sectionEl.appendChild(heading);

      section.items.forEach((item) => {
        const itemState = state.items[item.id] || {
          status: "",
          note: "",
        };

        const itemEl = document.createElement("article");
        itemEl.className = "checklist-item";
        itemEl.dataset.itemId = item.id;

        const header = document.createElement("div");
        header.className = "item-header";

        const title = document.createElement("h4");
        title.className = "item-title";
        title.textContent = item.title;
        header.appendChild(title);

        const statusContainer = document.createElement("div");
        statusContainer.className = "status-options";

        STATUS_ORDER.forEach((statusKey) => {
          const label = document.createElement("label");
          label.dataset.status = statusKey;

          const input = document.createElement("input");
          input.type = "radio";
          input.name = `status-${item.id}`;
          input.value = statusKey;
          input.checked = itemState.status === statusKey;

          input.addEventListener("change", () => {
            updateItemState(item.id, { status: input.value });
            highlightActiveStatus(statusContainer, input.value);
          });

          label.appendChild(input);
          label.appendChild(document.createTextNode(STATUS_LABELS[statusKey]));
          if (itemState.status === statusKey) {
            label.classList.add("is-active");
          }
          statusContainer.appendChild(label);
        });

        header.appendChild(statusContainer);
        itemEl.appendChild(header);

        const note = document.createElement("textarea");
        note.className = "note-input";
        note.placeholder = item.notePlaceholder || "気づいた点を記入";
        note.value = itemState.note || "";
        note.addEventListener("input", () => {
          updateItemState(item.id, { note: note.value });
        });

        itemEl.appendChild(note);
        sectionEl.appendChild(itemEl);
      });

      checklistContainer.appendChild(sectionEl);
    });
  }

  function updateItemState(itemId, partial) {
    const current = state.items[itemId] || { status: "", note: "" };
    state.items[itemId] = { ...current, ...partial };
    saveState();
    updateSummary();
  }

  function handleReset() {
    const confirmed = window.confirm("チェック項目の入力をすべてリセットしますか？");
    if (!confirmed) return;
    state.items = {};
    saveState();
    renderChecklist();
    updateSummary();
    setStatusMessage("チェック項目をリセットしました。", "info");
  }

  function handleApplyConfig() {
    const raw = configInput.value.trim();
    if (!raw) {
      setStatusMessage("設定内容を入力してください。", "error");
      return;
    }

    try {
      const parsed = parseChecklistConfig(raw);
      applyChecklistConfiguration(parsed, { persist: true });
      setStatusMessage("チェックリスト設定を更新しました。", "success");
    } catch (error) {
      console.error("Failed to apply checklist config", error);
      setStatusMessage(error.message || "設定の更新に失敗しました。", "error");
    }
  }

  function handleResetConfig() {
    const confirmed = window.confirm("既定のチェックリストに戻しますか？");
    if (!confirmed) return;
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    applyChecklistConfiguration(cloneChecklist(DEFAULT_CHECKLIST_SECTIONS), {
      persist: false,
    });
    setStatusMessage("既定のチェックリストに戻しました。", "info");
  }

  async function handleCopyConfig() {
    if (!configInput) return;
    const text = configInput.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(configInput);
      }
      setStatusMessage("JSON 設定をコピーしました。", "success");
    } catch (error) {
      console.error("Failed to copy config json", error);
      setStatusMessage("コピーに失敗しました。手動でコピーしてください。", "error");
      fallbackCopy(configInput);
    }
  }

  function handleExportConfig() {
    try {
      const data = stringifyChecklist(checklistSections);
      const filename = `facility-checklist-config-${formatTimestamp(
        new Date()
      )}.json`;
      downloadTextFile(data, filename, "application/json");
      setStatusMessage("JSON 設定ファイルをエクスポートしました。", "success");
    } catch (error) {
      console.error("Failed to export checklist config", error);
      setStatusMessage("エクスポートに失敗しました。", "error");
    }
  }

  function handleImportConfig() {
    if (!configFileInput) {
      setStatusMessage("インポート用のファイル入力が利用できません。", "error");
      return;
    }
    configFileInput.value = "";
    configFileInput.click();
  }

  function handleConfigFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const parsed = parseChecklistConfig(text);
        applyChecklistConfiguration(parsed, { persist: true });
        setStatusMessage("JSON 設定ファイルをインポートしました。", "success");
      } catch (error) {
        console.error("Failed to import checklist config", error);
        setStatusMessage(error.message || "インポートに失敗しました。", "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.onerror = () => {
      console.error("Failed to read checklist config file", reader.error);
      setStatusMessage("ファイルの読み込みに失敗しました。", "error");
      event.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  function highlightActiveStatus(container, activeStatus) {
    Array.from(container.querySelectorAll("label")).forEach((label) => {
      label.classList.toggle("is-active", label.dataset.status === activeStatus);
    });
  }

  async function handleCopyReport() {
    if (!form.reportValidity()) {
      setStatusMessage("必須項目を入力してください。", "error");
      return;
    }

    const items = getCompletedItems();
    if (items.length === 0) {
      setStatusMessage("チェック項目にステータスを入力してください。", "error");
      return;
    }

    updateSummary();

    const reportText = reportTextArea.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reportText);
      } else {
        fallbackCopy(reportTextArea);
      }
      setStatusMessage("報告テキストをコピーしました。", "success");
    } catch (error) {
      console.error("Failed to copy report text", error);
      setStatusMessage("コピーに失敗しました。手動でコピーしてください。", "error");
      fallbackCopy(reportTextArea);
    }
  }

  function applyChecklistConfiguration(sections, { persist } = { persist: true }) {
    checklistSections = sections;
    if (persist) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sections));
    }
    pruneStateItems();
    renderChecklist();
    updateSummary();
    if (configInput) {
      configInput.value = stringifyChecklist(checklistSections);
    }
  }

  function getCompletedItems() {
    return checklistSections.flatMap((section) =>
      section.items
        .map((item) => {
          const itemState = state.items[item.id];
          if (!itemState || !itemState.status) return null;
          return {
            section: section.title,
            id: item.id,
            title: item.title,
            status: itemState.status,
            note: itemState.note,
          };
        })
        .filter(Boolean)
    );
  }

  function updateSummary() {
    const items = getCompletedItems();
    if (items.length === 0) {
      summarySection.innerHTML =
        '<div class="empty-state">チェック内容を入力すると要約が表示されます。</div>';
      reportTextArea.value = buildReportText(items);
      return;
    }

    const counts = STATUS_ORDER.reduce(
      (acc, key) => ({
        ...acc,
        [key]: items.filter((item) => item.status === key).length,
      }),
      {}
    );

    const total = items.length;
    const infoBlock = `
      <div>
        <h3>${state.form.facilityName || "施設名未入力"} の点検結果</h3>
        <p>
          点検日: ${formatDate(state.form.inspectionDate)} /
          点検者: ${state.form.inspectorName || "未入力"} /
          記録件数: ${total} 件
        </p>
        <p>
          適合: ${counts.ok ?? 0} 件 /
          注意: ${counts.attention ?? 0} 件 /
          不適合: ${counts.issue ?? 0} 件
        </p>
        ${
          state.form.globalNotes
            ? `<p>特記事項: ${escapeHtml(state.form.globalNotes)}</p>`
            : ""
        }
      </div>
    `;

    const grouped = groupItemsBySection(items);
    const listMarkup = grouped
      .map((group) => {
        const itemsMarkup = group.items
          .map((item) => {
            const badgeClass = `status-badge status-${item.status}`;
            const noteMarkup = item.note
              ? `<p>${escapeHtml(item.note)}</p>`
              : "";
            return `
              <article class="summary-item">
                <div class="summary-item-header">
                  <h4>${item.title}</h4>
                  <span class="${badgeClass}">${STATUS_LABELS[item.status]}</span>
                </div>
                ${noteMarkup}
              </article>
            `;
          })
          .join("");
        return `
          <section class="summary-group">
            <h3>${group.section}</h3>
            <div class="summary-list">
              ${itemsMarkup}
            </div>
          </section>
        `;
      })
      .join("");

    summarySection.innerHTML = `${infoBlock}${listMarkup}`;
    reportTextArea.value = buildReportText(items);
  }

  function groupItemsBySection(items) {
    const map = new Map();
    items.forEach((item) => {
      if (!map.has(item.section)) {
        map.set(item.section, []);
      }
      map.get(item.section).push(item);
    });

    return Array.from(map.entries()).map(([section, sectionItems]) => ({
      section,
      items: sectionItems,
    }));
  }

  function formatDate(value) {
    if (!value) return "未入力";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}月${String(date.getDate()).padStart(2, "0")}日`;
  }

  function escapeHtml(value) {
    const safe = value ?? "";
    return String(safe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Assemble a plain text summary that is easy to copy into email or chat tools.
  function buildReportText(items) {
    const lines = [];
    lines.push("以下のとおり施設安全点検を実施しました。");
    lines.push("");
    lines.push(`施設名: ${state.form.facilityName || "未入力"}`);
    lines.push(`所在地: ${state.form.facilityLocation || "未入力"}`);
    lines.push(`点検日: ${formatDate(state.form.inspectionDate)}`);
    lines.push(`点検者: ${state.form.inspectorName || "未入力"}`);
    lines.push("");
    lines.push("■ 点検結果");

    const grouped = groupItemsBySection(items);
    grouped.forEach((group) => {
      lines.push(`【${group.section}】`);
      group.items.forEach((item) => {
        lines.push(
          `- ${item.title}: ${STATUS_LABELS[item.status]}${
            item.note ? ` / 備考: ${item.note}` : ""
          }`
        );
      });
      lines.push("");
    });

    if (state.form.globalNotes) {
      lines.push("■ 特記事項");
      lines.push(state.form.globalNotes);
      lines.push("");
    }

    lines.push("以上、確認をお願いいたします。");
    return lines.join("\n");
  }

  function formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      date.getFullYear().toString() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "-" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  function downloadTextFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function fallbackCopy(textarea) {
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.setSelectionRange(0, 0);
  }

  function setStatusMessage(message, level) {
    statusMessage.textContent = message;
    statusMessage.dataset.level = level;
  }
})();
