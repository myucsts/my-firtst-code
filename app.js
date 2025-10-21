(() => {
  const STORAGE_KEY = "facility-safety-checklist:v1";
  const CONFIG_STORAGE_KEY = "facility-safety-checklist:config";
  const TEMPLATE_STORAGE_KEY = "facility-safety-checklist:templates";
  const CURRENT_TEMPLATE_KEY = "facility-safety-checklist:current-template";
  const DEFAULT_TEMPLATE_NAME = "標準テンプレート";
  const STATUS_LABELS = {
    ok: "問題なし",
    attention: "注意事項あり",
    issue: "要対応",
  };
  const STATUS_ORDER = ["ok", "attention", "issue"];
  const ISSUE_STATUS = "issue";
  const ISSUE_NOTE_REQUIRED_MESSAGE =
    "要対応を選択した場合はコメントをご記入ください。";

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
  const areasContainer = document.getElementById("areas-container");
  const addAreaButton = document.getElementById("add-area-button");
  const summarySection = document.getElementById("summary");
  const statusMessage = document.getElementById("status-message");
  const reportTextArea = document.getElementById("report-text");

  const refreshSummaryButton = document.getElementById("refresh-summary");
  const copyReportButton = document.getElementById("copy-report");
  const resetStatusButton = document.getElementById("reset-status");
  const configInput = document.getElementById("config-input");
  const templateSelect = document.getElementById("config-template-select");
  const saveTemplateButton = document.getElementById("save-template");
  const saveTemplateAsButton = document.getElementById("save-template-as");
  const deleteTemplateButton = document.getElementById("delete-template");
  const applyConfigButton = document.getElementById("apply-config");
  const resetConfigButton = document.getElementById("reset-config");
  const copyConfigButton = document.getElementById("copy-config");
  const appVersionElement = document.getElementById("app-version");
  const jumpToChecklistWrapper = document.getElementById("checklist-shortcut");
  const jumpToChecklistButton = document.getElementById("jump-to-checklist");
  const jumpToChecklistMenu = document.getElementById("jump-to-checklist-menu");

  const formFields = {
    inspectionDate: document.getElementById("inspection-date"),
    inspectorName: document.getElementById("inspector-name"),
    globalNotes: document.getElementById("global-notes"),
  };

  let checklistSections = [];
  let templates = [];
  let currentTemplateName = DEFAULT_TEMPLATE_NAME;

  let legacySingleAreaItems = null;
  let legacySingleAreaName = "";

  let state = {
    form: {
      inspectionDate: "",
      inspectorName: "",
      globalNotes: "",
    },
    areas: [],
  };

  let lastInspectionDateValue = "";
  let activeAreaId = null;

  const SAVE_STATE_DEBOUNCE_MS = 200;
  let saveStateTimer = null;
  let isStateDirty = false;
  let jumpHighlightTimer = null;
  let isShortcutMenuOpen = false;

  init();

  function init() {
    templates = loadTemplates();
    currentTemplateName = loadCurrentTemplateName(templates);
    saveCurrentTemplateName(currentTemplateName);
    checklistSections = loadChecklistConfig();
    loadState();
    lastInspectionDateValue = state.form.inspectionDate || "";
    ensureAreas();
    pruneAreasForTemplate();
    if (!activeAreaId || !state.areas.some((area) => area.id === activeAreaId)) {
      activeAreaId = state.areas[0]?.id || null;
    }
    initForm();
    initTemplateControls();
    initConfigEditor();
    renderAreas();
    displayAppVersion();
    attachEventHandlers();
    setupStatePersistenceGuards();
    updateSummary();
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        if (saved.form && typeof saved.form === "object") {
          state.form = { ...state.form, ...saved.form };
          if (saved.form.inspectionArea) {
            legacySingleAreaName = saved.form.inspectionArea;
            delete state.form.inspectionArea;
          }
          if (Object.prototype.hasOwnProperty.call(state.form, "facilityLocation")) {
            delete state.form.facilityLocation;
          }
        }
        if (Array.isArray(saved.areas)) {
          state.areas = saved.areas
            .map((area, index) => ({
              id: area.id || createAreaId(),
              name:
                typeof area.name === "string"
                  ? area.name
                  : `点検箇所${index + 1}`,
              notes: area.notes ? String(area.notes) : "",
              items:
                area.items && typeof area.items === "object"
                  ? { ...area.items }
                  : {},
            }))
            .filter(Boolean);
        } else if (saved.items && typeof saved.items === "object") {
          legacySingleAreaItems = saved.items;
        }
        if (typeof saved.activeAreaId === "string") {
          activeAreaId = saved.activeAreaId;
        }
      }
    } catch (error) {
      console.error("Failed to load state", error);
    }
  }

  function ensureAreas() {
    if (!Array.isArray(state.areas)) {
      state.areas = [];
    }
    if (state.areas.length === 0) {
      const name = legacySingleAreaName || "点検箇所1";
      const area = createArea(name);
      if (legacySingleAreaItems) {
        area.items = { ...legacySingleAreaItems };
      }
      state.areas.push(area);
    } else {
      state.areas = state.areas.map((area, index) => ({
        id: area.id || createAreaId(),
        name:
          typeof area.name === "string"
            ? area.name
            : `点検箇所${index + 1}`,
        notes: area.notes ? String(area.notes) : "",
        items:
          area.items && typeof area.items === "object"
            ? { ...area.items }
            : {},
      }));
    }
    legacySingleAreaItems = null;
    legacySingleAreaName = "";
    if (!state.areas.some((area) => area.id === activeAreaId)) {
      activeAreaId = state.areas[0]?.id || null;
    }
    saveState({ immediate: true });
  }

  function createArea(name = "") {
    return {
      id: createAreaId(),
      name,
      notes: "",
      items: {},
    };
  }

  function createAreaId() {
    return `area-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
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

    const template =
      findTemplate(currentTemplateName) ||
      findTemplate(DEFAULT_TEMPLATE_NAME);
    if (template) {
      return cloneChecklist(template.sections);
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

  function loadTemplates() {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
    } catch (error) {
      console.error("Failed to load templates", error);
    }

    const result = [];
    const names = new Set();

    (Array.isArray(stored) ? stored : []).forEach((entry, index) => {
      try {
        if (!entry || typeof entry !== "object") {
          throw new Error(`テンプレート ${index + 1} の形式が正しくありません。`);
        }
        const name = String(entry.name || "").trim();
        if (!name) {
          throw new Error(`テンプレート ${index + 1} に名前を設定してください。`);
        }
        if (name === DEFAULT_TEMPLATE_NAME) {
          return;
        }
        if (names.has(name)) {
          throw new Error(`テンプレート名 "${name}" が重複しています。`);
        }
        const sections = normalizeChecklist(entry.sections);
        result.push({ name, sections });
        names.add(name);
      } catch (error) {
        console.warn("Skipping invalid template", error);
      }
    });

    result.push({
      name: DEFAULT_TEMPLATE_NAME,
      sections: cloneChecklist(DEFAULT_CHECKLIST_SECTIONS),
    });

    saveTemplates(result);
    return result;
  }

  function saveTemplates(list) {
    const payload = list
      .filter((template) => template.name !== DEFAULT_TEMPLATE_NAME)
      .map((template) => ({
        name: template.name,
        sections: template.sections,
      }));
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(payload));
  }

  function findTemplate(name) {
    return templates.find((template) => template.name === name);
  }

  function loadCurrentTemplateName(list) {
    const storedName = localStorage.getItem(CURRENT_TEMPLATE_KEY);
    if (storedName && list.some((template) => template.name === storedName)) {
      return storedName;
    }
    return DEFAULT_TEMPLATE_NAME;
  }

  function saveCurrentTemplateName(name) {
    localStorage.setItem(CURRENT_TEMPLATE_KEY, name);
  }

  function renderTemplateOptions() {
    if (!templateSelect) return;
    templateSelect.innerHTML = "";
    templates.forEach((template) => {
      const option = document.createElement("option");
      option.value = template.name;
      option.textContent = template.name;
      templateSelect.appendChild(option);
    });
  }

  function updateTemplateActionStates() {
    if (deleteTemplateButton) {
      const isDefault = currentTemplateName === DEFAULT_TEMPLATE_NAME;
      deleteTemplateButton.disabled = isDefault || templates.length <= 1;
    }
    if (saveTemplateButton) {
      saveTemplateButton.disabled = currentTemplateName === DEFAULT_TEMPLATE_NAME;
    }
  }

  function selectTemplate(name, { silent } = { silent: false }) {
    const template = findTemplate(name);
    if (!template) return;
    currentTemplateName = template.name;
    saveCurrentTemplateName(currentTemplateName);
    applyChecklistConfiguration(cloneChecklist(template.sections), {
      persist: true,
    });
    if (templateSelect) {
      templateSelect.value = currentTemplateName;
    }
    updateTemplateActionStates();
    if (!silent) {
      setStatusMessage(`テンプレート「${currentTemplateName}」を読み込みました。`, "info");
    }
  }

  function hasUnsavedConfigChanges() {
    if (!configInput) return false;
    return configInput.value !== stringifyChecklist(checklistSections);
  }

  function handleTemplateChange(event) {
    const targetName = event.target.value;
    if (targetName === currentTemplateName) {
      return;
    }

    if (hasUnsavedConfigChanges()) {
      const confirmed = window.confirm(
        "現在の設定は保存されていません。テンプレートを切り替えると破棄されます。よろしいですか？"
      );
      if (!confirmed) {
        event.target.value = currentTemplateName;
        return;
      }
    }

    selectTemplate(targetName);
  }

  function parseConfigInput() {
    const raw = (configInput?.value || "").trim();
    if (!raw) {
      throw new Error("設定内容を入力してください。");
    }
    return parseChecklistConfig(raw);
  }

  function handleSaveTemplate() {
    if (currentTemplateName === DEFAULT_TEMPLATE_NAME) {
      setStatusMessage(
        "標準テンプレートは上書きできません。新規テンプレートとして保存してください。",
        "error"
      );
      return;
    }
    try {
      const parsed = parseConfigInput();
      applyChecklistConfiguration(parsed, { persist: true });
      const template = findTemplate(currentTemplateName);
      if (template) {
        template.sections = cloneChecklist(parsed);
      }
      saveTemplates(templates);
      renderTemplateOptions();
      if (templateSelect) {
        templateSelect.value = currentTemplateName;
      }
      updateTemplateActionStates();
      setStatusMessage("テンプレートを上書き保存しました。", "success");
    } catch (error) {
      console.error("Failed to save template", error);
      setStatusMessage(error.message || "テンプレートの保存に失敗しました。", "error");
    }
  }

  function handleSaveTemplateAs() {
    try {
      const parsed = parseConfigInput();
      applyChecklistConfiguration(parsed, { persist: true });
      const defaultName = `${currentTemplateName}のコピー`;
      const name = promptForTemplateName(defaultName);
      if (!name) {
        return;
      }
      templates.push({ name, sections: cloneChecklist(parsed) });
      saveTemplates(templates);
      currentTemplateName = name;
      saveCurrentTemplateName(currentTemplateName);
      renderTemplateOptions();
      if (templateSelect) {
        templateSelect.value = currentTemplateName;
      }
      updateTemplateActionStates();
      setStatusMessage(`テンプレート「${currentTemplateName}」を作成しました。`, "success");
    } catch (error) {
      console.error("Failed to save template as new", error);
      setStatusMessage(error.message || "テンプレートの保存に失敗しました。", "error");
    }
  }

  function handleDeleteTemplate() {
    if (currentTemplateName === DEFAULT_TEMPLATE_NAME) {
      setStatusMessage("標準テンプレートは削除できません。", "error");
      return;
    }

    const confirmed = window.confirm(
      `テンプレート「${currentTemplateName}」を削除しますか？`
    );
    if (!confirmed) return;

    templates = templates.filter((template) => template.name !== currentTemplateName);
    saveTemplates(templates);

    const fallback = findTemplate(DEFAULT_TEMPLATE_NAME) || templates[0];
    currentTemplateName = fallback ? fallback.name : DEFAULT_TEMPLATE_NAME;
    saveCurrentTemplateName(currentTemplateName);
    renderTemplateOptions();
    if (templateSelect) {
      templateSelect.value = currentTemplateName;
    }
    updateTemplateActionStates();
    selectTemplate(currentTemplateName, { silent: true });
    setStatusMessage("テンプレートを削除しました。", "info");
  }

  function promptForTemplateName(defaultName) {
    let name = window.prompt("テンプレート名を入力してください。", defaultName || "");
    if (name === null) {
      return null;
    }
    name = name.trim();
    if (!name) {
      throw new Error("テンプレート名を入力してください。");
    }
    if (templateNameExists(name)) {
      throw new Error("同名のテンプレートが既に存在します。");
    }
    return name;
  }

  function templateNameExists(name) {
    return templates.some((template) => template.name === name);
  }

  function cloneChecklist(sections) {
    return normalizeChecklist(JSON.parse(JSON.stringify(sections)));
  }

  function saveState(options = {}) {
    isStateDirty = true;
    const immediate = options.immediate === true;
    if (immediate) {
      if (saveStateTimer) {
        clearTimeout(saveStateTimer);
        saveStateTimer = null;
      }
      writeStateToStorage();
      return;
    }
    if (saveStateTimer) {
      clearTimeout(saveStateTimer);
    }
    saveStateTimer = setTimeout(() => {
      writeStateToStorage();
      saveStateTimer = null;
    }, SAVE_STATE_DEBOUNCE_MS);
  }

  function writeStateToStorage() {
    if (!isStateDirty) {
      return;
    }
    const payload = {
      form: { ...state.form },
      areas: state.areas.map((area) => ({
        id: area.id,
        name: area.name,
        notes: area.notes,
        items: area.items,
      })),
      activeAreaId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    isStateDirty = false;
  }

  function flushPendingStateSave() {
    if (saveStateTimer) {
      clearTimeout(saveStateTimer);
      saveStateTimer = null;
    }
    writeStateToStorage();
  }

  function initTemplateControls() {
    if (!templateSelect) return;
    renderTemplateOptions();
    templateSelect.value = currentTemplateName;
    updateTemplateActionStates();
  }

  function initForm() {
    Object.entries(formFields).forEach(([key, element]) => {
      if (!element) return;
      if (state.form[key]) {
        element.value = state.form[key];
      }
      element.addEventListener("input", () => {
        state.form[key] = element.value;
        saveState();
        updateSummary();
      });
      if (key === "inspectionDate") {
        element.addEventListener("change", () => {
          handleInspectionDateChange(element.value);
        });
      }
    });

    if (!state.form.inspectionDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (formFields.inspectionDate) {
        formFields.inspectionDate.value = today;
      }
      state.form.inspectionDate = today;
      lastInspectionDateValue = today;
      saveState();
    } else {
      lastInspectionDateValue =
        (formFields.inspectionDate && formFields.inspectionDate.value) ||
        state.form.inspectionDate ||
        "";
    }
  }

  function attachEventHandlers() {
    refreshSummaryButton.addEventListener("click", () => {
      const validation = validateReport({ focusOnError: true });
      if (!validation.ok) {
        return;
      }
      updateSummary(validation.items);
      setStatusMessage("要約を更新しました。", "info");
    });

    copyReportButton.addEventListener("click", handleCopyReport);
    resetStatusButton.addEventListener("click", handleReset);
    applyConfigButton.addEventListener("click", handleApplyConfig);
    resetConfigButton.addEventListener("click", handleResetConfig);
    copyConfigButton.addEventListener("click", handleCopyConfig);
    if (templateSelect) {
      templateSelect.addEventListener("change", handleTemplateChange);
    }
    if (saveTemplateButton) {
      saveTemplateButton.addEventListener("click", handleSaveTemplate);
    }
    if (saveTemplateAsButton) {
      saveTemplateAsButton.addEventListener("click", handleSaveTemplateAs);
    }
    if (deleteTemplateButton) {
      deleteTemplateButton.addEventListener("click", handleDeleteTemplate);
    }
    if (addAreaButton) {
      addAreaButton.addEventListener("click", handleAddArea);
    }
    if (jumpToChecklistButton) {
      jumpToChecklistButton.addEventListener("click", handleChecklistShortcutToggle);
    }
  }

  function setupStatePersistenceGuards() {
    window.addEventListener("beforeunload", flushPendingStateSave);
    window.addEventListener("pagehide", flushPendingStateSave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushPendingStateSave();
      }
    });
  }

  function updateChecklistShortcutState() {
    if (!jumpToChecklistWrapper || !jumpToChecklistButton) return;
    const hasAreas = Array.isArray(state.areas) && state.areas.length > 0;
    if (!hasAreas) {
      closeChecklistShortcutMenu({ silent: true });
      jumpToChecklistWrapper.hidden = true;
      jumpToChecklistButton.setAttribute("aria-expanded", "false");
      jumpToChecklistButton.textContent = "点検項目へ";
      jumpToChecklistButton.removeAttribute("title");
      jumpToChecklistButton.removeAttribute("aria-label");
      return;
    }

    jumpToChecklistWrapper.hidden = false;
    jumpToChecklistButton.removeAttribute("aria-hidden");
    jumpToChecklistButton.removeAttribute("tabindex");
    jumpToChecklistButton.setAttribute("aria-expanded", isShortcutMenuOpen ? "true" : "false");
    jumpToChecklistButton.textContent = "点検項目へ";

    const areaIndex = state.areas.findIndex((area) => area.id === activeAreaId);
    const resolvedIndex = areaIndex >= 0 ? areaIndex : 0;
    const activeArea = state.areas[resolvedIndex];
    if (activeArea) {
      const areaLabel = getAreaDisplayName(activeArea, resolvedIndex);
      const descriptiveLabel = `${areaLabel}の点検項目一覧`;
      jumpToChecklistButton.setAttribute("aria-label", descriptiveLabel);
      jumpToChecklistButton.setAttribute("title", descriptiveLabel);
    } else {
      jumpToChecklistButton.setAttribute("aria-label", "点検項目一覧を開く");
      jumpToChecklistButton.removeAttribute("title");
    }

    renderChecklistShortcutMenu();
  }

  function handleChecklistShortcutToggle(event) {
    event?.preventDefault?.();
    if (isShortcutMenuOpen) {
      closeChecklistShortcutMenu();
      return;
    }
    if (!Array.isArray(state.areas) || state.areas.length === 0) {
      return;
    }
    openChecklistShortcutMenu();
  }

  function openChecklistShortcutMenu() {
    if (!jumpToChecklistWrapper || !jumpToChecklistMenu || !jumpToChecklistButton) {
      return;
    }
    if (isShortcutMenuOpen) {
      return;
    }
    isShortcutMenuOpen = true;
    jumpToChecklistWrapper.classList.add("is-open");
    jumpToChecklistMenu.hidden = false;
    jumpToChecklistButton.setAttribute("aria-expanded", "true");
    renderChecklistShortcutMenu();
    document.addEventListener("click", handleShortcutOutsideClick);
    document.addEventListener("keydown", handleShortcutKeydown);
  }

  function closeChecklistShortcutMenu({ silent = false } = {}) {
    if (!isShortcutMenuOpen) {
      return;
    }
    isShortcutMenuOpen = false;
    if (jumpToChecklistWrapper) {
      jumpToChecklistWrapper.classList.remove("is-open");
    }
    if (jumpToChecklistMenu) {
      jumpToChecklistMenu.hidden = true;
    }
    if (jumpToChecklistButton) {
      jumpToChecklistButton.setAttribute("aria-expanded", "false");
      if (!silent) {
        jumpToChecklistButton.focus();
      }
    }
    document.removeEventListener("click", handleShortcutOutsideClick);
    document.removeEventListener("keydown", handleShortcutKeydown);
  }

  function renderChecklistShortcutMenu() {
    if (!jumpToChecklistMenu || !Array.isArray(state.areas)) {
      return;
    }
    const previouslyFocusedId =
      isShortcutMenuOpen &&
      jumpToChecklistMenu.contains(document.activeElement) &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.areaId || null
        : null;

    jumpToChecklistMenu.innerHTML = "";

    if (state.areas.length === 0) {
      return;
    }

    state.areas.forEach((area, index) => {
      const label = getAreaDisplayName(area, index);
      const itemButton = document.createElement("button");
      itemButton.type = "button";
      itemButton.className = "floating-shortcut__item";
      itemButton.dataset.areaId = area.id;
      itemButton.textContent = label;
      itemButton.setAttribute("role", "menuitem");
      if (area.id === activeAreaId) {
        itemButton.classList.add("is-active");
      }
      itemButton.addEventListener("click", () => {
        handleShortcutItemSelect(area.id);
      });
      jumpToChecklistMenu.appendChild(itemButton);
    });

    if (isShortcutMenuOpen) {
      requestAnimationFrame(() => {
        const focusTargetId = previouslyFocusedId || activeAreaId;
        if (!jumpToChecklistMenu) return;
        const focusTarget =
          (focusTargetId &&
            jumpToChecklistMenu.querySelector(
              `.floating-shortcut__item[data-area-id="${focusTargetId}"]`
            )) ||
          jumpToChecklistMenu.querySelector(".floating-shortcut__item");
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus();
        }
      });
    }
  }

  function handleShortcutItemSelect(areaId) {
    closeChecklistShortcutMenu({ silent: true });
    if (!state.areas.some((area) => area.id === areaId)) {
      return;
    }
    setActiveArea(areaId, { scrollPanel: false });
    scrollActiveAreaIntoView({ highlight: true });
  }

  function handleShortcutOutsideClick(event) {
    if (!jumpToChecklistWrapper || !isShortcutMenuOpen) return;
    if (!(event.target instanceof Node)) {
      return;
    }
    if (!jumpToChecklistWrapper.contains(event.target)) {
      closeChecklistShortcutMenu({ silent: true });
    }
  }

  function handleShortcutKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChecklistShortcutMenu();
    }
  }

  function scrollActiveAreaIntoView({ highlight = false, skipScroll = false } = {}) {
    if (!areasContainer) return false;
    const activePanel =
      areasContainer.querySelector(".area-card.is-active") ||
      areasContainer.querySelector(".area-card");
    if (!activePanel) {
      return false;
    }
    if (!skipScroll) {
      activePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (highlight) {
      activePanel.classList.add("is-jump-highlight");
      if (jumpHighlightTimer) {
        window.clearTimeout(jumpHighlightTimer);
      }
      jumpHighlightTimer = window.setTimeout(() => {
        activePanel.classList.remove("is-jump-highlight");
      }, 1200);
    }
    return true;
  }

  function displayAppVersion() {
    if (!appVersionElement) return;
    const versionLabel = buildVersionLabel();
    if (!versionLabel) {
      appVersionElement.textContent = "";
      appVersionElement.removeAttribute("title");
      return;
    }
    appVersionElement.textContent = versionLabel;
    appVersionElement.setAttribute("title", `最終更新: ${versionLabel}`);
  }

  function buildVersionLabel() {
    const lastModified = document.lastModified;
    if (!lastModified) return "";
    const modifiedDate = new Date(lastModified);
    if (Number.isNaN(modifiedDate.getTime())) {
      return lastModified;
    }
    const twoDigits = (value) => String(value).padStart(2, "0");
    const year = modifiedDate.getFullYear();
    const month = twoDigits(modifiedDate.getMonth() + 1);
    const day = twoDigits(modifiedDate.getDate());
    const hours = twoDigits(modifiedDate.getHours());
    const minutes = twoDigits(modifiedDate.getMinutes());
    return `build ${year}.${month}.${day}-${hours}${minutes}`;
  }

  function renderAreas() {
    if (!areasContainer) return;
    areasContainer.innerHTML = "";

    if (state.areas.length === 0) {
      updateChecklistShortcutState();
      return;
    }

    if (!activeAreaId || !state.areas.some((area) => area.id === activeAreaId)) {
      activeAreaId = state.areas[0].id;
    }

    const tabList = document.createElement("div");
    tabList.className = "area-tabs";
    tabList.setAttribute("role", "tablist");

    const panels = document.createElement("div");
    panels.className = "area-panels";

    state.areas.forEach((area, index) => {
      const displayName = getAreaDisplayName(area, index);
      const tabId = `area-tab-${area.id}`;
      const panelId = `area-panel-${area.id}`;

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "area-tab";
      tab.dataset.tabFor = area.id;
      tab.setAttribute("role", "tab");
      tab.id = tabId;
      tab.setAttribute("aria-controls", panelId);
      tab.textContent = displayName;
      tab.addEventListener("click", () => {
        setActiveArea(area.id);
      });
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + direction + state.areas.length) % state.areas.length;
        const nextArea = state.areas[nextIndex];
        if (nextArea) {
          setActiveArea(nextArea.id, { focusTab: true });
        }
      });
      tabList.appendChild(tab);

      const card = document.createElement("article");
      card.className = "area-card";
      card.dataset.areaId = area.id;
      card.id = panelId;
      card.setAttribute("role", "tabpanel");
      card.setAttribute("aria-labelledby", tabId);

      const header = document.createElement("div");
      header.className = "area-card-header";

      const nameGroup = document.createElement("div");
      nameGroup.className = "area-name-group";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "点検箇所名";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "area-name-input";
      nameInput.placeholder = `点検箇所 ${index + 1}`;
      nameInput.value = area.name || "";
      nameInput.addEventListener("input", () => {
        updateAreaName(area.id, nameInput.value);
      });
      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameInput);
      header.appendChild(nameGroup);

      if (state.areas.length > 1) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "area-remove-button";
        removeButton.textContent = "削除";
        removeButton.addEventListener("click", () => handleRemoveArea(area.id));
        header.appendChild(removeButton);
      }

      card.appendChild(header);

      const notesGroup = document.createElement("div");
      notesGroup.className = "area-notes-group";
      const notesLabel = document.createElement("label");
      notesLabel.textContent = "箇所メモ (任意)";
      const notesTextarea = document.createElement("textarea");
      notesTextarea.className = "area-notes";
      notesTextarea.placeholder = "設備の状況や連絡事項を記入";
      notesTextarea.value = area.notes || "";
      notesTextarea.addEventListener("input", () => {
        updateAreaNotes(area.id, notesTextarea.value);
      });
      notesGroup.appendChild(notesLabel);
      notesGroup.appendChild(notesTextarea);
      card.appendChild(notesGroup);

      const areaChecklist = document.createElement("div");
      areaChecklist.className = "area-checklist";
      checklistSections.forEach((section) => {
        areaChecklist.appendChild(createChecklistGroup(area, section));
      });
      card.appendChild(areaChecklist);

      panels.appendChild(card);
    });

    areasContainer.appendChild(tabList);
    areasContainer.appendChild(panels);
    updateActiveAreaVisualState();
    updateChecklistShortcutState();
  }

  function setActiveArea(areaId, { focusTab = false, scrollPanel = true } = {}) {
    if (!areaId) return;
    const exists = state.areas.some((area) => area.id === areaId);
    if (!exists) return;
    if (activeAreaId === areaId) {
      updateActiveAreaVisualState({ focusTab, scrollPanel });
      return;
    }
    activeAreaId = areaId;
    updateActiveAreaVisualState({ focusTab, scrollPanel });
    saveState();
  }

  function updateActiveAreaVisualState({ focusTab = false, scrollPanel = false } = {}) {
    if (!areasContainer) return;

    let activeTabElement = null;
    let activePanelElement = null;
    Array.from(areasContainer.querySelectorAll(".area-tab")).forEach((tab) => {
      const isActive = tab.dataset.tabFor === activeAreaId;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive) {
        activeTabElement = tab;
      }
    });

    Array.from(areasContainer.querySelectorAll(".area-card")).forEach((panel) => {
      const isActive = panel.dataset.areaId === activeAreaId;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
      if (isActive) {
        activePanelElement = panel;
      }
    });

    if (scrollPanel && activePanelElement) {
      requestAnimationFrame(() => {
        activePanelElement.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (focusTab && activeTabElement) {
      activeTabElement.focus();
    }

    updateChecklistShortcutState();
  }

  function getAreaDisplayName(area, index) {
    const name = typeof area.name === "string" ? area.name.trim() : "";
    if (name) {
      return name;
    }
    return `点検箇所${index + 1}`;
  }

  function refreshAreaTabLabel(areaId) {
    if (!areasContainer) return;
    const index = state.areas.findIndex((item) => item.id === areaId);
    if (index === -1) return;
    const tab = areasContainer.querySelector(`.area-tab[data-tab-for="${areaId}"]`);
    if (tab) {
      tab.textContent = getAreaDisplayName(state.areas[index], index);
    }
  }

  function createChecklistGroup(area, section) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "checklist-group";

    const heading = document.createElement("h3");
    heading.textContent = section.title;
    sectionEl.appendChild(heading);

    section.items.forEach((item) => {
      const itemState = area.items[item.id] || {
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

      const note = document.createElement("textarea");
      note.className = "note-input";
      note.placeholder = item.notePlaceholder || "気づいた点を記入";
      note.value = itemState.note || "";
      note.dataset.areaId = area.id;
      note.dataset.itemId = item.id;
      note.addEventListener("input", () => {
        updateAreaItemState(area.id, item.id, { note: note.value });
        const currentStatus = getItemStatus(area.id, item.id);
        refreshIssueNoteState(note, currentStatus);
      });

      STATUS_ORDER.forEach((statusKey) => {
        const label = document.createElement("label");
        label.dataset.status = statusKey;

        const input = document.createElement("input");
        input.type = "radio";
        input.name = `status-${area.id}-${item.id}`;
        input.value = statusKey;
        input.checked = itemState.status === statusKey;

        input.addEventListener("change", () => {
          updateAreaItemState(area.id, item.id, { status: input.value });
          highlightActiveStatus(statusContainer, input.value);
          refreshIssueNoteState(note, input.value);
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
      refreshIssueNoteState(note, itemState.status);
      itemEl.appendChild(note);
      sectionEl.appendChild(itemEl);
    });

    return sectionEl;
  }

  function updateAreaName(areaId, value) {
    const area = state.areas.find((item) => item.id === areaId);
    if (!area) return;
    area.name = value;
    saveState();
    updateSummary();
    refreshAreaTabLabel(areaId);
    updateChecklistShortcutState();
  }

  function updateAreaNotes(areaId, value) {
    const area = state.areas.find((item) => item.id === areaId);
    if (!area) return;
    area.notes = value;
    saveState();
    updateSummary();
  }

  function updateAreaItemState(areaId, itemId, partial) {
    const area = state.areas.find((item) => item.id === areaId);
    if (!area) return;
    const current = area.items[itemId] || { status: "", note: "" };
    area.items[itemId] = { ...current, ...partial };
    if (
      !area.items[itemId].status &&
      (!area.items[itemId].note || area.items[itemId].note.trim() === "")
    ) {
      delete area.items[itemId];
    }
    saveState();
    updateSummary();
  }

  function handleAddArea() {
    const area = createArea(`点検箇所${state.areas.length + 1}`);
    state.areas.push(area);
    activeAreaId = area.id;
    saveState();
    renderAreas();
    updateActiveAreaVisualState({ scrollPanel: true });
    updateSummary();
    setStatusMessage(`点検箇所「${area.name}」を追加しました。`, "info");
    requestAnimationFrame(() => {
      if (!areasContainer) return;
      const input = areasContainer.querySelector(
        `[data-area-id="${area.id}"] .area-name-input`
      );
      if (input) {
        input.focus();
      }
    });
  }

  function handleRemoveArea(areaId) {
    if (state.areas.length <= 1) {
      setStatusMessage("点検箇所は最低 1 件必要です。", "error");
      return;
    }
    const targetIndex = state.areas.findIndex((area) => area.id === areaId);
    const target = targetIndex >= 0 ? state.areas[targetIndex] : null;
    const confirmed = window.confirm(
      `点検箇所「${target?.name || ""}」を削除しますか？`
    );
    if (!confirmed) return;
    state.areas = state.areas.filter((area) => area.id !== areaId);
    if (state.areas.length > 0 && areaId === activeAreaId) {
      const fallbackIndex = targetIndex > 0 ? targetIndex - 1 : 0;
      const fallbackArea = state.areas[Math.min(fallbackIndex, state.areas.length - 1)];
      activeAreaId = fallbackArea ? fallbackArea.id : state.areas[0].id;
    }
    saveState();
    renderAreas();
    updateSummary();
    setStatusMessage("点検箇所を削除しました。", "info");
  }

  function handleReset(event) {
    event?.preventDefault?.();
    resetAllAreas();
  }

  function resetAllAreas({ skipConfirm = false, statusMessage } = {}) {
    if (!skipConfirm) {
      const confirmed = window.confirm("すべての点検項目をリセットしますか？");
      if (!confirmed) return;
    }
    state.areas = state.areas.map((area) => ({
      ...area,
      items: {},
    }));
    saveState();
    renderAreas();
    updateSummary();
    setStatusMessage(
      statusMessage || "チェック項目をリセットしました。",
      "info"
    );
  }

  function handleInspectionDateChange(nextValue) {
    const newDate = nextValue || "";
    const previousDate = lastInspectionDateValue || "";
    if (newDate === previousDate) {
      return;
    }

    const hadPreviousDate = Boolean(previousDate);
    lastInspectionDateValue = newDate;

    if (!hadPreviousDate || !newDate) {
      return;
    }

    if (!hasAnyRecordedItems()) {
      return;
    }

    resetAllAreas({
      skipConfirm: true,
      statusMessage:
        "点検日が変更されたため、すべてのチェック項目をリセットしました。",
    });
  }

  function hasAnyRecordedItems() {
    return state.areas.some(
      (area) => area.items && Object.keys(area.items).length > 0
    );
  }

  function pruneAreasForTemplate() {
    const validIds = new Set(getAllItemIds(checklistSections));
    state.areas.forEach((area) => {
      const nextItems = {};
      Object.entries(area.items || {}).forEach(([itemId, itemState]) => {
        if (validIds.has(itemId)) {
          nextItems[itemId] = itemState;
        }
      });
      area.items = nextItems;
    });
    saveState();
  }

  function getAllItemIds(sections) {
    const ids = [];
    sections.forEach((section) => {
      section.items.forEach((item) => ids.push(item.id));
    });
    return ids;
  }

  function findFirstIncompleteChecklistItem() {
    if (!Array.isArray(state.areas) || state.areas.length === 0) {
      return null;
    }
    for (let areaIndex = 0; areaIndex < state.areas.length; areaIndex += 1) {
      const area = state.areas[areaIndex];
      const areaItems = area.items || {};
      for (const section of checklistSections) {
        if (!section || !Array.isArray(section.items)) {
          continue;
        }
        for (const item of section.items) {
          const itemState = areaItems[item.id];
          if (!itemState || !itemState.status) {
            return {
              area,
              areaId: area.id,
              areaIndex,
              itemId: item.id,
              itemTitle: item.title,
              sectionTitle: section.title,
            };
          }
        }
      }
    }
    return null;
  }

  function validateReport({ focusOnError = true, showStatusMessages = true } = {}) {
    if (form && typeof form.reportValidity === "function") {
      if (!form.reportValidity()) {
        if (showStatusMessages) {
          setStatusMessage("必須項目を入力してください。", "error");
        }
        return { ok: false, items: [] };
      }
    }

    const items = getCompletedItems();
    if (items.length === 0) {
      if (showStatusMessages) {
        setStatusMessage("各点検箇所のステータスを入力してください。", "error");
      }
      return { ok: false, items };
    }

    const incompleteItem = findFirstIncompleteChecklistItem();
    if (incompleteItem) {
      if (showStatusMessages) {
        const areaName = getAreaDisplayName(incompleteItem.area, incompleteItem.areaIndex);
        const locationLabel = `${incompleteItem.sectionTitle}／${incompleteItem.itemTitle}`;
        setStatusMessage(
          `点検箇所「${areaName}」の「${locationLabel}」のステータスを選択してください。`,
          "error"
        );
      }
      if (focusOnError) {
        focusChecklistStatusField(incompleteItem.areaId, incompleteItem.itemId);
      }
      return { ok: false, items };
    }

    const missingNote = items.find(
      (item) => item.status === ISSUE_STATUS && (!item.note || item.note.trim() === "")
    );
    if (missingNote) {
      if (showStatusMessages) {
        setStatusMessage("要対応を選択した項目にはコメントを入力してください。", "error");
      }
      if (focusOnError) {
        focusIssueNoteField(missingNote.areaId, missingNote.id);
      }
      return { ok: false, items };
    }

    return { ok: true, items };
  }

  async function handleCopyReport() {
    const validation = validateReport({ focusOnError: true });
    if (!validation.ok) {
      return;
    }

    const items = validation.items;
    updateSummary(items);

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

  function handleApplyConfig() {
    try {
      const parsed = parseConfigInput();
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
    currentTemplateName = DEFAULT_TEMPLATE_NAME;
    saveCurrentTemplateName(currentTemplateName);
    selectTemplate(DEFAULT_TEMPLATE_NAME, { silent: true });
    if (templateSelect) {
      templateSelect.value = DEFAULT_TEMPLATE_NAME;
    }
    updateTemplateActionStates();
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

  function highlightActiveStatus(container, activeStatus) {
    Array.from(container.querySelectorAll("label")).forEach((label) => {
      label.classList.toggle("is-active", label.dataset.status === activeStatus);
    });
  }

  function getCompletedItems() {
    const results = [];
    state.areas.forEach((area) => {
      checklistSections.forEach((section) => {
        section.items.forEach((item) => {
          const itemState = area.items[item.id];
          if (!itemState || !itemState.status) return;
          results.push({
            areaId: area.id,
            areaName: area.name || "",
            areaNotes: area.notes || "",
            section: section.title,
            id: item.id,
            title: item.title,
            status: itemState.status,
            note: itemState.note,
          });
        });
      });
    });
    return results;
  }

  function updateSummary(precomputedItems = null) {
    const items = Array.isArray(precomputedItems) ? precomputedItems : getCompletedItems();
    if (items.length === 0) {
      summarySection.innerHTML =
        '<div class="empty-state">各点検箇所のチェックを入力すると結果が表示されます。</div>';
      reportTextArea.value = buildReportText(items);
      return;
    }

    const { counts, areaMap } = summarizeCompletedItems(items);
    const total = items.length;
    const areaNames =
      state.areas.map((area, index) => area.name || `点検箇所${index + 1}`).join("、") ||
      "未入力";
    const infoBlock = `
      <div>
        <h3>点検結果概要</h3>
        <p>
          点検日: ${formatDate(state.form.inspectionDate)} /
          点検者: ${state.form.inspectorName || "未入力"} /
          点検箇所数: ${state.areas.length}
        </p>
        <p>点検箇所: ${escapeHtml(areaNames)}</p>
        <p>
          問題なし: ${counts.ok ?? 0} 件 /
          注意事項あり: ${counts.attention ?? 0} 件 /
          要対応: ${counts.issue ?? 0} 件 /
          記録件数: ${total} 件
        </p>
        ${
          state.form.globalNotes
            ? `<p>全体メモ: ${escapeHtml(state.form.globalNotes)}</p>`
            : ""
        }
      </div>
    `;

    const areaSummaries = state.areas
      .map((area, index) => {
        const areaItems = areaMap.get(area.id) || [];
        if (areaItems.length === 0) {
          return `
            <section class="summary-group area-summary">
              <h3>${escapeHtml(area.name || `点検箇所${index + 1}`)}</h3>
              ${
                area.notes
                  ? `<p>箇所メモ: ${escapeHtml(area.notes)}</p>`
                  : ""
              }
              <div class="empty-state">まだチェックが入力されていません。</div>
            </section>
          `;
        }

        const grouped = groupItemsBySection(areaItems);
        const itemsMarkup = grouped
          .map((group) => {
            const groupItems = group.items
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
                  ${groupItems}
                </div>
              </section>
            `;
          })
          .join("");

        return `
          <section class="summary-group area-summary">
            <h3>${escapeHtml(area.name || `点検箇所${index + 1}`)}</h3>
            ${
              area.notes
                ? `<p>箇所メモ: ${escapeHtml(area.notes)}</p>`
                : ""
            }
            ${itemsMarkup}
          </section>
        `;
      })
      .join("");

    summarySection.innerHTML = `${infoBlock}${areaSummaries}`;
    reportTextArea.value = buildReportText(items, areaMap);
  }

  function summarizeCompletedItems(items) {
    const counts = STATUS_ORDER.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    const areaMap = new Map();
    items.forEach((item) => {
      if (!areaMap.has(item.areaId)) {
        areaMap.set(item.areaId, []);
      }
      areaMap.get(item.areaId).push(item);
      if (Object.prototype.hasOwnProperty.call(counts, item.status)) {
        counts[item.status] += 1;
      }
    });
    return { counts, areaMap };
  }

  function groupItemsByArea(items) {
    const map = new Map();
    items.forEach((item) => {
      if (!map.has(item.areaId)) {
        map.set(item.areaId, []);
      }
      map.get(item.areaId).push(item);
    });
    return map;
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

  function getItemStatus(areaId, itemId) {
    const area = state.areas.find((entry) => entry.id === areaId);
    if (!area || !area.items) {
      return "";
    }
    const itemState = area.items[itemId];
    if (!itemState) {
      return "";
    }
    return itemState.status || "";
  }

  function refreshIssueNoteState(noteElement, status) {
    if (!noteElement) return;
    const isIssue = status === ISSUE_STATUS;
    noteElement.required = isIssue;
    if (!isIssue) {
      noteElement.classList.remove("is-required");
      noteElement.setCustomValidity("");
      return;
    }
    const needsComment = noteElement.value.trim() === "";
    noteElement.classList.toggle("is-required", needsComment);
    noteElement.setCustomValidity(needsComment ? ISSUE_NOTE_REQUIRED_MESSAGE : "");
  }

  function focusIssueNoteField(areaId, itemId) {
    if (!areasContainer) return;
    setActiveArea(areaId, { scrollPanel: true });
    requestAnimationFrame(() => {
      const selector = `[data-area-id="${areaId}"] .checklist-item[data-item-id="${itemId}"] .note-input`;
      const noteElement = areasContainer.querySelector(selector);
      if (!noteElement) return;
      refreshIssueNoteState(noteElement, ISSUE_STATUS);
      if (typeof noteElement.focus === "function") {
        try {
          noteElement.focus({ preventScroll: true });
        } catch (error) {
          noteElement.focus();
        }
      }
      if (typeof noteElement.reportValidity === "function") {
        noteElement.reportValidity();
      }
    });
  }

  function focusChecklistStatusField(areaId, itemId) {
    if (!areasContainer) return;
    setActiveArea(areaId, { scrollPanel: true });
    requestAnimationFrame(() => {
      const selector = `[data-area-id="${areaId}"] .checklist-item[data-item-id="${itemId}"] input[type="radio"]`;
      const target = areasContainer.querySelector(selector);
      if (!target || typeof target.focus !== "function") {
        return;
      }
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    });
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

  function formatDateForCsv(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateTimeForCsv(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  function toCsvValue(input) {
    if (input === null || input === undefined) return "";
    const value = String(input);
    if (value === "") return "";
    const escaped = value.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
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

  function buildReportText(items, areaMap = null) {
    const headers = [
      "点検日",
      "点検者",
      "点検箇所",
      "箇所メモ",
      "カテゴリ",
      "点検項目",
      "判定",
      "備考",
      "全体メモ",
      "記録作成時刻",
    ];
    const csvRows = [headers.map(toCsvValue).join(",")];
    if (!Array.isArray(items) || items.length === 0) {
      return csvRows.join("\n");
    }

    const groupedByArea = areaMap || groupItemsByArea(items);
    const inspectionDate = formatDateForCsv(state.form.inspectionDate);
    const inspectorName = state.form.inspectorName || "";
    const globalNotes = state.form.globalNotes || "";
    const generatedAt = formatDateTimeForCsv(new Date());

    state.areas.forEach((area, index) => {
      const areaItems = groupedByArea.get(area.id) || [];
      if (areaItems.length === 0) {
        return;
      }
      const areaName = area.name || `点検箇所${index + 1}`;
      const areaNotes = area.notes || "";
      areaItems.forEach((item) => {
        const row = [
          inspectionDate,
          inspectorName,
          areaName,
          areaNotes,
          item.section,
          item.title,
          STATUS_LABELS[item.status] || item.status,
          item.note || "",
          globalNotes,
          generatedAt,
        ];
        csvRows.push(row.map(toCsvValue).join(","));
      });
    });

    return csvRows.join("\n");
  }

  function applyChecklistConfiguration(sections, { persist } = { persist: true }) {
    checklistSections = cloneChecklist(sections);
    if (persist) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(checklistSections));
    }
    pruneAreasForTemplate();
    renderAreas();
    updateSummary();
    if (configInput) {
      configInput.value = stringifyChecklist(checklistSections);
    }
  }

  function fallbackCopy(element) {
    if (!element) return;
    element.focus();
    element.select();
    document.execCommand("copy");
    element.setSelectionRange(0, 0);
  }

  function setStatusMessage(message, level) {
    statusMessage.textContent = message;
    statusMessage.dataset.level = level;
  }
})();
