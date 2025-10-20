(() => {
  const STORAGE_KEY = "facility-safety-checklist:v1";
  const STATUS_LABELS = {
    ok: "適合",
    attention: "注意",
    issue: "不適合",
  };
  const STATUS_ORDER = ["ok", "attention", "issue"];

  const CHECKLIST_SECTIONS = [
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

  const refreshSummaryButton = document.getElementById("refresh-summary");
  const composeEmailButton = document.getElementById("compose-email");
  const resetStatusButton = document.getElementById("reset-status");

  const formFields = {
    facilityName: document.getElementById("facility-name"),
    facilityLocation: document.getElementById("facility-location"),
    inspectionDate: document.getElementById("inspection-date"),
    inspectorName: document.getElementById("inspector-name"),
    recipientEmail: document.getElementById("recipient-email"),
    globalNotes: document.getElementById("global-notes"),
  };

  let state = {
    form: {
      facilityName: "",
      facilityLocation: "",
      inspectionDate: "",
      inspectorName: "",
      recipientEmail: "",
      globalNotes: "",
    },
    items: {},
  };

  init();

  function init() {
    loadState();
    initForm();
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

    composeEmailButton.addEventListener("click", handleComposeEmail);
    resetStatusButton.addEventListener("click", handleReset);
  }

  function renderChecklist() {
    checklistContainer.innerHTML = "";

    CHECKLIST_SECTIONS.forEach((section) => {
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

  function highlightActiveStatus(container, activeStatus) {
    Array.from(container.querySelectorAll("label")).forEach((label) => {
      label.classList.toggle("is-active", label.dataset.status === activeStatus);
    });
  }

  function handleComposeEmail() {
    if (!form.reportValidity()) {
      setStatusMessage("必須項目を入力してください。", "error");
      return;
    }

    const { recipientEmail } = state.form;
    if (!recipientEmail || !validateEmail(recipientEmail)) {
      setStatusMessage("担当者メールアドレスの形式を確認してください。", "error");
      formFields.recipientEmail.focus();
      return;
    }

    const items = getCompletedItems();
    if (items.length === 0) {
      setStatusMessage("チェック項目にステータスを入力してください。", "error");
      return;
    }

    updateSummary();

    const subject = buildEmailSubject();
    const body = buildEmailBody(items);
    const mailto = `mailto:${encodeURIComponent(
      recipientEmail
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
    setStatusMessage("メール作成ウィンドウを開きます。", "success");
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function getCompletedItems() {
    return CHECKLIST_SECTIONS.flatMap((section) =>
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

  function buildEmailSubject() {
    const facility = state.form.facilityName || "施設名未入力";
    const date = formatDate(state.form.inspectionDate);
    return `施設安全点検結果 ${facility} (${date})`;
  }

  // Assemble a plain text summary that is easy to copy into email clients.
  function buildEmailBody(items) {
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

  function setStatusMessage(message, level) {
    statusMessage.textContent = message;
    statusMessage.dataset.level = level;
  }
})();
