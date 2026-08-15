// Vocabulary Trainer — SRS + active recall
//
// Типи повторення:
// 1. Значення → слово       45%
// 2. Ситуація → слово       45%
// 3. Слово → значення       10%
//
// Інтервали:
// 10 хв → 1 день → 3 дні → 7 днів → 14 днів → 30 днів → 60 днів → 120 днів

const INTERVALS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  60 * 24 * 60 * 60 * 1000,
  120 * 24 * 60 * 60 * 1000,
];

const INTERVAL_NAMES = [
  "10 хв",
  "1 день",
  "3 дні",
  "7 днів",
  "14 днів",
  "30 днів",
  "60 днів",
  "120 днів",
];

const REVIEW_TYPE_NAMES = {
  meaning_to_word: "Значення → слово",
  context_to_word: "Ситуація → слово",
  word_to_meaning: "Слово → значення",
};

let data = JSON.parse(localStorage.getItem("vocabData") || "{}");

if (!data.groups) {
  data.groups = [];
}

let currentEditGroupId = null;
let currentReviewQueue = [];
let reviewMode = "srs";
let reviewGroupId = null;
let groupSortMode = "date_desc";
let reviewTotal = 0;

const statsBox = document.getElementById("statsBox");
const groupsList = document.getElementById("groupsList");
const startSRS = document.getElementById("startSRS");
const startFree = document.getElementById("startFree");
const toggleGroupsBtn = document.getElementById("toggleGroupsBtn");
const openCreate = document.getElementById("openCreate");
const addWordBtn = document.getElementById("addWordBtn");
const saveGroupBtn = document.getElementById("saveGroupBtn");
const closeGroupModal = document.getElementById("closeGroupModal");
const deleteGroupBtn = document.getElementById("deleteGroupBtn");
const groupNameInput = document.getElementById("groupNameInput");
const groupWordsList = document.getElementById("groupWordsList");
const modalTitle = document.getElementById("modalTitle");
const groupModal = document.getElementById("groupModal");
const reviewModal = document.getElementById("reviewModal");
const reviewContent = document.getElementById("reviewContent");
const closeReviewBtn = document.getElementById("closeReviewBtn");
const repeatGroupBtn = document.getElementById("repeatGroupBtn");
const progressInner = document.getElementById("progressInner");

// ============================================================
// SAVE / MIGRATION
// ============================================================

function save() {
  try {
    localStorage.setItem("vocabData", JSON.stringify(data));
  } catch (e) {
    console.error("Save error:", e);
  }

  renderGroups();
  updateStats();
}

function migrateData() {
  data.groups.forEach((g) => {
    if (!Array.isArray(g.words)) {
      g.words = [];
    }

    if (!g.createdAt) {
      g.createdAt = Date.now();
    }

    g.words.forEach((w) => {
      if (typeof w.intervalIndex !== "number") {
        w.intervalIndex = 0;
      }

      if (typeof w.nextReview !== "number") {
        w.nextReview = Date.now() + INTERVALS[w.intervalIndex];
      }

      if (typeof w.context !== "string") {
        w.context = "";
      }

      if (typeof w.association !== "string") {
        w.association = "";
      }

      if (!w.createdAt) {
        w.createdAt = Date.now();
      }
    });
  });

  localStorage.setItem("vocabData", JSON.stringify(data));
}

migrateData();

// ============================================================
// HELPERS
// ============================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function escapeHtml(s) {
  if (!s) {
    return "";
  }

  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// REVIEW TYPE
// ============================================================

function chooseReviewType(w) {
  const hasContext = !!String(w.context || "").trim();

  const r = Math.random();

  if (hasContext) {
    if (r < 0.45) {
      return "meaning_to_word";
    }

    if (r < 0.9) {
      return "context_to_word";
    }

    return "word_to_meaning";
  }

  // Якщо прикладу немає, замість нього використовуємо
  // значення → слово.
  return r < 0.9 ? "meaning_to_word" : "word_to_meaning";
}

function makeCard(w) {
  return {
    ...w,
    reviewType: chooseReviewType(w),
  };
}

// ============================================================
// REVIEW QUEUES
// ============================================================

function buildSRSQueue() {
  currentReviewQueue = [];
  reviewGroupId = null;

  data.groups.forEach((g) => {
    (g.words || []).forEach((w) => {
      if (Date.now() >= (w.nextReview || 0)) {
        currentReviewQueue.push(makeCard(w));
      }
    });
  });

  shuffle(currentReviewQueue);

  reviewTotal = currentReviewQueue.length;
}

function buildFreeQueue() {
  currentReviewQueue = [];
  reviewGroupId = null;

  data.groups.forEach((g) => {
    (g.words || []).forEach((w) => {
      currentReviewQueue.push(makeCard(w));
    });
  });

  shuffle(currentReviewQueue);

  reviewTotal = currentReviewQueue.length;
}

function buildRandomQueue() {
  buildFreeQueue();
  reviewMode = "random";
}

function buildGroupForceQueue(groupId) {
  currentReviewQueue = [];
  reviewGroupId = groupId;

  const g = data.groups.find((x) => x.id === groupId);

  if (!g) {
    return;
  }

  (g.words || []).forEach((w) => {
    currentReviewQueue.push(makeCard(w));
  });

  shuffle(currentReviewQueue);

  reviewTotal = currentReviewQueue.length;
  reviewMode = "group-force";
}

// ============================================================
// REVIEW
// ============================================================

function openReview() {
  if (!currentReviewQueue.length) {
    alert(
      reviewMode === "srs"
        ? "Немає слів для повторення. Усі слова зараз мають майбутній час повторення."
        : "Немає слів для повторення.",
    );

    return;
  }

  reviewModal.classList.remove("hidden");

  renderNextReview();
}

function closeReview() {
  reviewModal.classList.add("hidden");
  reviewGroupId = null;
}

function getWordAndGroup(card) {
  const g = data.groups.find((x) => x.id === card.groupId);

  const w = g ? g.words.find((x) => x.id === card.id) : null;

  return {
    g,
    w,
  };
}

function renderNextReview() {
  if (!currentReviewQueue.length) {
    reviewContent.innerHTML = `
      <div style="font-size:22px;font-weight:700">
        Готово! 🎉
      </div>

      <div style="margin-top:8px">
        Повторення завершено.
      </div>

      <div style="margin-top:10px">
        <button id="restartBtn" class="green">
          Почати знову
        </button>

        <button id="closeDoneBtn"
                class="gray"
                style="margin-left:8px">
          Закрити
        </button>
      </div>
    `;

    progressInner.style.width = "100%";

    updateStats();

    const restartBtn = document.getElementById("restartBtn");

    if (restartBtn) {
      restartBtn.onclick = () => {
        if (reviewMode === "srs") {
          buildSRSQueue();
        } else if (reviewMode === "free") {
          buildFreeQueue();
        } else if (reviewMode === "random") {
          buildRandomQueue();
        } else if (reviewMode === "group-force" && reviewGroupId != null) {
          buildGroupForceQueue(reviewGroupId);
        }

        if (currentReviewQueue.length) {
          renderNextReview();
        } else {
          closeReview();
        }
      };
    }

    const closeDoneBtn = document.getElementById("closeDoneBtn");

    if (closeDoneBtn) {
      closeDoneBtn.onclick = closeReview;
    }

    return;
  }

  const card = currentReviewQueue.pop();

  const { g, w: origWord } = getWordAndGroup(card);

  if (!origWord) {
    renderNextReview();
    return;
  }

  reviewGroupId = card.groupId;

  const type = card.reviewType || chooseReviewType(origWord);

  const term = origWord.term || "";
  const definition = origWord.definition || "";
  const context = origWord.context || "";
  const association = origWord.association || "";

  let promptHtml = "";
  let placeholder = "";

  // ----------------------------------------------------------
  // TYPE 1
  // ----------------------------------------------------------

  if (type === "meaning_to_word") {
    promptHtml = `
      <div class="review-prompt">
        ${escapeHtml(definition)}
      </div>
    `;

    placeholder = "Напиши англійське слово";
  }

  // ----------------------------------------------------------
  // TYPE 2
  // ----------------------------------------------------------
  else if (type === "context_to_word" && context.trim()) {
    const contextDisplay = escapeHtml(context).replace(
      new RegExp(escapeRegExp(term), "gi"),
      "_____",
    );

    promptHtml = `
      <div class="review-context">
        ${contextDisplay}
      </div>
    `;

    placeholder = "Яке англійське слово пропущено?";
  }

  // ----------------------------------------------------------
  // TYPE 3
  // ----------------------------------------------------------
  else {
    promptHtml = `
      <div class="review-prompt">
        ${escapeHtml(term)}
      </div>
    `;

    placeholder = "Напиши українське значення";
  }

  const typeText = REVIEW_TYPE_NAMES[type] || REVIEW_TYPE_NAMES.meaning_to_word;

  const expected = type === "word_to_meaning" ? definition : term;

  const expectedLabel =
    type === "word_to_meaning" ? "Правильне значення" : "Правильне слово";

  const remainingBefore = currentReviewQueue.length;

  const done = reviewTotal - remainingBefore;

  const pct = Math.min(
    100,
    Math.round((done / Math.max(reviewTotal, 1)) * 100),
  );

  progressInner.style.width = pct + "%";

  // ==========================================================
  // REVIEW UI
  // ==========================================================

  reviewContent.innerHTML = `
    <div class="review-type">
      ${escapeHtml(typeText)}
    </div>

    ${promptHtml}

    <div class="small-muted">
      Група:
      <b>${escapeHtml(g ? g.name : "?")}</b>
    </div>

    <div class="small-muted"
         style="margin-top:4px">
      Поточний інтервал:
      <b>
        ${escapeHtml(
          INTERVAL_NAMES[origWord.intervalIndex] || INTERVAL_NAMES[0],
        )}
      </b>
    </div>


    <div style="margin-top:12px">

      <button
        id="hintBtn"
        class="orange small-btn"
        style="width:auto">

        Показати асоціацію

      </button>


      <div
        id="hintBox"
        class="hint-box hidden">
      </div>

    </div>


    <div style="margin-top:10px">

      <input
        id="answerInput"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
      />

    </div>


    <div class="row">

      <button
        id="checkBtn"
        class="green"
        disabled>

        Перевірити

      </button>


      <button
        id="showAnswerBtn"
        class="gray">

        Не знаю / показати відповідь

      </button>

    </div>
  `;

  const answerInput = document.getElementById("answerInput");

  const checkBtn = document.getElementById("checkBtn");

  const showAnswerBtn = document.getElementById("showAnswerBtn");

  const hintBtn = document.getElementById("hintBtn");

  const hintBox = document.getElementById("hintBox");

  answerInput.addEventListener("input", () => {
    checkBtn.disabled = answerInput.value.trim() === "";
  });

  hintBtn.onclick = () => {
    hintBox.classList.remove("hidden");

    if (association.trim()) {
      hintBox.innerHTML = `
        <b>Асоціація:</b>
        ${escapeHtml(association)}
      `;
    } else {
      hintBox.innerHTML = `
        <b>Асоціація ще не додана.</b>
        <br>
        <span class="small-muted">
          Додай її через «Редагувати».
        </span>
      `;
    }
  };

  function showResult(answer, correct) {
    const answerText = answer ? escapeHtml(answer) : "—";

    const resultText = correct
      ? "Правильно"
      : "Не згадав / відповідь неправильна";

    reviewContent.innerHTML = `
      <div class="review-type">
        ${escapeHtml(typeText)}
      </div>

      ${promptHtml}


      <div class="result-box">

        <div>
          <strong>
            Твоя відповідь:
          </strong>

          ${answerText}
        </div>


        <div style="margin-top:6px">

          <strong>
            ${escapeHtml(expectedLabel)}:
          </strong>

          ${escapeHtml(expected)}

        </div>


        <div style="margin-top:8px">

          <strong>
            ${resultText}
          </strong>

        </div>


        ${
          association.trim()
            ? `
              <div class="hint-box">

                <b>Асоціація:</b>

                ${escapeHtml(association)}

              </div>
            `
            : ""
        }

      </div>


      <div
        style="
          margin-top:14px;
          font-weight:700
        ">

        Наскільки легко ти це згадав?

      </div>


      <div class="small-muted">

        Оцінюй саме здатність
        <b>
          самому витягнути слово
          з пам'яті
        </b>,

        а не те, чи впізнав його
        після підказки.

      </div>


      <div class="rating-row">

        <button
          id="againBtn"
          class="red">

          Again

          <span class="rating-label">
            10 хв
          </span>

        </button>


        <button
          id="hardBtn"
          class="orange">

          Hard

          <span class="rating-label">
            цей етап
          </span>

        </button>


        <button
          id="goodBtn"
          class="green">

          Good

          <span class="rating-label">
            наступний етап
          </span>

        </button>


        <button
          id="easyBtn"
          class="blue">

          Easy

          <span class="rating-label">
            +2 етапи
          </span>

        </button>

      </div>
    `;

    const rate = (rating) => {
      applyRating(origWord, rating);

      renderNextReview();
    };

    document.getElementById("againBtn").onclick = () => rate("again");

    document.getElementById("hardBtn").onclick = () => rate("hard");

    document.getElementById("goodBtn").onclick = () => rate("good");

    document.getElementById("easyBtn").onclick = () => rate("easy");
  }

  checkBtn.onclick = () => {
    const ans = answerInput.value.trim();

    if (!ans) {
      return;
    }

    const correct = fuzzyMatch(ans, expected);

    showResult(ans, correct);
  };

  showAnswerBtn.onclick = () => {
    showResult("", false);
  };

  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !checkBtn.disabled) {
      checkBtn.click();
    }
  });
}

// ============================================================
// SRS RATING
// ============================================================

function applyRating(word, rating) {
  if (reviewMode !== "srs" || !word) {
    return;
  }

  const max = INTERVALS.length - 1;

  const current = Math.max(0, Math.min(max, Number(word.intervalIndex) || 0));

  if (rating === "again") {
    word.intervalIndex = 0;
  } else if (rating === "hard") {
    word.intervalIndex = current;
  } else if (rating === "good") {
    word.intervalIndex = Math.min(current + 1, max);
  } else if (rating === "easy") {
    word.intervalIndex = Math.min(current + 2, max);
  }

  word.nextReview = Date.now() + INTERVALS[word.intervalIndex];

  word.lastReviewed = Date.now();

  save();
}

// ============================================================
// GROUPS
// ============================================================

function renderGroups() {
  if (!groupsList) {
    return;
  }

  groupsList.innerHTML = "";

  const header = document.createElement("div");

  header.style.display = "flex";

  header.style.justifyContent = "space-between";

  header.style.alignItems = "center";

  header.style.marginBottom = "8px";

  header.innerHTML = `
    <div
      style="
        display:flex;
        align-items:center;
        gap:8px
      ">

      <label
        style="font-size:13px">

        Сортування:

      </label>


      <select
        id="groupSortSelectInline"
        style="padding:6px">

        <option value="none">
          Без сортування
        </option>

        <option value="date_asc">
          за датою старіші
        </option>

        <option value="date_desc">
          за датою новіші
        </option>

      </select>

    </div>
  `;

  groupsList.appendChild(header);

  const sortSelect = document.getElementById("groupSortSelectInline");

  sortSelect.value = groupSortMode || "none";

  sortSelect.onchange = () => {
    groupSortMode = sortSelect.value;

    renderGroups();
  };

  if (!data.groups.length) {
    groupsList.insertAdjacentHTML(
      "beforeend",
      `
        <div class="small-muted">
          Немає груп.
          Додайте нову групу.
        </div>
      `,
    );

    return;
  }

  const groupsCopy = data.groups.slice();

  if (groupSortMode === "date_asc") {
    groupsCopy.sort(
      (a, b) => (a.createdAt || a.id || 0) - (b.createdAt || b.id || 0),
    );
  } else if (groupSortMode === "date_desc") {
    groupsCopy.sort(
      (a, b) => (b.createdAt || b.id || 0) - (a.createdAt || a.id || 0),
    );
  }

  groupsCopy.forEach((g) => {
    const due = (g.words || []).filter(
      (w) => Date.now() >= (w.nextReview || 0),
    ).length;

    const div = document.createElement("div");

    div.className = "group-item";

    div.innerHTML = `
      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center
        ">

        <div>

          <div>
            <b>
              ${escapeHtml(g.name)}
            </b>
          </div>


          <div
            class="small-muted">

            Слів:
            ${g.words ? g.words.length : 0}

            · До повторення:
            ${due}

          </div>

        </div>


        <div
          class="group-controls">

          <button
            class="
              small-btn
              small-open
            "
            data-id="${g.id}">

            Відкрити

          </button>


          <button
            class="
              small-btn
              small-edit
            "
            data-id="${g.id}">

            Редагувати

          </button>


          <button
            class="
              small-btn
              small-delete
            "
            data-id="${g.id}">

            Видалити

          </button>

        </div>

      </div>
    `;

    groupsList.appendChild(div);
  });

  Array.from(document.getElementsByClassName("small-open")).forEach((btn) => {
    btn.onclick = () => {
      openGroup(Number(btn.dataset.id));
    };
  });

  Array.from(document.getElementsByClassName("small-edit")).forEach((btn) => {
    btn.onclick = () => {
      openGroupModal(Number(btn.dataset.id));
    };
  });

  Array.from(document.getElementsByClassName("small-delete")).forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);

      if (confirm("Видалити групу?")) {
        data.groups = data.groups.filter((x) => x.id !== id);

        save();
      }
    };
  });
}

// ============================================================
// STATISTICS
// ============================================================

function updateStats() {
  let total = 0;
  let due = 0;
  let learned = 0;
  let monthAdded = 0;

  const stageCounts = new Array(INTERVALS.length).fill(0);

  const now = Date.now();

  const d = new Date();

  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

  data.groups.forEach((g) => {
    total += (g.words || []).length;

    (g.words || []).forEach((w) => {
      const idx = Math.max(
        0,
        Math.min(INTERVALS.length - 1, Number(w.intervalIndex) || 0),
      );

      stageCounts[idx]++;

      if (now >= (w.nextReview || 0)) {
        due++;
      }

      if (idx === INTERVALS.length - 1) {
        learned++;
      }

      if (w.createdAt && w.createdAt >= monthStart) {
        monthAdded++;
      }
    });
  });

  const statsHtml = `

    <div>
      <strong>
        До повторення зараз:
      </strong>

      ${due}
    </div>


    <div>
      <strong>
        Всього слів:
      </strong>

      ${total}
    </div>


    <div>
      <strong>
        Додано цього місяця:
      </strong>

      ${monthAdded}
    </div>


    <div>
      <strong>
        На фінальному етапі:
      </strong>

      ${learned}
    </div>


    <div
      class="small-muted"
      style="margin-top:10px">

      <strong>
        Етапи SRS:
      </strong>

    </div>


    ${stageCounts
      .map(
        (c, i) =>
          `
            <div class="small-muted">
              ${INTERVAL_NAMES[i]}:
              ${c}
            </div>
          `,
      )
      .join("")}


    <div
      class="small-muted"
      style="margin-top:10px">

      <strong>
        Типи перевірки:
      </strong>

      45% значення → слово ·
      45% ситуація → слово ·
      10% слово → значення

    </div>
  `;

  let statsContent = document.getElementById("statsContent");

  if (!statsContent) {
    statsContent = document.createElement("div");

    statsContent.id = "statsContent";

    statsBox.appendChild(statsContent);
  }

  statsContent.innerHTML = statsHtml;

  if (!document.getElementById("exportImportContainer")) {
    const container = document.createElement("div");

    container.id = "exportImportContainer";

    container.style.marginTop = "10px";

    container.innerHTML = `

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center
        ">

        <button
          id="startRandomBtn"
          class="small-btn">

          Перевірити випадково

        </button>


        <button
          id="exportAllBtn"
          class="small-btn">

          Експорт усіх груп (.zip)

        </button>


        <button
          id="importBtn"
          class="small-btn">

          Імпорт (.zip/.json)

        </button>


        <input
          id="importFileInput"
          type="file"
          accept="
            .zip,
            .json,
            application/zip,
            application/json
          "
          style="display:none"
        />

      </div>
    `;

    statsBox.appendChild(container);

    document.getElementById("startRandomBtn").onclick = () => {
      buildRandomQueue();

      openReview();
    };

    document.getElementById("exportAllBtn").onclick = exportAllGroupsZip;

    const importFileInput = document.getElementById("importFileInput");

    document.getElementById("importBtn").onclick = () =>
      importFileInput.click();

    importFileInput.onchange = (e) => {
      const f = e.target.files && e.target.files[0];

      if (!f) {
        return;
      }

      handleImportFile(f);

      importFileInput.value = "";
    };
  }
}

// ============================================================
// GROUP MODAL
// ============================================================

function openGroup(id) {
  const g = data.groups.find((x) => x.id === id);

  if (!g) {
    return;
  }

  currentEditGroupId = id;

  modalTitle.textContent = "Група: " + g.name;

  groupNameInput.value = g.name;

  renderGroupWordsInModal(g);

  deleteGroupBtn.style.display = "block";

  repeatGroupBtn.style.display = "";

  cancelWordForm();

  groupModal.classList.remove("hidden");
}

function openGroupModal(id = null) {
  currentEditGroupId = id;

  cancelWordForm();

  if (id == null) {
    modalTitle.textContent = "Нова група";

    groupNameInput.value = "";

    groupWordsList.innerHTML = `
        <div class="small-muted">
          Поки немає слів
        </div>
      `;

    deleteGroupBtn.style.display = "none";

    repeatGroupBtn.style.display = "none";
  } else {
    const g = data.groups.find((x) => x.id === id);

    modalTitle.textContent = "Редагувати групу";

    groupNameInput.value = g ? g.name : "";

    renderGroupWordsInModal(g);

    deleteGroupBtn.style.display = "block";

    repeatGroupBtn.style.display = "";
  }

  groupModal.classList.remove("hidden");
}

function closeGroupModalFunc() {
  cancelWordForm();

  groupModal.classList.add("hidden");

  currentEditGroupId = null;
}

// ============================================================
// WORD LIST IN GROUP
// ============================================================

function renderGroupWordsInModal(group) {
  if (!group || !group.words) {
    groupWordsList.innerHTML = "";

    return;
  }

  groupWordsList.innerHTML = "";

  if (!group.words.length) {
    groupWordsList.innerHTML = `
      <div class="small-muted">
        Поки немає слів.
      </div>
    `;

    return;
  }

  group.words.forEach((w) => {
    const row = document.createElement("div");

    row.className = "word-row";

    row.innerHTML = `

      <div
        class="word-text">

        <b>
          ${escapeHtml(w.term)}
        </b>

        —
        ${escapeHtml(w.definition)}


        ${
          w.context
            ? `
              <div
                class="small-muted">

                Ситуація:
                ${escapeHtml(w.context)}

              </div>
            `
            : ""
        }


        ${
          w.association
            ? `
              <div
                class="small-muted">

                Асоціація:
                ${escapeHtml(w.association)}

              </div>
            `
            : ""
        }

      </div>


      <div
        class="word-actions">

        <span
          class="stage-badge">

          ${escapeHtml(INTERVAL_NAMES[w.intervalIndex] || INTERVAL_NAMES[0])}

        </span>


        <button
          class="small-btn"
          onclick="
            editWord(
              ${group.id},
              ${w.id}
            )
          ">

          Ред.

        </button>


        <button
          class="small-btn"
          onclick="
            deleteWordFromModal(
              ${group.id},
              ${w.id}
            )
          ">

          X

        </button>

      </div>

    `;

    groupWordsList.appendChild(row);
  });
}

// ============================================================
// INLINE WORD FORM
// ============================================================

function renderWordForm(existing = null) {
  let form = document.getElementById("wordForm");

  if (!form) {
    form = document.createElement("div");

    form.id = "wordForm";

    form.className = "word-form";

    groupWordsList.parentNode.insertBefore(form, groupWordsList);
  }

  form.dataset.editingId = existing ? String(existing.id) : "";

  form.innerHTML = `

    <div
      class="word-form-title">

      ${existing ? "Редагувати слово" : "Додати нове слово"}

    </div>


    <label
      for="wordTermInput">

      Англійське слово *

    </label>


    <input
      id="wordTermInput"
      placeholder="Наприклад: contempt"
      autocomplete="off"
      value="${escapeHtml(existing ? existing.term : "")}"
    />


    <label
      for="wordDefinitionInput">

      Значення / переклад *

    </label>


    <input
      id="wordDefinitionInput"
      placeholder="
        Наприклад:
        презирство, зневага
      "
      value="${escapeHtml(existing ? existing.definition : "")}"
    />


    <label
      for="wordContextInput">

      Ситуація / приклад речення

      <span class="form-hint">
        дуже бажано
      </span>

    </label>


    <textarea
      id="wordContextInput"
      placeholder="
        Наприклад:
        He treats people with contempt.
      "
    >${escapeHtml(existing ? existing.context || "" : "")}</textarea>


    <label
      for="wordAssociationInput">

      Асоціація / гачок пам'яті

      <span class="form-hint">
        необов'язково
      </span>

    </label>


    <textarea
      id="wordAssociationInput"
      placeholder="
        Твоя особиста асоціація,
        образ, історія тощо
      "
    >${escapeHtml(existing ? existing.association || "" : "")}</textarea>


    <div
      class="form-actions">

      <button
        id="saveWordFormBtn"
        class="green">

        ${existing ? "Зберегти зміни" : "Додати слово"}

      </button>


      <button
        id="cancelWordFormBtn"
        class="gray">

        Скасувати

      </button>

    </div>
  `;

  form.classList.remove("hidden");

  document.getElementById("saveWordFormBtn").onclick = saveWordForm;

  document.getElementById("cancelWordFormBtn").onclick = cancelWordForm;

  form.querySelectorAll("input, textarea").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();

        saveWordForm();
      }
    });
  });

  document.getElementById("wordTermInput").focus();
}

function saveWordForm() {
  const term = document.getElementById("wordTermInput").value.trim();

  const definition = document
    .getElementById("wordDefinitionInput")
    .value.trim();

  const context = document.getElementById("wordContextInput").value.trim();

  const association = document
    .getElementById("wordAssociationInput")
    .value.trim();

  if (!term) {
    alert("Введіть англійське слово.");

    document.getElementById("wordTermInput").focus();

    return;
  }

  if (!definition) {
    alert("Введіть значення / переклад.");

    document.getElementById("wordDefinitionInput").focus();

    return;
  }

  // ----------------------------------------------------------
  // Create new group automatically
  // ----------------------------------------------------------

  if (currentEditGroupId == null) {
    const groupName = groupNameInput.value.trim();

    if (!groupName) {
      alert("Спочатку введіть назву групи.");

      groupNameInput.focus();

      return;
    }

    const newGroupId = Date.now();

    data.groups.push({
      id: newGroupId,

      name: groupName,

      words: [],

      createdAt: Date.now(),
    });

    currentEditGroupId = newGroupId;

    modalTitle.textContent = "Редагувати групу";

    deleteGroupBtn.style.display = "block";

    repeatGroupBtn.style.display = "";
  }

  const g = data.groups.find((x) => x.id === currentEditGroupId);

  if (!g) {
    return;
  }

  const form = document.getElementById("wordForm");

  const editingId = Number(form.dataset.editingId || 0);

  // ----------------------------------------------------------
  // Edit existing word
  // ----------------------------------------------------------

  if (editingId) {
    const w = g.words.find((x) => x.id === editingId);

    if (w) {
      w.term = term;

      w.definition = definition;

      w.context = context;

      w.association = association;
    }
  }

  // ----------------------------------------------------------
  // Add new word
  // ----------------------------------------------------------
  else {
    g.words.push({
      id: Date.now() + Math.floor(Math.random() * 1000),

      groupId: g.id,

      term,

      definition,

      context,

      association,

      intervalIndex: 0,

      nextReview: Date.now() + INTERVALS[0],

      createdAt: Date.now(),
    });
  }

  save();

  renderGroupWordsInModal(g);

  cancelWordForm();
}

function cancelWordForm() {
  const form = document.getElementById("wordForm");

  if (!form) {
    return;
  }

  form.classList.add("hidden");

  form.dataset.editingId = "";

  form.innerHTML = "";
}

function addWordToModal() {
  renderWordForm();
}

function editWord(groupId, wordId) {
  const g = data.groups.find((x) => x.id === groupId);

  if (!g) {
    return;
  }

  const w = g.words.find((x) => x.id === wordId);

  if (!w) {
    return;
  }

  renderWordForm(w);
}

function deleteWordFromModal(groupId, wordId) {
  if (!confirm("Видалити слово?")) {
    return;
  }

  const g = data.groups.find((x) => x.id === groupId);

  if (!g) {
    return;
  }

  g.words = g.words.filter((x) => x.id !== wordId);

  save();

  renderGroupWordsInModal(g);

  cancelWordForm();
}

// ============================================================
// SAVE GROUP
// ============================================================

function saveGroupFromModal() {
  const name = groupNameInput.value.trim();

  if (!name) {
    alert("Введіть назву групи");

    return;
  }

  if (currentEditGroupId == null) {
    data.groups.push({
      id: Date.now(),

      name,

      words: [],

      createdAt: Date.now(),
    });
  } else {
    const g = data.groups.find((x) => x.id === currentEditGroupId);

    if (g) {
      g.name = name;

      if (!g.createdAt) {
        g.createdAt = Date.now();
      }
    }
  }

  save();

  closeGroupModalFunc();
}

// ============================================================
// FUZZY MATCH
// ============================================================

function fuzzyMatch(a, b) {
  a = String(a || "")
    .toLowerCase()
    .trim();

  b = String(b || "")
    .toLowerCase()
    .trim();

  if (a === b) {
    return true;
  }

  const variants = b
    .split(/[;,\/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const normalize = (s) => s.replace(/^to\s+/i, "").trim();

  function levenshtein(s, t) {
    const m = s.length;

    const n = t.length;

    if (m === 0) {
      return n;
    }

    if (n === 0) {
      return m;
    }

    const d = Array.from(
      {
        length: m + 1,
      },
      () => new Array(n + 1),
    );

    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }

    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;

        d[i][j] = Math.min(
          d[i - 1][j] + 1,

          d[i][j - 1] + 1,

          d[i - 1][j - 1] + cost,
        );
      }
    }

    return d[m][n];
  }

  for (const v of variants) {
    const nv = normalize(v);

    if (a === nv) {
      return true;
    }

    if (Math.abs(a.length - nv.length) > 2) {
      continue;
    }

    if (levenshtein(a, nv) <= 1) {
      return true;
    }
  }

  return false;
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function ensureJsZipLoaded(callback) {
  if (window.JSZip) {
    callback();

    return;
  }

  const s = document.createElement("script");

  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js";

  s.onload = () => callback();

  s.onerror = () => {
    alert("Не вдалося завантажити JSZip. Спробуйте JSON.");

    callback();
  };

  document.head.appendChild(s);
}

function exportGroupZip(groupId) {
  const g = data.groups.find((x) => x.id === groupId);

  if (!g) {
    alert("Групу не знайдено");

    return;
  }

  ensureJsZipLoaded(() => {
    if (window.JSZip) {
      const zip = new JSZip();

      zip.file(
        `${sanitizeFilename(g.name || "group")}_${g.id}.json`,

        JSON.stringify(g, null, 2),
      );

      zip
        .generateAsync({
          type: "blob",
        })
        .then((content) => {
          downloadBlob(
            content,

            `${sanitizeFilename(g.name || "group")}_${g.id}.zip`,
          );
        });
    } else {
      downloadBlob(
        new Blob([JSON.stringify(g, null, 2)], {
          type: "application/json",
        }),

        `${sanitizeFilename(g.name || "group")}_${g.id}.json`,
      );
    }
  });
}

function exportAllGroupsZip() {
  if (!data.groups.length) {
    alert("Немає груп для експорту");

    return;
  }

  ensureJsZipLoaded(() => {
    if (window.JSZip) {
      const zip = new JSZip();

      data.groups.forEach((g) => {
        zip.file(
          `${sanitizeFilename(g.name || "group")}_${g.id}.json`,

          JSON.stringify(g, null, 2),
        );
      });

      zip
        .generateAsync({
          type: "blob",
        })
        .then((content) => {
          downloadBlob(
            content,

            `vocab_groups_${Date.now()}.zip`,
          );
        });
    } else {
      downloadBlob(
        new Blob(
          [
            JSON.stringify(
              {
                groups: data.groups,
              },
              null,
              2,
            ),
          ],

          {
            type: "application/json",
          },
        ),

        `vocab_groups_${Date.now()}.json`,
      );
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

          Promise.all(
            files.map((fn) =>
              z
                .file(fn)
                .async("string")
                .then((txt) => ({
                  fn,
                  txt,
                })),
            ),
          ).then((arr) => {
            arr.forEach((f) => {
              try {
                importGroupObject(JSON.parse(f.txt));
              } catch (e) {
                console.warn("Не вдалося розпарсити:", f.fn, e);
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
    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);

        if (obj.groups && Array.isArray(obj.groups)) {
          obj.groups.forEach(importGroupObject);
        } else {
          importGroupObject(obj);
        }

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
  if (!g || !g.name) {
    return;
  }

  let newGroupId = g.id;

  if (data.groups.find((x) => x.id === newGroupId)) {
    newGroupId = Date.now() + Math.floor(Math.random() * 1000);
  }

  const newGroup = {
    id: newGroupId,

    name: g.name,

    words: [],

    createdAt: typeof g.createdAt === "number" ? g.createdAt : Date.now(),
  };

  if (Array.isArray(g.words)) {
    g.words.forEach((w) => {
      let newWordId = w.id || Date.now() + Math.floor(Math.random() * 100000);

      while (
        data.groups.some((gg) => gg.words.some((ww) => ww.id === newWordId)) ||
        newGroup.words.some((ww) => ww.id === newWordId)
      ) {
        newWordId = Date.now() + Math.floor(Math.random() * 100000);
      }

      newGroup.words.push({
        id: newWordId,

        groupId: newGroup.id,

        term: w.term || "",

        definition: w.definition || "",

        context: w.context || "",

        association: w.association || "",

        intervalIndex:
          typeof w.intervalIndex === "number" ? w.intervalIndex : 0,

        nextReview:
          typeof w.nextReview === "number"
            ? w.nextReview
            : Date.now() + INTERVALS[0],

        createdAt: typeof w.createdAt === "number" ? w.createdAt : Date.now(),
      });
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

// ============================================================
// EVENTS
// ============================================================

if (startSRS) {
  startSRS.addEventListener("click", () => {
    reviewMode = "srs";

    buildSRSQueue();

    openReview();
  });
}

if (startFree) {
  startFree.addEventListener("click", () => {
    reviewMode = "free";

    buildFreeQueue();

    openReview();
  });
}

if (toggleGroupsBtn) {
  toggleGroupsBtn.addEventListener("click", () => {
    groupsList.classList.toggle("collapsed");

    toggleGroupsBtn.textContent = groupsList.classList.contains("collapsed")
      ? "Групи ▼"
      : "Групи ▲";
  });
}

if (openCreate) {
  openCreate.addEventListener("click", () => openGroupModal());
}

if (addWordBtn) {
  addWordBtn.addEventListener("click", addWordToModal);
}

if (saveGroupBtn) {
  saveGroupBtn.addEventListener("click", saveGroupFromModal);
}

if (closeGroupModal) {
  closeGroupModal.addEventListener("click", closeGroupModalFunc);
}

if (deleteGroupBtn) {
  deleteGroupBtn.addEventListener("click", () => {
    if (currentEditGroupId == null) {
      return;
    }

    if (confirm("Видалити групу?")) {
      data.groups = data.groups.filter((g) => g.id !== currentEditGroupId);

      save();

      closeGroupModalFunc();
    }
  });
}

if (closeReviewBtn) {
  closeReviewBtn.addEventListener("click", closeReview);
}

if (repeatGroupBtn) {
  repeatGroupBtn.addEventListener("click", () => {
    const gid = reviewGroupId != null ? reviewGroupId : currentEditGroupId;

    if (gid != null) {
      closeGroupModalFunc();

      buildGroupForceQueue(gid);

      openReview();
    } else {
      alert("Виберіть групу для повторення");
    }
  });
}

// ============================================================
// INITIALIZATION
// ============================================================

renderGroups();

updateStats();

if (groupsList) {
  groupsList.classList.add("collapsed");
}
