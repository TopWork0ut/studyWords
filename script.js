
// Vocabulary trainer restored from v7 with fixes and requested behavior.
// Data structure in localStorage: { groups: [ {id,name,words:[{id,groupId,term,definition,intervalIndex,nextReview}] } ] }

const INTERVALS = [
  10*60*1000,
  3*60*60*1000,
  24*60*60*1000,
  3*24*60*60*1000,
  7*24*60*60*1000,
  30*24*60*60*1000,
  90*24*60*60*1000
];
const INTERVAL_NAMES = ["10 хв","3 год","1 день","3 дні","7 днів","30 днів","90 днів"];

let data = JSON.parse(localStorage.getItem('vocabData') || '{}');
if(!data.groups) data.groups = [];

let currentEditGroupId = null;
let currentReviewQueue = [];
let reviewMode = 'srs'; // 'srs' or 'free' or 'group-force'
let reviewGroupId = null;

function save(){
  localStorage.setItem('vocabData', JSON.stringify(data));
  renderGroups();
  updateStats();
}

// DOM refs
const statsBox = document.getElementById('statsBox');
const startSRS = document.getElementById('startSRS');
const startFree = document.getElementById('startFree');
const toggleGroupsBtn = document.getElementById('toggleGroupsBtn');
const groupsList = document.getElementById('groupsList');
const openCreate = document.getElementById('openCreate');

const groupModal = document.getElementById('groupModal');
const groupNameInput = document.getElementById('groupNameInput');
const groupWordsList = document.getElementById('groupWordsList');
const addWordBtn = document.getElementById('addWordBtn');
const saveGroupBtn = document.getElementById('saveGroupBtn');
const closeGroupModal = document.getElementById('closeGroupModal');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

const reviewModal = document.getElementById('reviewModal');
const reviewContent = document.getElementById('reviewContent');
const closeReviewBtn = document.getElementById('closeReviewBtn');
const repeatGroupBtn = document.getElementById('repeatGroupBtn');
const progressInner = document.getElementById('progressInner');

// init
renderGroups();
updateStats();
groupsList.classList.add('collapsed'); // collapsed by default

// events
startSRS.addEventListener('click', ()=> {
  reviewMode = 'srs';
  buildSRSQueue();
  openReview();
});
startFree.addEventListener('click', ()=> {
  reviewMode = 'free';
  buildFreeQueue();
  openReview();
});
toggleGroupsBtn.addEventListener('click', ()=> {
  groupsList.classList.toggle('collapsed');
  toggleGroupsBtn.textContent = groupsList.classList.contains('collapsed') ? 'Групи ▼' : 'Групи ▲';
});
openCreate.addEventListener('click', ()=> openGroupModal());

addWordBtn.addEventListener('click', ()=> {
  addWordToModal();
});
saveGroupBtn.addEventListener('click', ()=> {
  saveGroupFromModal();
});
closeGroupModal.addEventListener('click', ()=> closeGroupModalFunc());
deleteGroupBtn.addEventListener('click', ()=> {
  if(currentEditGroupId==null) return;
  if(confirm('Видалити групу?')) {
    data.groups = data.groups.filter(g=>g.id!==currentEditGroupId);
    currentEditGroupId = null;
    save();
    closeGroupModalFunc();
  }
});

closeReviewBtn.addEventListener('click', ()=> closeReview());
repeatGroupBtn.addEventListener('click', ()=> {
  // when pressed inside review modal, repeat whole group regardless of time
  if(reviewGroupId!=null){
    buildGroupForceQueue(reviewGroupId);
    openReview(); // restart review modal content
  }
});

// functions

function renderGroups(){
  groupsList.innerHTML = '';
  if(data.groups.length===0){
    groupsList.innerHTML = '<div class="small-muted">Немає груп. Додайте нову групу.</div>';
    return;
  }
  data.groups.forEach(g=>{
    const div = document.createElement('div');
    div.className = 'group-item';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div><b>${escapeHtml(g.name)}</b></div>
          <div class="small-muted">Слів: ${g.words.length}</div>
        </div>
        <div class="group-controls">
          <button class="small-btn small-open" data-id="${g.id}">Відкрити</button>
          <button class="small-btn small-edit" data-id="${g.id}">Редагувати</button>
          <button class="small-btn small-delete" data-id="${g.id}">Видалити</button>
        </div>
      </div>
    `;
    groupsList.appendChild(div);
  });

  // attach handlers
  Array.from(document.getElementsByClassName('small-open')).forEach(btn=>{
    btn.onclick = ()=> {
      const id = Number(btn.getAttribute('data-id'));
      openGroup(id);
    };
  });
  Array.from(document.getElementsByClassName('small-edit')).forEach(btn=>{
    btn.onclick = ()=> {
      const id = Number(btn.getAttribute('data-id'));
      openGroupModal(id);
    };
  });
  Array.from(document.getElementsByClassName('small-delete')).forEach(btn=>{
    btn.onclick = ()=> {
      const id = Number(btn.getAttribute('data-id'));
      if(confirm('Видалити групу?')) {
        data.groups = data.groups.filter(x=>x.id!==id);
        save();
      }
    };
  });
}

function updateStats(){
  // compute stats: today, total, learned, stage distribution
  let total=0, today=0, learned=0;
  let stageCounts = new Array(INTERVALS.length).fill(0);
  data.groups.forEach(g=>{
    total += g.words.length;
    g.words.forEach(w=>{
      stageCounts[w.intervalIndex] = (stageCounts[w.intervalIndex]||0) + 1;
      if(Date.now() >= w.nextReview) today++;
      if(w.intervalIndex === INTERVALS.length-1) learned++;
    });
  });
  let html = `<div><strong>Сьогодні:</strong> ${today}</div>
              <div><strong>Всього слів:</strong> ${total}</div>
              <div><strong>Вивчено (фінал):</strong> ${learned}</div>
              <div class="small-muted" style="margin-top:8px"><strong>Етапи:</strong></div>
              ${stageCounts.map((c,i)=>`<div class="small-muted">${INTERVAL_NAMES[i]}: ${c}</div>`).join('')}`;
  statsBox.innerHTML = html;
}

function openGroup(id){
  // open group overlay showing words, allow editing; ensure delete group button last
  const g = data.groups.find(x=>x.id===id);
  currentEditGroupId = id;
  document.getElementById('modalTitle').textContent = 'Група: ' + g.name;
  groupNameInput.value = g.name;
  renderGroupWordsInModal(g);
  groupModal.classList.remove('hidden');
}

function openGroupModal(id=null){
  currentEditGroupId = id;
  if(id==null){
    document.getElementById('modalTitle').textContent = 'Нова група';
    groupNameInput.value = '';
    groupWordsList.innerHTML = '<div class="small-muted">Поки немає слів</div>';
    deleteGroupBtn.style.display = 'none';
  } else {
    const g = data.groups.find(x=>x.id===id);
    document.getElementById('modalTitle').textContent = 'Редагувати групу';
    groupNameInput.value = g.name;
    renderGroupWordsInModal(g);
    deleteGroupBtn.style.display = 'block';
  }
  groupModal.classList.remove('hidden');
}

function closeGroupModalFunc(){
  groupModal.classList.add('hidden');
  currentEditGroupId = null;
}

function renderGroupWordsInModal(group){
  if(!group || !group.words) { groupWordsList.innerHTML = ''; return;}
  groupWordsList.innerHTML = '';
  group.words.forEach(w=>{
    const row = document.createElement('div');
    row.className = 'word-row';
    row.innerHTML = `<div class="word-text"><b>${escapeHtml(w.term)}</b> — ${escapeHtml(w.definition)}</div>
                     <div class="word-actions">
                       <span class="stage-badge">${INTERVAL_NAMES[w.intervalIndex]}</span>
                       <button class="small-btn" onclick="editWord(${group.id}, ${w.id})">Ред.</button>
                       <button class="small-btn" onclick="deleteWordFromModal(${group.id}, ${w.id})">X</button>
                     </div>`;
    groupWordsList.appendChild(row);
  });
}

function addWordToModal(){
  const term = prompt('Слово (EN):');
  if(!term) return;
  const def = prompt('Переклад (UA):');
  if(!def) return;
  if(currentEditGroupId==null){
    // creating new group but adding words—create temporary group in memory
    let tempId = Date.now();
    data.groups.push({id: tempId, name: groupNameInput.value || 'Нова група', words: []});
    currentEditGroupId = tempId;
  }
  const g = data.groups.find(x=>x.id===currentEditGroupId);
  g.words.push({id: Date.now(), groupId: g.id, term: term.trim(), definition: def.trim(), intervalIndex: 0, nextReview: Date.now() + INTERVALS[0]});
  save();
  renderGroupWordsInModal(g);
}

function editWord(groupId, wordId){
  const g = data.groups.find(x=>x.id===groupId);
  const w = g.words.find(x=>x.id===wordId);
  const newTerm = prompt('Слово (EN):', w.term);
  if(!newTerm) return;
  const newDef = prompt('Переклад (UA):', w.definition);
  if(!newDef) return;
  w.term = newTerm.trim(); w.definition = newDef.trim();
  save();
  renderGroupWordsInModal(g);
}

function deleteWordFromModal(groupId, wordId){
  if(!confirm('Видалити слово?')) return;
  const g = data.groups.find(x=>x.id===groupId);
  g.words = g.words.filter(x=>x.id!==wordId);
  save();
  renderGroupWordsInModal(g);
}

function saveGroupFromModal(){
  const name = groupNameInput.value.trim();
  if(!name) { alert('Введіть назву групи'); return; }
  if(currentEditGroupId==null){
    // new group
    const newId = Date.now();
    data.groups.push({id: newId, name: name, words: []});
    currentEditGroupId = newId;
  } else {
    const g = data.groups.find(x=>x.id===currentEditGroupId);
    g.name = name;
  }
  save();
  closeGroupModalFunc();
}

// REVIEW logic

function buildSRSQueue(){
  currentReviewQueue = [];
  reviewGroupId = null;
  data.groups.forEach(g=>{
    g.words.forEach(w=>{
      if(Date.now() >= w.nextReview) currentReviewQueue.push(Object.assign({}, w));
    });
  });
}

function buildFreeQueue(){
  currentReviewQueue = [];
  reviewGroupId = null;
  data.groups.forEach(g=>{
    g.words.forEach(w=>{
      currentReviewQueue.push(Object.assign({}, w));
    });
  });
}

function buildGroupForceQueue(groupId){
  currentReviewQueue = [];
  reviewGroupId = groupId;
  const g = data.groups.find(x=>x.id===groupId);
  if(!g) return;
  g.words.forEach(w=> currentReviewQueue.push(Object.assign({}, w)));
}

function openReview(){
  if(!currentReviewQueue || currentReviewQueue.length===0){
    alert('Немає слів для повторення');
    return;
  }
  reviewModal.classList.remove('hidden');
  renderNextReview();
}

function closeReview(){
  reviewModal.classList.add('hidden');
  reviewGroupId = null;
}

function renderNextReview(){
  if(currentReviewQueue.length===0){
    reviewContent.innerHTML = '<div>Готово!</div>';
    progressInner.style.width = '100%';
    updateStats();
    return;
  }
  const w = currentReviewQueue.pop();
  const g = data.groups.find(x=>x.id===w.groupId) || {name:'?'};
  const percent = Math.round((w.intervalIndex/(INTERVALS.length-1))*100);
  // set reviewGroupId so repeatGroupBtn can restart current group
  reviewGroupId = w.groupId;

  reviewContent.innerHTML = `
    <div><b>${escapeHtml(w.term)}</b></div>
    <div class="small-muted">Група: <b>${escapeHtml(g.name)}</b></div>
    <div class="small-muted">Етап: ${INTERVAL_NAMES[w.intervalIndex]}</div>
    <div style="margin-top:8px">
      <input id="answerInput" placeholder="Ваш переклад" style="width:100%;padding:8px" />
    </div>
    <div style="margin-top:8px">
      <button id="checkBtn" class="green">Перевірити</button>
    </div>
  `;
  // update progress
  const total = currentReviewQueue.length + 1;
  const done = 1;
  const pct = Math.round((done / total) * 100);
  progressInner.style.width = pct + '%';

  document.getElementById('checkBtn').onclick = () => {
    const ans = document.getElementById('answerInput').value.trim();
    const ok = fuzzyMatch(ans, w.definition);
    // show result including correct answer always
    reviewContent.innerHTML = `
      <div><b>${escapeHtml(w.term)}</b></div>
      <div class="small-muted">Група: <b>${escapeHtml(g.name)}</b></div>
      <div style="margin-top:8px"><strong>Ваша відповідь:</strong> ${escapeHtml(ans || '-')}</div>
      <div style="margin-top:6px"><strong>Правильна відповідь:</strong> ${escapeHtml(w.definition)}</div>
      <div style="margin-top:8px;color:${ok? 'green':'red'}"><strong>${ok? 'Правильно':'Неправильно'}</strong></div>
      <div style="margin-top:10px">
        <button id="nextBtn" class="green">Далі</button>
      </div>
    `;
    document.getElementById('nextBtn').onclick = () => {
      // apply SRS changes only if in srs mode
      if(reviewMode === 'srs'){
        // find original word in data and update interval and nextReview
        const origGroup = data.groups.find(x=>x.id===w.groupId);
        if(origGroup){
          const origWord = origGroup.words.find(x=>x.id===w.id);
          if(origWord){
            if(ok) origWord.intervalIndex = Math.min(origWord.intervalIndex + 1, INTERVALS.length - 1);
            else origWord.intervalIndex = Math.max(origWord.intervalIndex - 1, 0);
            origWord.nextReview = Date.now() + INTERVALS[origWord.intervalIndex];
          }
        }
        save();
      }
      renderNextReview();
    };
  };
}

// utility functions

function fuzzyMatch(a,b){
  if(!a && !b) return true;
  a = String(a||'').toLowerCase().trim();
  b = String(b||'').toLowerCase().trim();
  if(a===b) return true;
  // allow one character error
  let i=0,j=0,mism=0;
  while(i<a.length && j<b.length){
    if(a[i]!==b[j]){
      mism++; if(mism>1) return false;
      if(a.length>b.length) i++; else if(a.length<b.length) j++; else {i++;j++;}
    } else {i++;j++;}
  }
  return true;
}

function escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
