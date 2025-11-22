// Vocabulary trainer restored from v7 with fixes and requested behavior.
// Data structure in localStorage: { groups: [ {id,name,words:[{id,groupId,term,definition,intervalIndex,nextReview}] } ] }

const INTERVALS = [
  10 * 60 * 1000,
  3 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  90 * 24 * 60 * 60 * 1000,
];
const INTERVAL_NAMES = [
  "10 хв",
  "3 год",
  "1 день",
  "3 дні",
  "7 днів",
  "30 днів",
  "90 днів",
];

let data = JSON.parse(localStorage.getItem("vocabData") || "{}");
if (!data.groups) data.groups = [];

let currentEditGroupId = null;
let currentReviewQueue = [];
let reviewMode = "srs"; // 'srs' or 'free' or 'group-force'
let reviewGroupId = null;

function save() {
  localStorage.setItem("vocabData", JSON.stringify(data));
  renderGroups();
  updateStats();
}

// DOM refs
const statsBox = document.getElementById("statsBox");
const startSRS = document.getElementById("startSRS");
const startFree = document.getElementById("startFree");
const toggleGroupsBtn = document.getElementById("toggleGroupsBtn");
const groupsList = document.getElementById("groupsList");
const openCreate = document.getElementById("openCreate");

const groupModal = document.getElementById("groupModal");
const groupNameInput = document.getElementById("groupNameInput");
const groupWordsList = document.getElementById("groupWordsList");
const addWordBtn = document.getElementById("addWordBtn");
const saveGroupBtn = document.getElementById("saveGroupBtn");
const closeGroupModal = document.getElementById("closeGroupModal");
const deleteGroupBtn = document.getElementById("deleteGroupBtn");

const reviewModal = document.getElementById("reviewModal");
const reviewContent = document.getElementById("reviewContent");
const closeReviewBtn = document.getElementById("closeReviewBtn");
const repeatGroupBtn = document.getElementById("repeatGroupBtn");
const progressInner = document.getElementById("progressInner");

// add export/import UI to controls area (appends buttons to statsBox)
(function createExportImportUI() {
  const container = document.createElement("div");
  container.style.marginTop = "10px";
  container.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="startRandomBtn" class="small-btn">Перевірити випадково</button>
      <button id="exportAllBtn" class="small-btn">Експорт усіх груп (.zip)</button>
      <button id="importBtn" class="small-btn">Імпорт (.zip/.json)</button>
      <input id="importFileInput" type="file" accept=".zip,.json,application/zip,application/json" style="display:none"/>
    </div>
  `;
  statsBox.appendChild(container);

  document.getElementById("startRandomBtn").onclick = () => {
    reviewMode = "random";
    buildRandomQueue();
    openReview();
  };
  document.getElementById("exportAllBtn").onclick = () => {
    exportAllGroupsZip();
  };
  const importFileInput = document.getElementById("importFileInput");
  document.getElementById("importBtn").onclick = () => importFileInput.click();
  importFileInput.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    handleImportFile(f);
    importFileInput.value = "";
  };
})();

// init
renderGroups();
updateStats();
groupsList.classList.add("collapsed"); // collapsed by default

// events
startSRS.addEventListener("click", () => {
  reviewMode = "srs";
  buildSRSQueue();
  openReview();
});
startFree.addEventListener("click", () => {
  reviewMode = "free";
  buildFreeQueue();
  openReview();
});
toggleGroupsBtn.addEventListener("click", () => {
  groupsList.classList.toggle("collapsed");
  toggleGroupsBtn.textContent = groupsList.classList.contains("collapsed")
    ? "Групи ▼"
    : "Групи ▲";
});
openCreate.addEventListener("click", () => openGroupModal());

addWordBtn.addEventListener("click", () => {
  addWordToModal();
});
saveGroupBtn.addEventListener("click", () => {
  saveGroupFromModal();
});
closeGroupModal.addEventListener("click", () => closeGroupModalFunc());
deleteGroupBtn.addEventListener("click", () => {
  if (currentEditGroupId == null) return;
  if (confirm("Видалити групу?")) {
    data.groups = data.groups.filter((g) => g.id !== currentEditGroupId);
    currentEditGroupId = null;
    save();
    closeGroupModalFunc();
  }
});

closeReviewBtn.addEventListener("click", () => closeReview());
repeatGroupBtn.addEventListener("click", () => {
  // when pressed inside review modal, repeat whole group regardless of time
  const gid = reviewGroupId != null ? reviewGroupId : currentEditGroupId;
  if (gid != null) {
    buildGroupForceQueue(gid);
    openReview(); // restart review modal content
  } else {
    alert("Виберіть групу для повторення");
  }
});

// functions

function renderGroups() {
  groupsList.innerHTML = "";
  if (data.groups.length === 0) {
    groupsList.innerHTML =
      '<div class="small-muted">Немає груп. Додайте нову групу.</div>';
    return;
  }
  data.groups.forEach((g) => {
    const div = document.createElement("div");
    div.className = "group-item";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div><b>${escapeHtml(g.name)}</b></div>
          <div class="small-muted">Слів: ${g.words.length}</div>
        </div>
        <div class="group-controls">
          <button class="small-btn small-open" data-id="${
            g.id
          }">Відкрити</button>
          <button class="small-btn small-edit" data-id="${
            g.id
          }">Редагувати</button>
          <button class="small-btn small-delete" data-id="${
            g.id
          }">Видалити</button>
        </div>
      </div>
    `;
    groupsList.appendChild(div);
  });

  // attach handlers
  Array.from(document.getElementsByClassName("small-open")).forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.getAttribute("data-id"));
      openGroup(id);
    };
  });
  Array.from(document.getElementsByClassName("small-edit")).forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.getAttribute("data-id"));
      openGroupModal(id);
    };
  });
  Array.from(document.getElementsByClassName("small-delete")).forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.getAttribute("data-id"));
      if (confirm("Видалити групу?")) {
        data.groups = data.groups.filter((x) => x.id !== id);
        save();
      }
    };
  });
}

function updateStats() {
  // compute stats: today, total, learned, stage distribution, this month added
  let total = 0,
    today = 0,
    learned = 0;
  let monthAdded = 0;
  let stageCounts = new Array(INTERVALS.length).fill(0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  data.groups.forEach((g) => {
    total += g.words.length;
    g.words.forEach((w) => {
      stageCounts[w.intervalIndex] = (stageCounts[w.intervalIndex] || 0) + 1;
      if (Date.now() >= w.nextReview) today++;
      if (w.intervalIndex === INTERVALS.length - 1) learned++;
      if (w.createdAt && w.createdAt >= monthStart) monthAdded++;
    });
  });

  let html = `<div><strong>Сьогодні:</strong> ${today}</div>
              <div><strong>Всього слів:</strong> ${total}</div>
              <div><strong>Додано цього місяця:</strong> ${monthAdded}</div>
              <div><strong>Вивчено (фінал):</strong> ${learned}</div>
              <div class="small-muted" style="margin-top:8px"><strong>Етапи:</strong></div>
              ${stageCounts
                .map(
                  (c, i) =>
                    `<div class="small-muted">${INTERVAL_NAMES[i]}: ${c}</div>`
                )
                .join("")}`;
  statsBox.innerHTML = html;
  // re-add export/import UI if lost (without exportCurrentGroupBtn)
  if (!document.getElementById("startRandomBtn")) {
    (function createExportImportUIAgain() {
      const container = document.createElement("div");
      container.style.marginTop = "10px";
      container.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="startRandomBtn" class="small-btn">Перевірити випадково</button>
          <button id="exportAllBtn" class="small-btn">Експорт усіх груп (.zip)</button>
          <button id="importBtn" class="small-btn">Імпорт (.zip/.json)</button>
          <input id="importFileInput" type="file" accept=".zip,.json,application/zip,application/json" style="display:none"/>
        </div>
      `;
      statsBox.appendChild(container);
      document.getElementById("startRandomBtn").onclick = () => {
        reviewMode = "random";
        buildRandomQueue();
        openReview();
      };
      document.getElementById("exportAllBtn").onclick = () => {
        exportAllGroupsZip();
      };
      const importFileInput = document.getElementById("importFileInput");
      document.getElementById("importBtn").onclick = () =>
        importFileInput.click();
      importFileInput.onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        handleImportFile(f);
        importFileInput.value = "";
      };
    })();
  }
}

function openGroup(id) {
  // open group overlay showing words, allow editing; ensure delete group button last
  const g = data.groups.find((x) => x.id === id);
  currentEditGroupId = id;
  document.getElementById("modalTitle").textContent = "Група: " + g.name;
  groupNameInput.value = g.name;
  renderGroupWordsInModal(g);
  groupModal.classList.remove("hidden");
}

function openGroupModal(id = null) {
  currentEditGroupId = id;
  if (id == null) {
    document.getElementById("modalTitle").textContent = "Нова група";
    groupNameInput.value = "";
    groupWordsList.innerHTML = '<div class="small-muted">Поки немає слів</div>';
    deleteGroupBtn.style.display = "none";
  } else {
    const g = data.groups.find((x) => x.id === id);
    document.getElementById("modalTitle").textContent = "Редагувати групу";
    groupNameInput.value = g.name;
    renderGroupWordsInModal(g);
    deleteGroupBtn.style.display = "block";
  }
  groupModal.classList.remove("hidden");
}

function closeGroupModalFunc() {
  groupModal.classList.add("hidden");
  currentEditGroupId = null;
}

function renderGroupWordsInModal(group) {
  if (!group || !group.words) {
    groupWordsList.innerHTML = "";
    return;
  }
  groupWordsList.innerHTML = "";
  group.words.forEach((w) => {
    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML = `<div class="word-text"><b>${escapeHtml(
      w.term
    )}</b> — ${escapeHtml(w.definition)}</div>
                     <div class="word-actions">
                       <span class="stage-badge">${
                         INTERVAL_NAMES[w.intervalIndex]
                       }</span>
                       <button class="small-btn" onclick="editWord(${
                         group.id
                       }, ${w.id})">Ред.</button>
                       <button class="small-btn" onclick="deleteWordFromModal(${
                         group.id
                       }, ${w.id})">X</button>
                     </div>`;
    groupWordsList.appendChild(row);
  });
}

function addWordToModal() {
  const term = prompt("Слово (EN):");
  if (!term) return;
  const def = prompt("Переклад (UA):");
  if (!def) return;
  if (currentEditGroupId == null) {
    // creating new group but adding words—create temporary group in memory
    let tempId = Date.now();
    data.groups.push({
      id: tempId,
      name: groupNameInput.value || "Нова група",
      words: [],
    });
    currentEditGroupId = tempId;
  }
  const g = data.groups.find((x) => x.id === currentEditGroupId);
  g.words.push({
    id: Date.now(),
    groupId: g.id,
    term: term.trim(),
    definition: def.trim(),
    intervalIndex: 0,
    nextReview: Date.now() + INTERVALS[0],
    createdAt: Date.now(),
  });
  save();
  renderGroupWordsInModal(g);
}

function editWord(groupId, wordId) {
  const g = data.groups.find((x) => x.id === groupId);
  const w = g.words.find((x) => x.id === wordId);
  const newTerm = prompt("Слово (EN):", w.term);
  if (!newTerm) return;
  const newDef = prompt("Переклад (UA):", w.definition);
  if (!newDef) return;
  w.term = newTerm.trim();
  w.definition = newDef.trim();
  // keep createdAt unchanged
  save();
  renderGroupWordsInModal(g);
}

function deleteWordFromModal(groupId, wordId) {
  if (!confirm("Видалити слово?")) return;
  const g = data.groups.find((x) => x.id === groupId);
  g.words = g.words.filter((x) => x.id !== wordId);
  save();
  renderGroupWordsInModal(g);
}

function saveGroupFromModal() {
  const name = groupNameInput.value.trim();
  if (!name) {
    alert("Введіть назву групи");
    return;
  }
  if (currentEditGroupId == null) {
    // new group
    const newId = Date.now();
    data.groups.push({ id: newId, name: name, words: [] });
    currentEditGroupId = newId;
  } else {
    const g = data.groups.find((x) => x.id === currentEditGroupId);
    g.name = name;
  }
  save();
  closeGroupModalFunc();
}

// REVIEW logic

function buildSRSQueue() {
  currentReviewQueue = [];
  reviewGroupId = null;
  data.groups.forEach((g) => {
    g.words.forEach((w) => {
      if (Date.now() >= w.nextReview) {
        // додаємо напрямок перевірки (toUA = EN→UA, toEN = UA→EN)
        currentReviewQueue.push(
          Object.assign({}, w, { dir: Math.random() < 0.5 ? "toUA" : "toEN" })
        );
      }
    });
  });
}

function buildFreeQueue() {
  currentReviewQueue = [];
  reviewGroupId = null;
  data.groups.forEach((g) => {
    g.words.forEach((w) => {
      currentReviewQueue.push(
        Object.assign({}, w, { dir: Math.random() < 0.5 ? "toUA" : "toEN" })
      );
    });
  });
}

function buildGroupForceQueue(groupId) {
  currentReviewQueue = [];
  reviewGroupId = groupId;
  const g = data.groups.find((x) => x.id === groupId);
  if (!g) return;
  g.words.forEach((w) =>
    currentReviewQueue.push(
      Object.assign({}, w, { dir: Math.random() < 0.5 ? "toUA" : "toEN" })
    )
  );
}

function buildRandomQueue() {
  currentReviewQueue = [];
  reviewGroupId = null;
  data.groups.forEach((g) => {
    g.words.forEach((w) => {
      currentReviewQueue.push(
        Object.assign({}, w, { dir: Math.random() < 0.5 ? "toUA" : "toEN" })
      );
    });
  });
  // shuffle (Fisher-Yates)
  for (let i = currentReviewQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentReviewQueue[i], currentReviewQueue[j]] = [
      currentReviewQueue[j],
      currentReviewQueue[i],
    ];
  }
}

function openReview() {
  if (!currentReviewQueue || currentReviewQueue.length === 0) {
    alert("Немає слів для повторення");
    return;
  }
  reviewModal.classList.remove("hidden");
  renderNextReview();
}

function closeReview() {
  reviewModal.classList.add("hidden");
  reviewGroupId = null;
}

function renderNextReview() {
  if (currentReviewQueue.length === 0) {
    reviewContent.innerHTML = `<div>Готово!</div>
      <div style="margin-top:10px">
        <button id="restartBtn" class="green">Почати знову</button>
        <button id="closeDoneBtn" style="margin-left:8px">Закрити</button>
      </div>`;
    progressInner.style.width = "100%";
    updateStats();

    const restartBtn = document.getElementById("restartBtn");
    if (restartBtn) {
      restartBtn.onclick = () => {
        // rebuild same type of queue and restart
        if (reviewMode === "random") buildRandomQueue();
        else if (reviewMode === "free") buildFreeQueue();
        else buildSRSQueue();
        openReview();
      };
    }
    document.getElementById("closeDoneBtn").onclick = () => closeReview();
    return;
  }
  const w = currentReviewQueue.pop();
  const g = data.groups.find((x) => x.id === w.groupId) || { name: "?" };
  // direction: 'toUA' means показати EN і очікувати UA (старе поведення)
  const dir = w.dir || (Math.random() < 0.5 ? "toUA" : "toEN");
  // set reviewGroupId so repeatGroupBtn can restart current group
  reviewGroupId = w.groupId;

  // determine what to show and what is expected
  const showText = dir === "toUA" ? w.term : w.definition;
  const expectedLabel =
    dir === "toUA" ? "Правильна відповідь (UA)" : "Правильна відповідь (EN)";

  reviewContent.innerHTML = `
    <div><b>${escapeHtml(showText)}</b></div>
    <div class="small-muted">Група: <b>${escapeHtml(g.name)}</b></div>
    <div class="small-muted">Етап: ${INTERVAL_NAMES[w.intervalIndex]}</div>
    <div style="margin-top:8px">
      <input id="answerInput" placeholder="Ваш переклад" style="width:100%;padding:8px" />
    </div>
    <div style="margin-top:8px">
      <button id="checkBtn" class="green" disabled style="padding:6px 8px;font-size:13px">Перевірити</button>
    </div>
  `;
  // update progress
  const total = currentReviewQueue.length + 1;
  const done = 1;
  const pct = Math.round((done / total) * 100);
  progressInner.style.width = pct + "%";

  const answerInputEl = document.getElementById("answerInput");
  const checkBtnEl = document.getElementById("checkBtn");

  // enable check only when input not empty
  answerInputEl.addEventListener("input", () => {
    checkBtnEl.disabled = answerInputEl.value.trim() === "";
  });

  const applySrsAndSave = (origWord, considerCorrect) => {
    if (reviewMode === "srs" && origWord) {
      if (considerCorrect)
        origWord.intervalIndex = Math.min(
          origWord.intervalIndex + 1,
          INTERVALS.length - 1
        );
      else origWord.intervalIndex = Math.max(origWord.intervalIndex - 1, 0);
      origWord.nextReview = Date.now() + INTERVALS[origWord.intervalIndex];
      save();
    }
  };

  checkBtnEl.onclick = () => {
    const ans = answerInputEl.value.trim();
    if (ans === "") {
      alert("Введіть вашу відповідь");
      return;
    }

    // expected value depends on dir
    const expected = dir === "toUA" ? w.definition : w.term;
    const ok = fuzzyMatch(ans, expected);

    // show result including correct answer always; if incorrect, allow forcing correct
    reviewContent.innerHTML = `
      <div><b>${escapeHtml(showText)}</b></div>
      <div class="small-muted">Група: <b>${escapeHtml(g.name)}</b></div>
      <div style="margin-top:8px"><strong>Ваша відповідь:</strong> ${escapeHtml(
        ans || "-"
      )}</div>
      <div style="margin-top:6px"><strong>${escapeHtml(
        expectedLabel
      )}:</strong> ${escapeHtml(expected)}</div>
      <div style="margin-top:8px;color:${ok ? "green" : "red"}"><strong>${
      ok ? "OK" : "Потрібно"
    }</strong></div>
      <div style="margin-top:10px">
        <button id="nextBtn" class="green" style="padding:6px 8px;font-size:13px;margin-right:6px">Далі</button>
        ${
          ok
            ? ""
            : '<button id="forceCorrectBtn" class="small-btn" style="padding:6px 8px;font-size:13px">Вважати правильним</button>'
        }
      </div>
    `;

    const origGroup = data.groups.find((x) => x.id === w.groupId);
    const origWord = origGroup
      ? origGroup.words.find((x) => x.id === w.id)
      : null;

    document.getElementById("nextBtn").onclick = () => {
      // apply SRS changes: ok => up, not ok => down
      applySrsAndSave(origWord, ok);
      renderNextReview();
    };

    const forceBtn = document.getElementById("forceCorrectBtn");
    if (forceBtn) {
      forceBtn.onclick = () => {
        // treat as correct despite fuzzyMatch failure
        applySrsAndSave(origWord, true);
        renderNextReview();
      };
    }
  };
}

// Export / Import helpers (uses JSZip if available)
function ensureJsZipLoaded(callback) {
  if (window.JSZip) return callback();
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js";
  s.onload = () => callback();
  s.onerror = () => {
    alert(
      "Не вдалося завантажити бібліотеку JSZip. Експорт/імпорт .zip не працюватиме. Спробуйте експортувати в .json."
    );
    callback();
  };
  document.head.appendChild(s);
}

function exportGroupZip(groupId) {
  const g = data.groups.find((x) => x.id === groupId);
  if (!g) return alert("Групу не знайдено");
  ensureJsZipLoaded(() => {
    if (window.JSZip) {
      const zip = new JSZip();
      zip.file(
        `${sanitizeFilename(g.name || "group")}_${g.id}.json`,
        JSON.stringify(g, null, 2)
      );
      zip.generateAsync({ type: "blob" }).then((content) => {
        downloadBlob(
          content,
          `${sanitizeFilename(g.name || "group")}_${g.id}.zip`
        );
      });
    } else {
      // fallback: download JSON
      const blob = new Blob([JSON.stringify(g, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `${sanitizeFilename(g.name || "group")}_${g.id}.json`);
    }
  });
}

function exportAllGroupsZip() {
  if (data.groups.length === 0) return alert("Немає груп для експорту");
  ensureJsZipLoaded(() => {
    if (window.JSZip) {
      const zip = new JSZip();
      data.groups.forEach((g) => {
        zip.file(
          `${sanitizeFilename(g.name || "group")}_${g.id}.json`,
          JSON.stringify(g, null, 2)
        );
      });
      zip.generateAsync({ type: "blob" }).then((content) => {
        downloadBlob(content, `vocab_groups_${Date.now()}.zip`);
      });
    } else {
      // fallback: single JSON containing all groups
      const blob = new Blob(
        [JSON.stringify({ groups: data.groups }, null, 2)],
        { type: "application/json" }
      );
      downloadBlob(blob, `vocab_groups_${Date.now()}.json`);
    }
  });
}

function handleImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    ensureJsZipLoaded(() => {
      if (!window.JSZip) {
        alert("JSZip не завантажено — неможливо імпортувати zip");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        JSZip.loadAsync(ev.target.result).then((z) => {
          const files = Object.keys(z.files);
          const promises = files.map((fn) =>
            z
              .file(fn)
              .async("string")
              .then((txt) => ({ fn, txt }))
          );
          Promise.all(promises).then((arr) => {
            arr.forEach((f) => {
              try {
                const obj = JSON.parse(f.txt);
                importGroupObject(obj);
              } catch (e) {
                console.warn("Не вдалося розпарсити файл в zip:", f.fn, e);
              }
            });
            save();
            alert("Імпорт завершено");
          });
        });
      };
      reader.readAsArrayBuffer(file);
    });
  } else {
    // assume json
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        // if top-level contains groups array, import each; otherwise treat as single group
        if (obj.groups && Array.isArray(obj.groups)) {
          obj.groups.forEach((g) => importGroupObject(g));
        } else importGroupObject(obj);
        save();
        alert("Імпорт завершено");
      } catch (e) {
        alert("Помилка при читанні JSON: " + e.message);
      }
    };
    reader.readAsText(file);
  }
}

function importGroupObject(g) {
  if (!g || !g.name) return;
  // if incoming id collides with existing group, assign new id
  let newGroupId = g.id;
  if (data.groups.find((x) => x.id === newGroupId)) {
    newGroupId = Date.now() + Math.floor(Math.random() * 1000);
  }
  const newGroup = {
    id: newGroupId,
    name: g.name,
    words: [],
  };
  if (Array.isArray(g.words)) {
    g.words.forEach((w) => {
      let newWordId = w.id || Date.now() + Math.floor(Math.random() * 100000);
      // ensure unique word id across all groups
      while (
        data.groups.some((gg) => gg.words.some((ww) => ww.id === newWordId)) ||
        newGroup.words.some((ww) => ww.id === newWordId)
      ) {
        newWordId = Date.now() + Math.floor(Math.random() * 100000);
      }
      const nw = {
        id: newWordId,
        groupId: newGroup.id,
        term: w.term || "",
        definition: w.definition || "",
        intervalIndex:
          typeof w.intervalIndex === "number" ? w.intervalIndex : 0,
        nextReview:
          typeof w.nextReview === "number"
            ? w.nextReview
            : Date.now() + INTERVALS[0],
        createdAt: typeof w.createdAt === "number" ? w.createdAt : Date.now(),
      };
      newGroup.words.push(nw);
    });
  }
  data.groups.push(newGroup);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_");
}

// utility functions

function fuzzyMatch(a, b) {
  a = String(a || "")
    .toLowerCase()
    .trim();
  b = String(b || "")
    .toLowerCase()
    .trim();
  if (a === b) return true;

  // if expected contains multiple variants separated by comma/;/slash, try each
  const variants = b
    .split(/[;,\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  // allow optional leading "to " in english variants
  const normalize = (s) => s.replace(/^to\s+/i, "").trim();

  for (let v of variants) {
    const nv = normalize(v);
    if (a === nv) return true;
    // quick length check
    if (Math.abs(a.length - nv.length) > 2) continue;

    // compute Levenshtein distance and allow distance <= 1 (tolerant small typos)
    function levenshtein(s, t) {
      const m = s.length,
        n = t.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const d = Array.from({ length: m + 1 }, () => new Array(n + 1));
      for (let i = 0; i <= m; i++) d[i][0] = i;
      for (let j = 0; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = s[i - 1] === t[j - 1] ? 0 : 1;
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            d[i][j - 1] + 1,
            d[i - 1][j - 1] + cost
          );
        }
      }
      return d[m][n];
    }

    if (levenshtein(a, nv) <= 1) return true;
  }

  return false;
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
