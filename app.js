/**
 * ระบบหนังสือรับอิเล็กทรอนิกส์ - โรงเรียนบ้านสันดาบ
 * app.js: Core Application Controller
 */

// Global App State
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxwguhD5XMUi-eQzQjrbT8dNDvhdRx9w9fDzvGGbGIU8-CrEZYYi4_n-Lw5OuA7y93R/exec';

const AppState = {
  sheetTeachersId: '1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA',
  sheetInboundId: '1iyrtsfjL3WEl2BQOpbTWLEhaacA95dfScXYj_1QBqK8',
  driveFolderId: '136nyrJjpEK2vYwaRjGgUwvbxtg5uoLEj',
  gasWebAppUrl: (localStorage.getItem('gasWebAppUrl') && localStorage.getItem('gasWebAppUrl').startsWith('https://script.google.com')) 
    ? localStorage.getItem('gasWebAppUrl') 
    : DEFAULT_GAS_URL,

  records: [],
  teachers: [],
  selectedFile: null, // { name, type, dataUrl, bytes }
  selectedFiles: [], // [ { name, type, size, dataUrl, bytes }, ... ]
  currentDocId: null, // Active document being stamped
  activeViewFileIndex: 0,
  activeTab: 'receive', // 'receive' | 'pending' | 'search' | 'settings'
  showAllInbound: false, // Default show 5 latest items
  showAllPending: false, // Default show 5 latest items

  // Main Section Navigation (Left Sidebar)
  currentMainSection: 'receive', // 'receive' | 'outbound' | 'order'
  outboundRecords: [],
  orderRecords: [],
  selectedOutboundFile: null,
  selectedOrderFile: null,

  // Signature Pads & Scaling
  sigPadProposal: null,
  sigPadDirector: null,
  attachedSigProposal: null,
  attachedSigDirector: null,
  sigScaleProposal: 1.0,
  sigScaleDirector: 1.0
};

// Thai Date Helpers
const ThaiDateUtil = {
  thaiMonths: [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ],
  thaiMonthsShort: [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ],
  thaiDays: ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'],

  getBuddhistYear(date = new Date()) {
    return date.getFullYear() + 543;
  },

  formatFullThaiDate(date = new Date()) {
    const dayName = this.thaiDays[date.getDay()];
    const day = date.getDate();
    const month = this.thaiMonths[date.getMonth()];
    const year = this.getBuddhistYear(date);
    return `${dayName}ที่ ${day} ${month} พ.ศ. ${year}`;
  },

  formatThaiDateShort(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = this.getBuddhistYear(date);
    return `${day}/${month}/${year}`;
  },

  formatThaiTimeString(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} น.`;
  },

  formatDisplayDate(val) {
    if (!val) return '-';
    const str = String(val).trim();
    if (!str) return '-';

    // Case 1: ISO string e.g. "2569-03-10T17:00:00.000Z" or "2026-03-10T..."
    if (str.includes('T') && str.endsWith('Z')) {
      try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          let yr = d.getFullYear();
          if (yr < 2400) yr += 543;
          return `${day}/${month}/${yr}`;
        }
      } catch (e) {}
    }

    // Case 2: YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymdMatch) {
      let yr = parseInt(ymdMatch[1], 10);
      if (yr < 2400) yr += 543;
      const mo = ymdMatch[2].padStart(2, '0');
      const da = ymdMatch[3].padStart(2, '0');
      return `${da}/${mo}/${yr}`;
    }

    return str;
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initReceiveDateSelectors();
  initTabNavigation();
  initDropzone();
  initSignaturePads();
  initOutboundDate();
  initOrderDate();
  initSidebarState();
  updateGasStatusBadge();

  // Load records from IndexedDB / Storage asynchronously
  await loadStoredRecords();
  await loadStoredOutboundAndOrderRecords();

  updateLatestBookNoPlaceholder();
  updateLatestOrderNoDisplay();
  renderAllTables();
  renderOutboundTable();
  renderOrderTable();
  updateKpiStats();
  updateInboundStampPreview();

  // Load teachers asynchronously in background without blocking UI
  loadTeachersFromSheet();
});

/* ==========================================================================
   Clock & Auto-Time
   ========================================================================== */
function initClock() {
  function tick() {
    const now = new Date();
    const fullDate = ThaiDateUtil.formatFullThaiDate(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} น.`;

    const clockEl = document.getElementById('liveClock');
    if (clockEl) {
      clockEl.innerHTML = `<i class="fa-regular fa-clock"></i> <span>${fullDate} | <strong>${timeStr}</strong></span>`;
    }

    // Auto fill time input if empty or fresh
    const timeInput = document.getElementById('receiveTime');
    if (timeInput && !timeInput.dataset.manualEdited) {
      timeInput.value = ThaiDateUtil.formatThaiTimeString(now);
    }
  }

  // Set today's date in Buddhist Era for the date selectors
  const dateInput = document.getElementById('receiveDate');
  if (dateInput && !dateInput.value) {
    setReceiveDateToToday();
  }

  tick();
  setInterval(tick, 1000);
}

/* ==========================================================================
   Tab Navigation
   ========================================================================== */
function initTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  AppState.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  updateKpiStats();
}

/* ==========================================================================
   Main Section Navigation (Sidebar Menu: หนังสือรับ | ทะเบียนหนังสือส่ง | หนังสือคำสั่ง)
   ========================================================================== */
function switchMainSection(section) {
  AppState.currentMainSection = section;

  // Update sidebar active buttons
  document.getElementById('sideNavReceive')?.classList.toggle('active', section === 'receive');
  document.getElementById('sideNavOutbound')?.classList.toggle('active', section === 'outbound');
  document.getElementById('sideNavOrder')?.classList.toggle('active', section === 'order');

  // Update main section views
  document.getElementById('main-section-receive')?.classList.toggle('active', section === 'receive');
  document.getElementById('main-section-outbound')?.classList.toggle('active', section === 'outbound');
  document.getElementById('main-section-order')?.classList.toggle('active', section === 'order');

  if (section === 'receive') {
    switchTab(AppState.activeTab || 'receive');
  } else if (section === 'outbound') {
    initOutboundDateDropdowns();
    renderOutboundTable();
  } else if (section === 'order') {
    initOrderDateDropdowns();
    renderOrderTable();
    updateLatestOrderNoDisplay();
  }
}

// Collapsible Sidebar Functions
function toggleSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  const icon = document.getElementById('sidebarToggleIcon');
  if (!sidebar) return;

  sidebar.classList.toggle('collapsed');
  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');

  if (icon) {
    icon.className = isCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left';
  }
}

function initSidebarState() {
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === '1';
  if (isCollapsed) {
    const sidebar = document.getElementById('sidebarNav');
    const icon = document.getElementById('sidebarToggleIcon');
    if (sidebar) sidebar.classList.add('collapsed');
    if (icon) icon.className = 'fa-solid fa-angles-right';
  }
}

/* ==========================================================================
   Teachers Database Ingestion
   ========================================================================== */
async function loadTeachersFromSheet() {
  const fallbackTeachers = [
    'นายสุโลธร ธนาวิชิตฤกษ์',
    'นายณัฏฐ์ ไตรพุทธมาศ',
    'สุจิตตรา ปางสุข',
    'นางสาวทิพย์สุคนธ์ อ่องเมือง',
    'นางสาวธารณี สินศุข',
    'นายธนโชค ขุนพิลึก',
    'นางสาวสุวรรณี นิลประดับ',
    'นางสาววรัญญา พิศแสนสุวรรณ',
    'นายกฤษฎา ผลพล',
    'นางสาวนิศารัตน์ ฉิมขันธ์',
    'นางสาวชลลดา ซ่อนกลิ่น',
    'นายพิศณุ เพียสีนุ้ย',
    'นายคเณศ ชุนสิทธิ์'
  ];

  try {
    // 1. Try to fetch directly from GAS backend
    if (AppState.gasWebAppUrl) {
      try {
        const gasUrl = AppState.gasWebAppUrl + (AppState.gasWebAppUrl.includes('?') ? '&' : '?') + 'action=getTeachers';
        const res = await fetch(gasUrl);
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
          AppState.teachers = json.data;
          console.log('Teachers loaded successfully from GAS backend:', json.data.length);
          return;
        }
      } catch (errGas) {
        console.warn('Could not fetch teachers from GAS backend, falling back to GViz:', errGas);
      }
    }

    // 2. Fallback to direct Google Visualization query
    const url = `https://docs.google.com/spreadsheets/d/${AppState.sheetTeachersId}/gviz/tq?tqx=out:json&sheet=Teachers`;
    const response = await fetch(url);
    const text = await response.text();
    // Parse Google visualization JSON
    const jsonStr = text.replace(/^[/*\s]*google\.visualization\.Query\.setResponse\(/, '').replace(/\);?$/, '');
    const data = JSON.parse(jsonStr);

    const rows = data.table.rows;
    const teacherList = [];

    rows.forEach(r => {
      if (r && r.c && r.c[1] && r.c[1].v) {
        const name = String(r.c[1].v).trim();
        if (name && name !== 'ชื่อ-นามสกุล') {
          teacherList.push(name);
        }
      }
    });

    if (teacherList.length > 0) {
      AppState.teachers = teacherList;
      console.log('Teachers loaded successfully from Google Sheet:', teacherList.length);
    } else {
      AppState.teachers = fallbackTeachers;
    }
  } catch (err) {
    console.warn('Could not fetch teachers directly (CORS/Offline), using verified teachers sheet cache:', err);
    AppState.teachers = fallbackTeachers;
  }

  populateTeacherDropdowns();
}

let currentDirectorAssignees = [];

function populateTeacherDropdowns() {
  const dropdown = document.getElementById('directorAssigneeSelect') || document.getElementById('directorAssignee');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">-- ➕ คลิกเพื่อเลือกเพิ่มผู้รับผิดชอบ (เลือกได้หลายคน) --</option>';

  // Group: ฝ่ายงานและกลุ่มเป้าหมาย (4 ฝ่าย + ครูทุกคน)
  const grpRoles = document.createElement('optgroup');
  grpRoles.label = 'ฝ่ายงาน / กลุ่มเป้าหมาย';

  const defaultRoles = [
    { value: 'ครูทุกคน', label: '⭐ ครูทุกคน (All Teachers)' },
    { value: 'หัวหน้างานฝ่ายวิชาการ', label: '📘 หัวหน้างานฝ่ายวิชาการ' },
    { value: 'หัวหน้างานฝ่ายบุคคล', label: '👥 หัวหน้างานฝ่ายบุคคล' },
    { value: 'หัวหน้างานฝ่ายบริหารงานทั่วไป', label: '🏢 หัวหน้างานฝ่ายบริหารงานทั่วไป' },
    { value: 'หัวหน้างานฝ่ายงบประมาณ', label: '💰 หัวหน้างานฝ่ายงบประมาณ' }
  ];

  defaultRoles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.value;
    opt.textContent = r.label;
    grpRoles.appendChild(opt);
  });
  dropdown.appendChild(grpRoles);

  // Group: รายชื่อครูและบุคลากรจาก Google Sheet
  if (AppState.teachers && AppState.teachers.length > 0) {
    const grpTeachers = document.createElement('optgroup');
    grpTeachers.label = 'รายชื่อครูและบุคลากร';
    AppState.teachers.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      grpTeachers.appendChild(opt);
    });
    dropdown.appendChild(grpTeachers);
  }
}

function toggleAssignee(name) {
  name = (name || '').trim();
  if (!name) return;
  const idx = currentDirectorAssignees.indexOf(name);
  if (idx > -1) {
    currentDirectorAssignees.splice(idx, 1);
  } else {
    currentDirectorAssignees.push(name);
  }
  syncAssigneeUI();
}

function addAssignee(name) {
  name = (name || '').trim();
  if (!name) return;
  if (!currentDirectorAssignees.includes(name)) {
    currentDirectorAssignees.push(name);
    syncAssigneeUI();
  }
}

function removeAssignee(name) {
  const idx = currentDirectorAssignees.indexOf(name);
  if (idx > -1) {
    currentDirectorAssignees.splice(idx, 1);
    syncAssigneeUI();
  }
}

function clearAllAssignees() {
  currentDirectorAssignees = [];
  syncAssigneeUI();
}

function onAssigneeSelectChange(selectEl) {
  if (!selectEl) return;
  const val = selectEl.value;
  if (val) {
    addAssignee(val);
    selectEl.value = '';
  }
}

function syncAssigneeUI() {
  const tagsContainer = document.getElementById('directorAssigneeTags');
  const hiddenInput = document.getElementById('directorAssignee');
  const clearBtn = document.getElementById('btnClearAssignees');

  const joined = currentDirectorAssignees.join(', ');
  if (hiddenInput) hiddenInput.value = joined;

  if (tagsContainer) {
    tagsContainer.innerHTML = '';
    if (currentDirectorAssignees.length === 0) {
      tagsContainer.innerHTML = '<span id="assigneeEmptyNotice" style="font-size: 11.5px; color: #94a3b8; font-style: italic;">ยังไม่ได้เลือกผู้รับผิดชอบ (คลิกปุ่มด้านบน หรือเลือกจากรายชื่อ)</span>';
    } else {
      currentDirectorAssignees.forEach(name => {
        const tag = document.createElement('span');
        tag.className = 'assignee-tag';
        tag.innerHTML = `
          <i class="fa-solid fa-user-check"></i>
          <span>${escapeHtml(name)}</span>
          <button type="button" class="assignee-tag-remove" onclick="removeAssignee('${escapeHtml(name)}')" title="ลบชื่อนี้">✕</button>
        `;
        tagsContainer.appendChild(tag);
      });
    }
  }

  // Update quick pills active state
  document.querySelectorAll('.assignee-pill-btn').forEach(btn => {
    const btnName = btn.getAttribute('data-name');
    if (currentDirectorAssignees.includes(btnName)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (clearBtn) {
    clearBtn.style.display = currentDirectorAssignees.length > 0 ? 'inline-flex' : 'none';
  }

  updateDirectorStampPreview();
}

/* ==========================================================================
   Thai Buddhist Era Date Picker Module (ปฏิทินไทย พ.ศ. เลือกวัน/เดือน/ปี ช่องเดียว)
   ========================================================================== */
const ThaiDatePicker = (function() {
  let activeInputId = null;
  let viewYearBE = ThaiDateUtil.getBuddhistYear();
  let viewMonth = new Date().getMonth(); // 0-11
  let selectedDay = new Date().getDate();
  let popupEl = null;

  function init() {
    if (popupEl) return;
    popupEl = document.createElement('div');
    popupEl.id = 'thaiCalendarPopup';
    popupEl.className = 'thai-calendar-popup';
    popupEl.style.display = 'none';
    popupEl.style.position = 'fixed';
    popupEl.style.zIndex = '99999';
    document.body.appendChild(popupEl);

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!popupEl || popupEl.style.display === 'none') return;
      const target = e.target;
      if (popupEl.contains(target)) return;
      if (activeInputId) {
        const input = document.getElementById(activeInputId);
        if (input && (input === target || input.contains(target))) return;
        const parent = input?.parentElement;
        if (parent && parent.contains(target)) return;
      }
      close();
    }, true);

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popupEl && popupEl.style.display !== 'none') {
        close();
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      if (popupEl && popupEl.style.display !== 'none') {
        positionPopup();
      }
    });
  }

  function parseDateString(val) {
    if (!val) return null;
    const str = String(val).trim();
    if (!str) return null;

    // DD/MM/YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      let year = parseInt(dmyMatch[3], 10);
      if (year < 2400) year += 543;
      return { day, month, yearBE: year };
    }

    // YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymdMatch) {
      let year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      if (year < 2400) year += 543;
      return { day, month, yearBE: year };
    }

    // Date object / ISO string
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = d.getDate();
      const month = d.getMonth();
      const yearBE = d.getFullYear() + (d.getFullYear() < 2400 ? 543 : 0);
      return { day, month, yearBE };
    }

    return null;
  }

  function open(inputId) {
    init();
    activeInputId = inputId;
    const input = document.getElementById(inputId);
    const parsed = parseDateString(input?.value);
    const now = new Date();
    const todayYearBE = ThaiDateUtil.getBuddhistYear(now);

    if (parsed) {
      viewYearBE = parsed.yearBE;
      viewMonth = parsed.month;
      selectedDay = parsed.day;
    } else {
      viewYearBE = todayYearBE;
      viewMonth = now.getMonth();
      selectedDay = now.getDate();
    }

    render();
    popupEl.style.display = 'block';
    positionPopup();
  }

  function close() {
    if (popupEl) {
      popupEl.style.display = 'none';
    }
    activeInputId = null;
  }

  function toggle(inputId) {
    init();
    if (popupEl && popupEl.style.display !== 'none' && activeInputId === inputId) {
      close();
    } else {
      open(inputId);
    }
  }

  function positionPopup() {
    if (!activeInputId || !popupEl) return;
    const input = document.getElementById(activeInputId);
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const popupWidth = 295;
    const popupHeight = 310;

    let left = rect.left;
    let top = rect.bottom + 4;

    // Check right screen boundary
    if (left + popupWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - popupWidth - 10);
    }
    if (left < 10) left = 10;

    // Check bottom screen boundary (flip up if needed)
    if (top + popupHeight > window.innerHeight - 10 && rect.top > popupHeight + 10) {
      top = rect.top - popupHeight - 4;
    }

    popupEl.style.top = `${top}px`;
    popupEl.style.left = `${left}px`;
  }

  function prevMonth() {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYearBE--;
    }
    render();
  }

  function nextMonth() {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYearBE++;
    }
    render();
  }

  function onMonthChange(newMonth) {
    viewMonth = parseInt(newMonth, 10);
    render();
  }

  function onYearChange(newYear) {
    viewYearBE = parseInt(newYear, 10);
    render();
  }

  function selectDay(day) {
    if (!activeInputId) return;
    const input = document.getElementById(activeInputId);
    if (input) {
      const dStr = String(day).padStart(2, '0');
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const formatted = `${dStr}/${mStr}/${viewYearBE}`;
      input.value = formatted;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      if (activeInputId === 'receiveDate' && typeof updateInboundStampPreview === 'function') {
        updateInboundStampPreview();
      } else if (activeInputId === 'prop_date' && typeof updateProposalStampPreview === 'function') {
        updateProposalStampPreview();
      } else if (activeInputId === 'dir_date' && typeof updateDirectorStampPreview === 'function') {
        updateDirectorStampPreview();
      }
    }
    close();
  }

  function selectToday() {
    const now = new Date();
    viewYearBE = ThaiDateUtil.getBuddhistYear(now);
    viewMonth = now.getMonth();
    selectDay(now.getDate());
  }

  function render() {
    if (!popupEl) return;
    const now = new Date();
    const todayYearBE = ThaiDateUtil.getBuddhistYear(now);
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();

    const yearCE = viewYearBE - 543;
    const firstDayOfWeek = new Date(yearCE, viewMonth, 1).getDay(); // 0=Sun, 6=Sat
    const daysInMonth = new Date(yearCE, viewMonth + 1, 0).getDate();

    // Month Select Options
    const monthOptions = ThaiDateUtil.thaiMonths.map((mName, idx) => {
      const selected = idx === viewMonth ? 'selected' : '';
      return `<option value="${idx}" ${selected}>${mName}</option>`;
    }).join('');

    // Year Select Options
    const curYear = ThaiDateUtil.getBuddhistYear();
    const years = [];
    for (let y = curYear - 5; y <= curYear + 6; y++) {
      years.push(y);
    }
    if (!years.includes(viewYearBE)) {
      years.push(viewYearBE);
      years.sort((a, b) => a - b);
    }
    const yearOptions = years.map(y => {
      const selected = y === viewYearBE ? 'selected' : '';
      return `<option value="${y}" ${selected}>พ.ศ. ${y}</option>`;
    }).join('');

    // Weekdays
    const weekdaysHtml = `
      <div class="thai-calendar-weekdays">
        <div class="thai-calendar-weekday weekend">อา</div>
        <div class="thai-calendar-weekday">จ</div>
        <div class="thai-calendar-weekday">อ</div>
        <div class="thai-calendar-weekday">พ</div>
        <div class="thai-calendar-weekday">พฤ</div>
        <div class="thai-calendar-weekday">ศ</div>
        <div class="thai-calendar-weekday weekend">ส</div>
      </div>
    `;

    // Days Grid
    let daysHtml = '<div class="thai-calendar-grid">';
    for (let i = 0; i < firstDayOfWeek; i++) {
      daysHtml += '<div class="thai-calendar-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = (d === todayDay && viewMonth === todayMonth && viewYearBE === todayYearBE);
      const isSelected = (d === selectedDay);
      const classes = ['thai-calendar-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');
      daysHtml += `<div class="${classes.join(' ')}" onclick="ThaiDatePicker.selectDay(${d})">${d}</div>`;
    }
    daysHtml += '</div>';

    popupEl.innerHTML = `
      <div class="thai-calendar-header">
        <button type="button" class="thai-calendar-nav-btn" onclick="ThaiDatePicker.prevMonth()" title="เดือนก่อนหน้า">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="thai-calendar-title-selects">
          <select class="thai-calendar-select" onchange="ThaiDatePicker.onMonthChange(this.value)">
            ${monthOptions}
          </select>
          <select class="thai-calendar-select" onchange="ThaiDatePicker.onYearChange(this.value)">
            ${yearOptions}
          </select>
        </div>
        <button type="button" class="thai-calendar-nav-btn" onclick="ThaiDatePicker.nextMonth()" title="เดือนถัดไป">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      ${weekdaysHtml}
      ${daysHtml}
      <div class="thai-calendar-footer">
        <button type="button" class="thai-calendar-footer-btn today-btn" onclick="ThaiDatePicker.selectToday()">
          <i class="fa-solid fa-calendar-day"></i> วันนี้
        </button>
        <button type="button" class="thai-calendar-footer-btn close-btn" onclick="ThaiDatePicker.close()">
          <i class="fa-solid fa-xmark"></i> ปิด
        </button>
      </div>
    `;
  }

  return {
    init,
    open,
    close,
    toggle,
    prevMonth,
    nextMonth,
    onMonthChange,
    onYearChange,
    selectDay,
    selectToday
  };
})();

function initReceiveDateSelectors() {
  ThaiDatePicker.init();
  setReceiveDateToToday();
}

function setReceiveDateToToday() {
  const dateInput = document.getElementById('receiveDate');
  if (dateInput) {
    dateInput.value = ThaiDateUtil.formatThaiDateShort(new Date());
  }
  updateInboundStampPreview();
}

function onReceiveDateSelectChange() {
  updateInboundStampPreview();
}

function initEditReceiveDateSelectors() {
  // Compatible stub for modals
  ThaiDatePicker.init();
}

function setEditReceiveDate(dateStr) {
  const dateInput = document.getElementById('editReceiveDate');
  if (!dateInput) return;

  if (!dateStr) {
    dateInput.value = ThaiDateUtil.formatThaiDateShort(new Date());
    return;
  }

  const formatted = ThaiDateUtil.formatDisplayDate(dateStr);
  dateInput.value = (formatted && formatted !== '-') ? formatted : ThaiDateUtil.formatThaiDateShort(new Date());
}

function onEditReceiveDateChange() {
  // Compatible stub
}

/* ==========================================================================
   File Dropzone & Upload Handler (รองรับแนบหลายไฟล์)
   ========================================================================== */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function initDropzone() {
  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('docFileInput');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectedFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedFiles(e.target.files);
    }
  });
}

async function handleSelectedFiles(files) {
  if (!files || files.length === 0) return;

  const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  const validFiles = Array.from(files).filter(f => validTypes.includes(f.type));

  if (validFiles.length < files.length) {
    showToast('บางไฟล์ไม่ใช่ .pdf หรือรูปภาพ (.jpg, .png) ระบบจะเลือกเฉพาะไฟล์ที่รองรับ', 'warning');
  }

  if (validFiles.length === 0) {
    showToast('กรุณาเลือกไฟล์ .pdf หรือไฟล์รูปภาพ (.jpg, .png)', 'warning');
    return;
  }

  if (!AppState.selectedFiles) {
    AppState.selectedFiles = [];
  }

  for (const file of validFiles) {
    // Prevent duplicate entries
    const duplicate = AppState.selectedFiles.some(f => f.name === file.name && f.size === file.size);
    if (duplicate) continue;

    await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        if (file.type === 'application/pdf') {
          const abReader = new FileReader();
          abReader.onload = () => {
            AppState.selectedFiles.push({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl,
              bytes: new Uint8Array(abReader.result)
            });
            resolve();
          };
          abReader.readAsArrayBuffer(file);
        } else {
          AppState.selectedFiles.push({
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl,
            bytes: null
          });
          resolve();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  AppState.selectedFile = AppState.selectedFiles[0] || null;
  updateFilePreviewUI();
  showToast(`เลือกไฟล์แล้วทั้งหมด ${AppState.selectedFiles.length} ไฟล์`, 'info');
}

function removeSelectedFile(index) {
  if (AppState.selectedFiles && index >= 0 && index < AppState.selectedFiles.length) {
    AppState.selectedFiles.splice(index, 1);
    AppState.selectedFile = AppState.selectedFiles[0] || null;
    const fileInput = document.getElementById('docFileInput');
    if (fileInput) fileInput.value = '';
    updateFilePreviewUI();
  }
}

function clearSelectedFiles() {
  AppState.selectedFiles = [];
  AppState.selectedFile = null;
  AppState.inboundCustomPos = null;
  AppState.inboundStampScale = 1.0;
  ActivePositionPicker.isLocked = false;
  const fileInput = document.getElementById('docFileInput');
  if (fileInput) fileInput.value = '';
  const posBadge = document.getElementById('inboundPosBadge');
  if (posBadge) {
    posBadge.textContent = '📍 ขวาบน';
    posBadge.className = 'badge badge-info';
    posBadge.style.background = '';
    posBadge.style.color = '';
  }
  updateFilePreviewUI();
}

function clearSelectedFile() {
  clearSelectedFiles();
}

function updateFilePreviewUI() {
  const previewDiv = document.getElementById('selectedFilePreview');
  const countBadge = document.getElementById('fileCountBadge');
  if (!previewDiv) return;

  const files = AppState.selectedFiles || [];
  const count = files.length;
  if (countBadge) {
    countBadge.textContent = count > 0 ? `(เลือกแล้ว ${count} ไฟล์)` : '';
  }

  if (count === 0) {
    previewDiv.innerHTML = '';
    return;
  }

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; margin-bottom: 5px;">
      <span style="font-size: 11.5px; font-weight: 600; color: #1e40af;">
        <i class="fa-solid fa-folder-open"></i> รายการไฟล์แนบ (${count} ไฟล์):
      </span>
      <div style="display: flex; gap: 6px;">
        <button type="button" class="btn-edit-sm" onclick="document.getElementById('docFileInput').click()" style="padding: 1px 7px; font-size: 11px;">
          <i class="fa-solid fa-plus"></i> เพิ่มไฟล์อีก
        </button>
        <button type="button" class="btn-danger-sm" onclick="clearSelectedFiles()" style="padding: 1px 7px; font-size: 11px;">
          <i class="fa-solid fa-trash-can"></i> ล้างทั้งหมด
        </button>
      </div>
    </div>
    <div class="file-preview-list">
  `;

  files.forEach((file, index) => {
    const isPdf = file.type === 'application/pdf';
    const isPrimary = index === 0;
    const sizeStr = formatFileSize(file.size);
    html += `
      <div class="file-preview-item" style="${isPrimary ? 'background:#eff6ff; border-color:#bfdbfe;' : ''}">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <i class="fa-solid ${isPdf ? 'fa-file-pdf text-danger' : 'fa-file-image text-primary'}" style="font-size: 15px; flex-shrink: 0;"></i>
          <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; ${isPrimary ? 'background:#2563eb; color:#fff;' : 'background:#64748b; color:#fff;'}; flex-shrink: 0;">
            ${isPrimary ? 'เอกสารหลัก (ประทับตรา)' : 'เอกสารแนบ ' + index}
          </span>
          <span title="${escapeHtml(file.name)}" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">
            ${escapeHtml(file.name)}
          </span>
          <span style="font-size: 11px; color: #94a3b8; flex-shrink: 0;">(${sizeStr})</span>
        </div>
        <button type="button" class="btn-outline btn-sm" onclick="removeSelectedFile(${index})" title="ลบไฟล์นี้" style="border: none; color: #ef4444; padding: 2px 6px; cursor: pointer;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  });

  html += '</div>';
  previewDiv.innerHTML = html;
}

/* ==========================================================================
   Helper: Create Sample Document
   ========================================================================== */
async function generateSampleDoc() {
  showToast('กำลังสร้างตัวอย่างหนังสือราชการจำลอง...', 'info');
  try {
    const pdfBytes = await StampEngine.createSampleDocumentPdf();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const dataUrl = await blobToDataUrl(blob);
    const sampleFile = {
      name: `หนังสือราชการ_ตัวอย่าง_${Date.now().toString().slice(-4)}.pdf`,
      type: 'application/pdf',
      size: pdfBytes.length,
      dataUrl: dataUrl,
      bytes: pdfBytes
    };
    if (!AppState.selectedFiles) AppState.selectedFiles = [];
    AppState.selectedFiles.push(sampleFile);
    AppState.selectedFile = AppState.selectedFiles[0];
    updateFilePreviewUI();
    showToast('สร้างตัวอย่างหนังสือราชการสำเร็จ พร้อมลงรับ!', 'success');
    return sampleFile;
  } catch (err) {
    console.error('generateSampleDoc error:', err);
    showToast('เกิดข้อผิดพลาดในการสร้างเอกสารตัวอย่าง', 'danger');
    return null;
  }
}

/* ==========================================================================
   Latest Book Number Placeholder & Calculation
   ========================================================================== */
function getLatestBookNumberRecord() {
  if (!AppState.records || AppState.records.length === 0) return null;
  let maxNum = -1;
  let bestRec = null;
  for (const r of AppState.records) {
    if (!r.bookNo) continue;
    const m = String(r.bookNo).match(/^(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxNum) {
        maxNum = num;
        bestRec = r;
      }
    }
  }
  return bestRec || AppState.records[0];
}

function updateLatestBookNoPlaceholder() {
  const bookNoInput = document.getElementById('bookNo');
  if (!bookNoInput) return;

  let latestNo = '';
  const currentBEYear = ThaiDateUtil.getBuddhistYear();
  const latestRec = getLatestBookNumberRecord();

  if (latestRec && latestRec.bookNo) {
    latestNo = String(latestRec.bookNo);
  } else {
    latestNo = `0001/${currentBEYear}`;
  }

  // Faded placeholder showing latest saved number
  bookNoInput.placeholder = `เลขล่าสุด: ${latestNo}`;
  const hintEl = document.getElementById('latestBookNoHint');
  if (hintEl) {
    hintEl.textContent = `เลขล่าสุดในระบบ: ${latestNo}`;
  }
}

function useNextSequentialBookNo() {
  const bookNoInput = document.getElementById('bookNo');
  if (!bookNoInput) return;

  const currentBEYear = ThaiDateUtil.getBuddhistYear();
  let nextSeq = 1;
  let hasSlash = false;

  const latestRec = getLatestBookNumberRecord();
  if (latestRec && latestRec.bookNo) {
    const raw = String(latestRec.bookNo).trim();
    hasSlash = raw.includes('/');
    const match = raw.match(/^(\d+)/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  if (hasSlash) {
    const padded = String(nextSeq).padStart(4, '0');
    bookNoInput.value = `${padded}/${currentBEYear}`;
  } else {
    bookNoInput.value = String(nextSeq);
  }
  updateInboundStampPreview();
}

/* ==========================================================================
   Live Stamp 1 Preview for Inbound Registration Form
   ========================================================================== */
async function updateInboundStampPreview() {
  const bookNoInput = document.getElementById('bookNo');
  const receiveDateInput = document.getElementById('receiveDate');
  const receiveTimeInput = document.getElementById('receiveTime');
  const container = document.getElementById('inboundStampPreviewContainer');
  if (!container) return;

  const currentBEYear = ThaiDateUtil.getBuddhistYear();
  const bookNo = (bookNoInput?.value || '').trim() || (AppState.records[0]?.bookNo || `0001/${currentBEYear}`);
  const receiveDate = (receiveDateInput?.value || '').trim() || ThaiDateUtil.formatThaiDateShort(new Date());
  const receiveTime = (receiveTimeInput?.value || '').trim() || ThaiDateUtil.formatThaiTimeString(new Date());

  try {
    const stamp1 = await StampEngine.renderStamp1Canvas({
      bookNo,
      receiveDate,
      receiveTime
    });
    container.innerHTML = `<img src="${stamp1.dataUrl}" alt="ตัวอย่างตราปั้มหนังสือรับ" style="max-height: 105px; width: auto; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); background: #ffffff;">`;
  } catch (err) {
    console.warn('Error rendering inbound stamp preview:', err);
  }
}

/* ==========================================================================
   Save Inbound Record (Step 1: Stamping Stamp 1 immediately)
   ========================================================================== */
async function saveInboundDocument(e) {
  if (e) e.preventDefault();

  const bookNoInput = document.getElementById('bookNo');
  const receiveDateInput = document.getElementById('receiveDate');
  const receiveTimeInput = document.getElementById('receiveTime');
  const docTitleInput = document.getElementById('docTitle');
  const saveBtn = document.getElementById('saveInboundBtn');

  const bookNo = (bookNoInput.value || '').trim();
  const receiveDate = (receiveDateInput.value || '').trim();
  const receiveTime = (receiveTimeInput.value || '').trim();
  const title = (docTitleInput.value || '').trim() || 'หนังสือราชการรับเข้า';

  if (!bookNo) {
    showToast('กรุณากรอกเลขหนังสือรับ', 'warning');
    bookNoInput.focus();
    return;
  }

  if (!receiveDate) {
    showToast('กรุณาระบุวันที่รับ', 'warning');
    receiveDateInput.focus();
    return;
  }

  // Must select an actual document file - never create dummy/sample files on our own
  if (!AppState.selectedFiles || AppState.selectedFiles.length === 0) {
    showToast('กรุณาเลือกไฟล์เอกสารแนบที่ต้องการลงรับ (PDF หรือ รูปภาพ)', 'warning');
    const fileInput = document.getElementById('docFileInput');
    if (fileInput) fileInput.click();
    return;
  }

  // Set loading state
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังประทับตราและบันทึก...';
  }

  try {
    const primaryFile = AppState.selectedFiles[0];
    if (!primaryFile) {
      showToast('ไม่พบไฟล์เอกสารสำหรับประทับตรา กรุณาลองใหม่อีกครั้ง', 'warning');
      return;
    }

    // 1. Render Stamp 1 Canvas
    const stamp1 = await StampEngine.renderStamp1Canvas({
      bookNo,
      receiveDate,
      receiveTime
    });

    let primaryStampedDataUrl = null;
    const stamp1Pos = AppState.inboundCustomPos || {
      ...getStampPositionValues('inbound'),
      scale: AppState.inboundStampScale || 1.0
    };

    // 2. Stamp immediately onto primary document
    if (primaryFile.type === 'application/pdf') {
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: primaryFile.bytes,
        stamp1Canvas: stamp1.canvas,
        stamp1Pos: stamp1Pos
      });

      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      primaryStampedDataUrl = await blobToDataUrl(blob);
    } else {
      // Image stamping
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: primaryFile.dataUrl,
        stamp1Canvas: stamp1.canvas,
        stamp1Pos: stamp1Pos
      });
      primaryStampedDataUrl = stampedImg.dataUrl;
    }

    // 3. Build processed files array
    const filesList = AppState.selectedFiles.map((f, idx) => ({
      id: 'f_' + Date.now() + '_' + idx,
      name: f.name,
      type: f.type,
      size: f.size,
      isPrimary: idx === 0,
      originalDataUrl: f.dataUrl,
      stampedDataUrl: idx === 0 ? primaryStampedDataUrl : null
    }));

    // 4. Create document record object
    const newRecord = {
      id: 'doc_' + Date.now(),
      orderNo: AppState.records.length + 1,
      bookNo,
      receiveDate,
      receiveTime,
      title,
      fileName: primaryFile.name,
      fileType: primaryFile.type,
      originalDataUrl: primaryFile.dataUrl,
      stampedDataUrl: primaryStampedDataUrl,
      stamp1Pos: stamp1Pos,
      inboundCustomPos: stamp1Pos,
      files: filesList,
      status: 'รอเสนอ ผอ.', // Step 1 complete -> Next is Step 2
      step: 1,
      proposalData: null,
      directorData: null,
      assignee: '-', // Pending full completion
      updatedAt: new Date().toISOString()
    };

    // Prepend to records (newest on top)
    AppState.records.unshift(newRecord);
    reindexRecords();
    saveRecordsToStorage();

    // Sync to GAS if URL is present
    syncToGasIfAvailable('saveRecord', newRecord);
    if (!AppState.gasWebAppUrl) {
      showToast('บันทึกในเครื่องแล้ว (หากต้องการบันทึกลง Google Sheet คลิก "เชื่อมต่อ Google Sheet" ที่แถบด้านบน)', 'warning');
    }

    // Reset Form
    bookNoInput.value = '';
    docTitleInput.value = '';
    clearSelectedFiles();
    AppState.inboundCustomPos = null;
    const posBadge = document.getElementById('inboundPosBadge');
    if (posBadge) {
      posBadge.textContent = '📍 ขวาบน';
      posBadge.className = 'badge badge-info';
      posBadge.style.background = '';
      posBadge.style.color = '';
    }
    setReceiveDateToToday();
    updateLatestBookNoPlaceholder();

    renderAllTables();
    updateKpiStats();

    const fileCountMsg = filesList.length > 1 ? ` (${filesList.length} ไฟล์แนบ)` : '';
    showToast(`ลงรับหนังสือเลขที่ ${bookNo} สำเร็จ! ตราประทับถูกพิมพ์ลงบนไฟล์หลักเรียบร้อย${fileCountMsg}`, 'success');

    // Prompt user to switch to "รอลงนาม"
    setTimeout(() => {
      switchTab('pending');
    }, 600);

  } catch (err) {
    console.error('Error saving inbound record:', err);
    showToast('เกิดข้อผิดพลาดในการประทับตราหรือบันทึก: ' + err.message, 'danger');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-stamp"></i> บันทึกข้อมูลและประทับตรา';
    }
  }
}

/* ==========================================================================
   Table Rendering
   ========================================================================== */
function sortRecordsNewestFirst() {
  if (!AppState.records || !Array.isArray(AppState.records)) return;
  AppState.records.sort((a, b) => {
    // 1. Compare numeric bookNo
    const aMatch = String(a.bookNo || '').match(/^(\d+)/);
    const bMatch = String(b.bookNo || '').match(/^(\d+)/);
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      if (aNum !== bNum) return bNum - aNum; // Newest / highest number first
    }
    // 2. Compare numeric orderNo
    const aOrder = parseInt(a.orderNo, 10) || 0;
    const bOrder = parseInt(b.orderNo, 10) || 0;
    if (aOrder !== bOrder) return bOrder - aOrder;

    // 3. Compare updatedAt or id
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function reindexRecords() {
  sortRecordsNewestFirst();
  AppState.records.forEach((r, idx) => {
    r.orderNo = idx + 1;
  });
}

function renderAllTables() {
  renderInboundTable();
  renderPendingTable();
  renderSearchTable();
}

// 1. Table in Tab 1: รายการหนังสือรับ
function renderInboundTable() {
  const tbody = document.getElementById('inboundTableBody');
  const countText = document.getElementById('inboundRecordCountText');
  const toggleBtn = document.getElementById('btnToggleInboundShowAll');
  if (!tbody) return;

  const limit = 5;

  if (AppState.records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: #94a3b8;">
          <i class="fa-regular fa-folder-open" style="font-size: 26px; margin-bottom: 6px; display: block;"></i>
          ยังไม่มีรายการหนังสือรับในระบบ กรุณากรอกแบบฟอร์มด้านบนเพื่อลงรับหนังสือ
        </td>
      </tr>
    `;
    if (countText) countText.textContent = 'แสดง 0 รายการ';
    if (toggleBtn) toggleBtn.style.display = 'none';
    return;
  }

  // Show 5 items by default or all if toggled
  const displayRecords = AppState.showAllInbound ? AppState.records : AppState.records.slice(0, limit);

  tbody.innerHTML = displayRecords.map((r, i) => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${i + 1}</td>
      <td style="font-weight: 600; color: #2563eb;">${escapeHtml(r.bookNo)}</td>
      <td>
        <div>${escapeHtml(ThaiDateUtil.formatDisplayDate(r.receiveDate))}</div>
        <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(r.receiveTime)}</div>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewDocument('${r.id}')" title="เปิดดูเอกสารประทับตรา" style="padding: 3px 8px; font-size: 12px;">
          <i class="fa-solid fa-file-signature text-primary"></i> ${escapeHtml(r.fileName || 'ดูไฟล์')}
          ${(r.files && r.files.length > 1) ? `<span style="background:#2563eb; color:#fff; border-radius:10px; font-size:10px; padding:1px 6px; margin-left:4px; font-weight:600;">${r.files.length} ไฟล์</span>` : ''}
        </button>
      </td>
      <td>${getStatusBadge(r.status)}</td>
      <td style="white-space: nowrap; text-align: center;">
        <button class="btn-edit-sm" onclick="openEditModal('${r.id}')" title="แก้ไขข้อมูล">
          <i class="fa-solid fa-pen-to-square"></i> แก้ไข
        </button>
        <button class="btn-danger-sm" onclick="deleteRecord('${r.id}')" title="ลบรายการ" style="margin-left: 4px;">
          <i class="fa-solid fa-trash"></i> ลบ
        </button>
      </td>
    </tr>
  `).join('');

  if (countText) {
    countText.textContent = `แสดง ${displayRecords.length} จากทั้งหมด ${AppState.records.length} รายการ`;
  }

  if (toggleBtn) {
    if (AppState.records.length > limit) {
      toggleBtn.style.display = 'inline-flex';
      if (!AppState.showAllInbound) {
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-down"></i> เพิ่มเติม (ดูทั้งหมด ${AppState.records.length} รายการ)`;
      } else {
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> ย่อลง (แสดง ${limit} รายการล่าสุด)`;
      }
    } else {
      toggleBtn.style.display = 'none';
    }
  }
}

function toggleShowAllInbound() {
  AppState.showAllInbound = !AppState.showAllInbound;
  renderInboundTable();
}

// 2. Table in Tab 2: รอลงนาม
function renderPendingTable() {
  const tbody = document.getElementById('pendingTableBody');
  const countText = document.getElementById('pendingRecordCountText');
  const toggleBtn = document.getElementById('btnTogglePendingShowAll');
  if (!tbody) return;

  const limit = 5;

  if (AppState.records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">
          <i class="fa-solid fa-signature" style="font-size: 26px; margin-bottom: 6px; display: block;"></i>
          ยังไม่มีรายการหนังสือรอลงนาม
        </td>
      </tr>
    `;
    if (countText) countText.textContent = 'แสดง 0 รายการ';
    if (toggleBtn) toggleBtn.style.display = 'none';
    return;
  }

  // Show 5 items by default or all if toggled
  const displayRecords = AppState.showAllPending ? AppState.records : AppState.records.slice(0, limit);

  tbody.innerHTML = displayRecords.map((r, i) => {
    const isCompleted = r.status === 'เสร็จสิ้น';
    const isReadyForDirector = r.proposalData !== null;

    return `
      <tr>
        <td style="text-align: center; font-weight: 600;">${i + 1}</td>
        <td style="font-weight: 600; color: #2563eb;">${escapeHtml(r.bookNo)}</td>
        <td>${escapeHtml(ThaiDateUtil.formatDisplayDate(r.receiveDate))}</td>
        <td>
          <a href="javascript:void(0)" onclick="viewDocument('${r.id}')" title="คลิกเพื่อดูเอกสาร" style="font-weight: 500; color: #1e3a5f; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            <span>${escapeHtml(r.title)}</span>
            ${(r.files && r.files.length > 1) ? `<span style="background:#e0e7ff; color:#3730a3; border-radius:10px; font-size:10.5px; padding:1px 6px; font-weight:600;">${r.files.length} ไฟล์</span>` : ''}
          </a>
        </td>
        <td>
          ${isCompleted ? `
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${(r.assignee || '').split(',').map(n => n.trim()).filter(Boolean).map(n => `
                <span class="responsible-teacher-badge">
                  <i class="fa-solid fa-user-check"></i> ${escapeHtml(n)}
                </span>
              `).join('')}
            </div>
          ` : `
            <span style="color: #94a3b8; font-style: italic; font-size: 12px;">รอ ผอ. สั่งการ</span>
          `}
        </td>
        <td>${getStatusBadge(r.status)}</td>
        <td style="white-space: nowrap; text-align: center;">
          <!-- ปุ่ม เสนอ ผอ. -->
          <button class="btn btn-sm ${isReadyForDirector ? 'btn-outline' : 'btn-amber'}"
                  onclick="openProposalModal('${r.id}')"
                  title="บันทึกเสนอ ผอ. (ตราปั้มที่ 2)">
            <i class="fa-solid fa-file-import"></i> เสนอ ผอ.
          </button>

          <!-- ปุ่ม ความคิดเห็น ผอ. -->
          <button class="btn btn-sm ${isCompleted ? 'btn-outline' : 'btn-primary'}"
                  onclick="openDirectorModal('${r.id}')"
                  title="บันทึกความคิดเห็น ผอ. (ตราปั้มที่ 3)"
                  style="margin-left: 4px;">
            <i class="fa-solid fa-stamp"></i> ความคิดเห็น ผอ.
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (countText) {
    countText.textContent = `แสดง ${displayRecords.length} จากทั้งหมด ${AppState.records.length} รายการ`;
  }

  if (toggleBtn) {
    if (AppState.records.length > limit) {
      toggleBtn.style.display = 'inline-flex';
      if (!AppState.showAllPending) {
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-down"></i> เพิ่มเติม (ดูทั้งหมด ${AppState.records.length} รายการ)`;
      } else {
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> ย่อลง (แสดง ${limit} รายการล่าสุด)`;
      }
    } else {
      toggleBtn.style.display = 'none';
    }
  }
}

function toggleShowAllPending() {
  AppState.showAllPending = !AppState.showAllPending;
  renderPendingTable();
}

// 3. Search & Archive Table
function renderSearchTable(filteredRecords = null) {
  const tbody = document.getElementById('searchTableBody');
  if (!tbody) return;

  const dataset = filteredRecords || AppState.records;

  if (dataset.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: #94a3b8;">
          ไม่พบข้อมูลหนังสือรับที่ค้นหา
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = dataset.map((r, i) => `
    <tr>
      <td style="text-align: center;">${i + 1}</td>
      <td style="font-weight: 600; color: #1e40af;">${escapeHtml(r.bookNo)}</td>
      <td>${escapeHtml(ThaiDateUtil.formatDisplayDate(r.receiveDate))}</td>
      <td>${escapeHtml(r.title)}</td>
      <td>
        ${r.status === 'เสร็จสิ้น' ? `
          <span class="responsible-teacher-badge">
            <i class="fa-solid fa-user-check"></i> ${escapeHtml(r.assignee)}
          </span>
        ` : '-'}
      </td>
      <td>${getStatusBadge(r.status)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="downloadRecordDirectly('${r.id}')" title="ดาวน์โหลดเอกสารประทับตรา">
          <i class="fa-solid fa-download"></i> ดาวน์โหลด
        </button>
      </td>
    </tr>
  `).join('');
}

// Direct download without viewing modal
function downloadRecordDirectly(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  const files = (doc.files && doc.files.length > 0) ? doc.files : null;
  if (files && files.length > 1) {
    downloadAllDocFiles(doc);
  } else {
    const dataUrl = doc.stampedDataUrl || doc.originalDataUrl;
    if (!dataUrl) {
      showToast('ไม่พบไฟล์เอกสารสำหรับดาวน์โหลด', 'warning');
      return;
    }

    const ext = doc.fileType === 'application/pdf' ? 'pdf' : 'png';
    const cleanBookNo = (doc.bookNo || 'เอกสาร').replace(/[\/\\?%*:|"<>]/g, '-');
    const fileName = `หนังสือรับ_${cleanBookNo}_ประทับตรา.${ext}`;

    downloadFile(dataUrl, fileName);
    showToast(`กำลังดาวน์โหลดเอกสารเลขที่: ${doc.bookNo}`, 'success');
  }
}

function filterRecords() {
  const query = (document.getElementById('searchQuery').value || '').toLowerCase();
  const statusFilter = document.getElementById('searchStatusFilter').value;

  const filtered = AppState.records.filter(r => {
    const matchQuery = !query ||
      r.bookNo.toLowerCase().includes(query) ||
      r.title.toLowerCase().includes(query) ||
      (r.assignee && r.assignee.toLowerCase().includes(query));

    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchQuery && matchStatus;
  });

  renderSearchTable(filtered);
}

function getStatusBadge(status) {
  if (status === 'เสร็จสิ้น') {
    return `<span class="badge-status green"><i class="fa-solid fa-check"></i> เสร็จสิ้น</span>`;
  }
  if (status === 'รอ ผอ. ลงนาม') {
    return `<span class="badge-status amber"><i class="fa-solid fa-hourglass-half"></i> รอ ผอ. ลงนาม</span>`;
  }
  return `<span class="badge-status blue"><i class="fa-solid fa-inbox"></i> รอเสนอ ผอ.</span>`;
}

function updateKpiStats() {
  const total = AppState.records.length;
  const pendingProposal = AppState.records.filter(r => r.status === 'รอเสนอ ผอ.').length;
  const pendingDirector = AppState.records.filter(r => r.status === 'รอ ผอ. ลงนาม').length;
  const completed = AppState.records.filter(r => r.status === 'เสร็จสิ้น').length;

  safeSetText('statTotal', total);
  safeSetText('statProposal', pendingProposal);
  safeSetText('statDirector', pendingDirector);
  safeSetText('statCompleted', completed);

  safeSetText('badgePendingCount', pendingProposal + pendingDirector);

  // Sidebar badge indicators
  safeSetText('sideBadgeReceive', total);
  safeSetText('sideBadgeOutbound', AppState.outboundRecords ? AppState.outboundRecords.length : 0);
  safeSetText('sideBadgeOrder', AppState.orderRecords ? AppState.orderRecords.length : 0);
}

function safeSetText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ==========================================================================
   Signature Pads Init
   ========================================================================== */
function initSignaturePads() {
  AppState.sigPadProposal = createSigPad('sigCanvasProposal', () => updateProposalStampPreview());
  AppState.sigPadDirector = createSigPad('sigCanvasDirector', () => updateDirectorStampPreview());
}

function createSigPad(canvasId, onChange) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let hasDrawn = false;
  let loadedImg = null;
  let currentDpr = 2;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    currentDpr = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * currentDpr);
    canvas.height = Math.round(rect.height * currentDpr);
    ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#002299'; // Deep official blue ink

    if (loadedImg) {
      renderLoadedImage();
    }
  }

  function renderLoadedImage() {
    if (!loadedImg) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pad = Math.round(12 * currentDpr);
    const availW = Math.max(canvas.width - pad * 2, 20);
    const availH = Math.max(canvas.height - pad * 2, 20);
    const scale = Math.min(availW / loadedImg.width, availH / loadedImg.height);
    const drawW = loadedImg.width * scale;
    const drawH = loadedImg.height * scale;
    const drawX = Math.round((canvas.width - drawW) / 2);
    const drawY = Math.round((canvas.height - drawH) / 2);

    ctx.drawImage(loadedImg, drawX, drawY, drawW, drawH);

    ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    hasDrawn = true;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function start(e) {
    e.preventDefault();
    isDrawing = true;
    hasDrawn = true;
    // Manual drawing overrides attached image
    loadedImg = null;
    if (canvasId === 'sigCanvasProposal') AppState.attachedSigProposal = null;
    if (canvasId === 'sigCanvasDirector') AppState.attachedSigDirector = null;

    const pos = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCoords(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stop() {
    if (isDrawing) {
      isDrawing = false;
      if (typeof onChange === 'function') {
        onChange();
      }
    }
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stop);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stop);

  return {
    resize() {
      resizeCanvas();
    },
    clear() {
      loadedImg = null;
      if (canvasId === 'sigCanvasProposal') AppState.attachedSigProposal = null;
      if (canvasId === 'sigCanvasDirector') AppState.attachedSigDirector = null;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
      hasDrawn = false;
      if (typeof onChange === 'function') {
        onChange();
      }
    },
    isEmpty() {
      return !hasDrawn && !loadedImg;
    },
    toDataUrl() {
      if (!hasDrawn && !loadedImg) return null;
      return canvas.toDataURL('image/png');
    },
    loadDataUrl(url, callback) {
      if (!url) {
        loadedImg = null;
        hasDrawn = false;
        return;
      }
      const img = new Image();
      img.onload = () => {
        loadedImg = img;
        resizeCanvas();
        renderLoadedImage();
        if (typeof onChange === 'function') onChange();
        if (typeof callback === 'function') callback();
      };
      img.src = url;
    }
  };
}

/* ==========================================================================
   Interactive Modal 1: เสนอ ผอ. (Stamp 2 - Bottom Left)
   ========================================================================== */
function openProposalModal(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  AppState.currentDocId = docId;

  // Set Modal title
  document.getElementById('proposalModalDocNo').textContent = doc.bookNo;

  // Clear or load existing form data
  const data = doc.proposalData || {};
  document.getElementById('prop_toKnow').checked = !!data.toKnow;
  document.getElementById('prop_toAct').checked = !!data.toAct;
  document.getElementById('prop_toConsider').checked = !!data.toConsider;
  document.getElementById('prop_toComply').checked = !!data.toComply;
  document.getElementById('prop_toNotify').checked = !!data.toNotify;
  document.getElementById('prop_note').value = data.note || '';

  // Proposal Date
  const propDateInput = document.getElementById('prop_date');
  if (propDateInput) {
    propDateInput.value = data.date || doc.receiveDate || ThaiDateUtil.formatThaiDateShort(new Date());
  }

  // Signature Scale
  AppState.sigScaleProposal = Number(data.signatureScale) || 1.0;
  const slider = document.getElementById('sigScaleProposal');
  if (slider) slider.value = AppState.sigScaleProposal;
  const txt = document.getElementById('sigScaleProposalText');
  if (txt) txt.textContent = Math.round(AppState.sigScaleProposal * 100) + '%';

  // Restore or reset stamp position
  const savedPos = doc.stamp2Pos || { preset: 'bottom-left', offsetX: 0, offsetY: 0 };
  setStampPositionValues('proposal', savedPos);

  AppState.attachedSigProposal = data.signatureDataUrl || null;

  // Show modal first so canvas layout dimensions are computed
  openModal('proposalModal');

  // Load signature with canvas properly laid out
  setTimeout(() => {
    if (AppState.sigPadProposal) {
      AppState.sigPadProposal.resize();
      if (data.signatureDataUrl) {
        AppState.sigPadProposal.loadDataUrl(data.signatureDataUrl, () => {
          updateProposalStampPreview();
        });
      } else {
        AppState.sigPadProposal.clear();
        updateProposalStampPreview();
      }
    } else {
      updateProposalStampPreview();
    }
  }, 50);
}

async function updateProposalStampPreview() {
  const checkboxes = {
    toKnow: document.getElementById('prop_toKnow').checked,
    toAct: document.getElementById('prop_toAct').checked,
    toConsider: document.getElementById('prop_toConsider').checked,
    toComply: document.getElementById('prop_toComply').checked,
    toNotify: document.getElementById('prop_toNotify').checked
  };
  const note = (document.getElementById('prop_note').value || '').trim();
  const date = (document.getElementById('prop_date')?.value || '').trim();
  const signatureDataUrl = AppState.attachedSigProposal || (AppState.sigPadProposal && !AppState.sigPadProposal.isEmpty() ? AppState.sigPadProposal.toDataUrl() : null);
  const signatureScale = AppState.sigScaleProposal || 1.0;

  try {
    const stamp2 = await StampEngine.renderStamp2Canvas({
      checkboxes,
      note,
      signatureDataUrl,
      signatureScale,
      date
    });

    const previewContainer = document.getElementById('proposalStampPreviewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${stamp2.dataUrl}" style="max-width:100%; height:auto; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); background:#ffffff;">`;
    }
  } catch (err) {
    console.warn(err);
  }
}

async function handleSaveProposal() {
  const doc = AppState.records.find(r => r.id === AppState.currentDocId);
  if (!doc) return;

  const btn = document.getElementById('btnSaveProposal');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังประทับตรา...';
  }

  try {
    const checkboxes = {
      toKnow: document.getElementById('prop_toKnow').checked,
      toAct: document.getElementById('prop_toAct').checked,
      toConsider: document.getElementById('prop_toConsider').checked,
      toComply: document.getElementById('prop_toComply').checked,
      toNotify: document.getElementById('prop_toNotify').checked
    };
    const note = (document.getElementById('prop_note').value || '').trim();
    const date = (document.getElementById('prop_date')?.value || '').trim() || doc.receiveDate;
    const signatureDataUrl = AppState.attachedSigProposal || (AppState.sigPadProposal && !AppState.sigPadProposal.isEmpty() ? AppState.sigPadProposal.toDataUrl() : null);
    const signatureScale = AppState.sigScaleProposal || 1.0;

    // 1. Render Stamp 1 & Stamp 2 Canvases
    const stamp1 = await StampEngine.renderStamp1Canvas({
      bookNo: doc.bookNo,
      receiveDate: doc.receiveDate,
      receiveTime: doc.receiveTime
    });

    const stamp2 = await StampEngine.renderStamp2Canvas({
      checkboxes,
      note,
      signatureDataUrl,
      signatureScale,
      date
    });

    // 2. Re-stamp Document with Stamp 1 and Stamp 2 (with user-defined positions)
    const stamp1Pos = doc.inboundCustomPos || doc.stamp1Pos || { preset: 'top-right', offsetX: 0, offsetY: 0 };
    const stamp2Pos = doc.proposalCustomPos || doc.stamp2Pos || getStampPositionValues('proposal');
    doc.stamp1Pos = stamp1Pos;
    doc.inboundCustomPos = stamp1Pos;
    doc.stamp2Pos = stamp2Pos;
    doc.proposalCustomPos = stamp2Pos;

    if (doc.fileType === 'application/pdf') {
      const originalBytes = await ensureDocumentBytes(doc);
      if (!originalBytes || originalBytes.length === 0) {
        throw new Error('ไม่พบไฟล์เอกสาร PDF ต้นฉบับในเครื่องหรือบน Google Drive');
      }
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: originalBytes,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2.canvas,
        stamp1Pos: stamp1Pos,
        stamp2Pos: stamp2Pos
      });
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      doc.stampedDataUrl = await blobToDataUrl(blob);
    } else {
      if (!doc.originalDataUrl && doc.driveFileUrl) {
        const loaded = await fetchFileFromDriveViaGas(doc.driveFileUrl);
        if (loaded && loaded.dataUrl) doc.originalDataUrl = loaded.dataUrl;
      }
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: doc.originalDataUrl,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2.canvas,
        stamp1Pos: stamp1Pos,
        stamp2Pos: stamp2Pos
      });
      doc.stampedDataUrl = stampedImg.dataUrl;
    }

    if (doc.files && doc.files.length > 0) {
      doc.files[0].stampedDataUrl = doc.stampedDataUrl;
    }

    doc.stamp2Pos = stamp2Pos;

    // Save proposal data to record
    doc.proposalData = {
      checkboxes,
      note,
      date,
      signatureDataUrl,
      signatureScale,
      timestamp: new Date().toISOString()
    };
    doc.status = 'รอ ผอ. ลงนาม';
    doc.step = 2;
    doc.updatedAt = new Date().toISOString();

    saveRecordsToStorage();
    syncToGasIfAvailable('updateProposal', doc);

    closeModal('proposalModal');
    renderAllTables();
    updateKpiStats();

    showToast(`ประทับตรา "เสนอ ผอ." ลงด้านซ้ายล่างสำเร็จ! สถานะเปลี่ยนเป็น: รอ ผอ. ลงนาม`, 'success');
  } catch (err) {
    console.error('Error saving proposal stamp:', err);
    showToast('เกิดข้อผิดพลาดในการประทับตราเสนอ ผอ.: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-stamp"></i> บันทึกและประทับตราเสนอ ผอ.';
    }
  }
}

// Remove white paper background from uploaded signature images, preserving complete ink strokes and colors
function removeImageBackground(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    try {
      // Limit resolution to maximum 1600px to keep file size reasonable while preserving ultra-crisp fidelity
      let srcW = img.width;
      let srcH = img.height;
      const maxDim = 1600;
      if (srcW > maxDim || srcH > maxDim) {
        const factor = maxDim / Math.max(srcW, srcH);
        srcW = Math.round(srcW * factor);
        srcH = Math.round(srcH * factor);
      }

      const c = document.createElement('canvas');
      c.width = srcW;
      c.height = srcH;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, srcW, srcH);

      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      const width = c.width;
      const height = c.height;

      // Check if image already has transparent pixels (e.g. transparent PNG signature)
      let hasTransparentPixels = false;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] < 200) {
          hasTransparentPixels = true;
          break;
        }
      }

      if (hasTransparentPixels) {
        // Image already transparent -> keep all ink pixels and original colors exactly as attached
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (d[idx + 3] > 15) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const pad = 10;
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW + pad * 2;
          cropCanvas.height = cropH + pad * 2;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.drawImage(c, minX, minY, cropW, cropH, pad, pad, cropW, cropH);
          callback(cropCanvas.toDataURL('image/png'));
          return;
        }
        callback(dataUrl);
        return;
      }

      // Scanned/photographed signature on white/light paper:
      // Sample borders to find true paper brightness
      const samples = [
        [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
        [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
      ];
      let maxBgB = 250;
      for (const [sx, sy] of samples) {
        const idx = (sy * width + sx) * 4;
        const sb = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        if (sb > maxBgB) maxBgB = sb;
      }

      const whiteThreshold = Math.max(242, Math.min(253, maxBgB - 5));
      const featherStart = whiteThreshold - 25;

      let minX = width, minY = height, maxX = -1, maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = d[idx];
          const g = d[idx + 1];
          const b = d[idx + 2];
          const a = d[idx + 3];

          if (a < 15) {
            d[idx + 3] = 0;
            continue;
          }

          // Detect blue pen ink or colored pen ink (preserves complete signature strokes)
          const isBlueOrColoredInk = (b > r + 10) || (g > r + 15) || (Math.max(r, g, b) - Math.min(r, g, b) > 15);
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

          if (isBlueOrColoredInk) {
            // It's genuine ink! Keep 100% full opacity, never erase as background!
            d[idx + 3] = 255;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          } else if (brightness >= whiteThreshold) {
            // Paper background
            d[idx + 3] = 0;
          } else {
            // Ink pixel: calculate smooth alpha for antialiasing
            let alpha = 255;
            if (brightness > featherStart) {
              alpha = Math.round(255 * (whiteThreshold - brightness) / (whiteThreshold - featherStart));
              if (alpha < 0) alpha = 0;
              if (alpha > 255) alpha = 255;
            }
            d[idx + 3] = alpha;

            if (alpha > 15) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Crop neatly to ink bounding box with generous padding so nothing is cut off
      if (maxX >= minX && maxY >= minY) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const pad = 16;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW + pad * 2;
        cropCanvas.height = cropH + pad * 2;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(c, minX, minY, cropW, cropH, pad, pad, cropW, cropH);
        callback(cropCanvas.toDataURL('image/png'));
      } else {
        callback(c.toDataURL('image/png'));
      }
    } catch (e) {
      console.warn('Signature processing error:', e);
      callback(dataUrl);
    }
  };
  img.onerror = () => callback(dataUrl);
  img.src = dataUrl;
}

// Upload signature image from file
function handleSigFileUpload(e, type) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const rawDataUrl = event.target.result;
    removeImageBackground(rawDataUrl, (cleanDataUrl) => {
      if (type === 'proposal') {
        AppState.attachedSigProposal = cleanDataUrl;
        if (AppState.sigPadProposal) {
          AppState.sigPadProposal.loadDataUrl(cleanDataUrl, () => {
            updateProposalStampPreview();
          });
        } else {
          updateProposalStampPreview();
        }
      } else if (type === 'director') {
        AppState.attachedSigDirector = cleanDataUrl;
        if (AppState.sigPadDirector) {
          AppState.sigPadDirector.loadDataUrl(cleanDataUrl, () => {
            updateDirectorStampPreview();
          });
        } else {
          updateDirectorStampPreview();
        }
      }
    });
  };
  reader.readAsDataURL(file);
  // Reset input value so re-selecting same file triggers onchange
  e.target.value = '';
}

/* ==========================================================================
   Interactive Modal 2: ความคิดเห็น ผอ. (Stamp 3 - Bottom Right)
   ========================================================================== */
function openDirectorModal(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  AppState.currentDocId = docId;

  // Set Modal title
  document.getElementById('directorModalDocNo').textContent = doc.bookNo;

  // Load existing or defaults
  const data = doc.directorData || {};
  document.getElementById('dir_ack').checked = !!data.ack;
  document.getElementById('dir_follow').checked = !!data.follow;
  document.getElementById('dir_agree').checked = !!data.agree;
  document.getElementById('dir_approve').checked = !!data.approve;
  document.getElementById('dir_comment').value = data.comment || '';
  document.getElementById('dir_name').value = data.directorName || 'นายกฤษฎา ผลพล';
  document.getElementById('dir_date').value = data.date || ThaiDateUtil.formatThaiDateShort(new Date());

  // Signature Scale
  AppState.sigScaleDirector = Number(data.signatureScale) || 1.0;
  const slider = document.getElementById('sigScaleDirector');
  if (slider) slider.value = AppState.sigScaleDirector;
  const txt = document.getElementById('sigScaleDirectorText');
  if (txt) txt.textContent = Math.round(AppState.sigScaleDirector * 100) + '%';

  // Restore or reset stamp position
  const savedPos = doc.stamp3Pos || { preset: 'bottom-right', offsetX: 0, offsetY: 0 };
  setStampPositionValues('director', savedPos);

  AppState.attachedSigDirector = data.signatureDataUrl || null;

  // Assignee setup (รองรับเพิ่มมากกว่า 1 คน + ฝ่ายงาน)
  populateTeacherDropdowns();
  const rawAssignee = (doc.assignee && doc.assignee !== '-') ? doc.assignee : '';
  currentDirectorAssignees = rawAssignee ? rawAssignee.split(',').map(s => s.trim()).filter(Boolean) : [];
  syncAssigneeUI();

  // Show modal first so canvas layout dimensions are computed
  openModal('directorModal');

  // Load signature with canvas properly laid out
  setTimeout(() => {
    if (AppState.sigPadDirector) {
      AppState.sigPadDirector.resize();
      if (data.signatureDataUrl) {
        AppState.sigPadDirector.loadDataUrl(data.signatureDataUrl, () => {
          updateDirectorStampPreview();
        });
      } else {
        AppState.sigPadDirector.clear();
        updateDirectorStampPreview();
      }
    } else {
      updateDirectorStampPreview();
    }
  }, 50);
}

async function updateDirectorStampPreview() {
  const checkboxes = {
    ack: document.getElementById('dir_ack').checked,
    follow: document.getElementById('dir_follow').checked,
    agree: document.getElementById('dir_agree').checked,
    approve: document.getElementById('dir_approve').checked
  };
  const comment = document.getElementById('dir_comment').value;
  const directorName = document.getElementById('dir_name').value;
  const date = document.getElementById('dir_date').value;
  const assignee = document.getElementById('directorAssignee').value;
  const signatureDataUrl = AppState.attachedSigDirector || (AppState.sigPadDirector && !AppState.sigPadDirector.isEmpty() ? AppState.sigPadDirector.toDataUrl() : null);
  const signatureScale = AppState.sigScaleDirector || 1.0;

  try {
    const stamp3 = await StampEngine.renderStamp3Canvas({
      checkboxes,
      comment,
      directorName,
      date,
      assignee,
      signatureDataUrl,
      signatureScale
    });

    const previewContainer = document.getElementById('directorStampPreviewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = `<img src="${stamp3.dataUrl}" style="max-width:100%; height:auto; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); background:#ffffff;">`;
    }
  } catch (err) {
    console.warn(err);
  }
}

async function handleSaveDirectorComment() {
  const doc = AppState.records.find(r => r.id === AppState.currentDocId);
  if (!doc) return;

  const assignee = (document.getElementById('directorAssignee')?.value || '').trim() || '-';

  const btn = document.getElementById('btnSaveDirector');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังประทับตราและบันทึก...';
  }

  try {
    const checkboxes = {
      ack: document.getElementById('dir_ack').checked,
      follow: document.getElementById('dir_follow').checked,
      agree: document.getElementById('dir_agree').checked,
      approve: document.getElementById('dir_approve').checked
    };
    const comment = (document.getElementById('dir_comment').value || '').trim();
    const directorName = (document.getElementById('dir_name').value || '').trim() || 'นายกฤษฎา ผลพล';
    const date = (document.getElementById('dir_date').value || '').trim() || ThaiDateUtil.formatThaiDateShort(new Date());
    const signatureDataUrl = AppState.attachedSigDirector || (AppState.sigPadDirector && !AppState.sigPadDirector.isEmpty() ? AppState.sigPadDirector.toDataUrl() : null);
    const signatureScale = AppState.sigScaleDirector || 1.0;

    // 1. Render all 3 stamps for complete document
    const stamp1 = await StampEngine.renderStamp1Canvas({
      bookNo: doc.bookNo,
      receiveDate: doc.receiveDate,
      receiveTime: doc.receiveTime
    });

    // Stamp 2 (if proposal was made)
    let stamp2 = null;
    if (doc.proposalData) {
      stamp2 = await StampEngine.renderStamp2Canvas({
        checkboxes: doc.proposalData.checkboxes,
        customNotice: doc.proposalData.customNotice,
        note: doc.proposalData.note,
        date: doc.proposalData.date || doc.receiveDate,
        signatureDataUrl: doc.proposalData.signatureDataUrl,
        signatureScale: doc.proposalData.signatureScale || 1.0
      });
    }

    // Stamp 3 (Director Comment)
    const stamp3 = await StampEngine.renderStamp3Canvas({
      checkboxes,
      comment,
      directorName,
      date,
      assignee,
      signatureDataUrl,
      signatureScale
    });

    // 2. Composite all stamps onto document (with user-defined positions)
    const stamp1Pos = doc.inboundCustomPos || doc.stamp1Pos || { preset: 'top-right', offsetX: 0, offsetY: 0 };
    const stamp2Pos = doc.proposalCustomPos || doc.stamp2Pos || { preset: 'bottom-left', offsetX: 0, offsetY: 0 };
    const stamp3Pos = doc.directorCustomPos || doc.stamp3Pos || getStampPositionValues('director');
    doc.stamp1Pos = stamp1Pos;
    doc.inboundCustomPos = stamp1Pos;
    doc.stamp2Pos = stamp2Pos;
    doc.proposalCustomPos = stamp2Pos;
    doc.stamp3Pos = stamp3Pos;
    doc.directorCustomPos = stamp3Pos;

    if (doc.fileType === 'application/pdf') {
      const originalBytes = await ensureDocumentBytes(doc);
      if (!originalBytes || originalBytes.length === 0) {
        throw new Error('ไม่พบเอกสาร PDF ต้นฉบับจากระบบหรือ Google Drive');
      }
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: originalBytes,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2 ? stamp2.canvas : null,
        stamp3Canvas: stamp3.canvas,
        stamp1Pos: stamp1Pos,
        stamp2Pos: stamp2Pos,
        stamp3Pos: stamp3Pos
      });
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      doc.stampedDataUrl = await blobToDataUrl(blob);
    } else {
      if (!doc.originalDataUrl && doc.driveFileUrl) {
        const loaded = await fetchFileFromDriveViaGas(doc.driveFileUrl);
        if (loaded && loaded.dataUrl) doc.originalDataUrl = loaded.dataUrl;
      }
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: doc.originalDataUrl,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2 ? stamp2.canvas : null,
        stamp3Canvas: stamp3.canvas,
        stamp1Pos: stamp1Pos,
        stamp2Pos: stamp2Pos,
        stamp3Pos: stamp3Pos
      });
      doc.stampedDataUrl = stampedImg.dataUrl;
    }

    if (doc.files && doc.files.length > 0) {
      doc.files[0].stampedDataUrl = doc.stampedDataUrl;
    }

    doc.stamp3Pos = stamp3Pos;

    // Save director data
    doc.directorData = {
      checkboxes,
      comment,
      directorName,
      date,
      assignee,
      signatureDataUrl,
      signatureScale,
      timestamp: new Date().toISOString()
    };
    doc.status = 'เสร็จสิ้น';
    doc.step = 3;
    doc.assignee = assignee;
    doc.updatedAt = new Date().toISOString();

    saveRecordsToStorage();
    syncToGasIfAvailable('completeDirector', doc);

    closeModal('directorModal');
    renderAllTables();
    updateKpiStats();

    showToast(assignee && assignee !== '-' ? `ประทับตรา "ความเห็น ผอ." และมอบหมายงานให้ ${assignee} เรียบร้อยแล้ว!` : 'ประทับตรา "ความเห็น ผอ." เรียบร้อยแล้ว!', 'success');
  } catch (err) {
    console.error('Error saving director stamp:', err);
    showToast('เกิดข้อผิดพลาดในการประทับตราความเห็น ผอ.: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check-double"></i> บันทึกความคิดเห็น ผอ. และมอบหมายงาน';
    }
  }
}

// Helpers for signature scaling (Zoom in / out)
function onSigScaleChange(type, val) {
  const scale = Math.max(0.4, Math.min(2.5, parseFloat(val) || 1.0));
  if (type === 'proposal') {
    AppState.sigScaleProposal = scale;
    const txt = document.getElementById('sigScaleProposalText');
    if (txt) txt.textContent = Math.round(scale * 100) + '%';
    updateProposalStampPreview();
  } else if (type === 'director') {
    AppState.sigScaleDirector = scale;
    const txt = document.getElementById('sigScaleDirectorText');
    if (txt) txt.textContent = Math.round(scale * 100) + '%';
    updateDirectorStampPreview();
  }
}

function adjustSigScale(type, delta) {
  if (type === 'proposal') {
    let cur = AppState.sigScaleProposal || 1.0;
    cur = Math.max(0.5, Math.min(1.8, Math.round((cur + delta) * 20) / 20));
    const slider = document.getElementById('sigScaleProposal');
    if (slider) slider.value = cur;
    onSigScaleChange('proposal', cur);
  } else if (type === 'director') {
    let cur = AppState.sigScaleDirector || 1.0;
    cur = Math.max(0.5, Math.min(1.8, Math.round((cur + delta) * 20) / 20));
    const slider = document.getElementById('sigScaleDirector');
    if (slider) slider.value = cur;
    onSigScaleChange('director', cur);
  }
}

// Helpers for stamp scaling (ปรับขนาดตราปั๊มตอนลงนาม)
function onStampScaleChange(type, val) {
  const scale = Math.max(0.7, Math.min(1.8, parseFloat(val) || 1.0));
  if (type === 'proposal') {
    const txt = document.getElementById('propStampScaleVal');
    if (txt) txt.textContent = Math.round(scale * 100) + '%';
  } else if (type === 'director') {
    const txt = document.getElementById('dirStampScaleVal');
    if (txt) txt.textContent = Math.round(scale * 100) + '%';
  }
}

function adjustStampScale(type, delta) {
  const inputId = (type === 'proposal') ? 'propStampScale' : 'dirStampScale';
  const el = document.getElementById(inputId);
  if (el) {
    let cur = parseFloat(el.value) || 1.0;
    cur = Math.max(0.7, Math.min(1.8, Math.round((cur + delta) * 20) / 20));
    el.value = cur;
    onStampScaleChange(type, cur);
  }
}

/* ==========================================================================
   Stamp Position & Locator Management (ปรับตำแหน่งตราปั๊ม และผังจำลองหน้าเอกสาร)
   ========================================================================== */

function getStampPositionValues(type) {
  if (type === 'proposal') {
    const preset = document.getElementById('propStampPreset')?.value || 'bottom-left';
    const offsetX = Number(document.getElementById('propStampOffsetX')?.value || 0);
    const offsetY = Number(document.getElementById('propStampOffsetY')?.value || 0);
    const scale = Number(document.getElementById('propStampScale')?.value || 1.0);
    return { preset, offsetX, offsetY, scale };
  } else if (type === 'director') {
    const preset = document.getElementById('dirStampPreset')?.value || 'bottom-right';
    const offsetX = Number(document.getElementById('dirStampOffsetX')?.value || 0);
    const offsetY = Number(document.getElementById('dirStampOffsetY')?.value || 0);
    const scale = Number(document.getElementById('dirStampScale')?.value || 1.0);
    return { preset, offsetX, offsetY, scale };
  } else if (type === 'inbound') {
    const preset = document.getElementById('inboundStampPreset')?.value || 'top-right';
    const offsetX = Number(document.getElementById('inboundStampOffsetX')?.value || 0);
    const offsetY = Number(document.getElementById('inboundStampOffsetY')?.value || 0);
    return { preset, offsetX, offsetY };
  }
  return { preset: 'top-right', offsetX: 0, offsetY: 0 };
}

function setStampPositionValues(type, pos = {}) {
  const defaultPreset = (type === 'proposal') ? 'bottom-left' : (type === 'director' ? 'bottom-right' : 'top-right');
  const preset = pos.preset || defaultPreset;
  const offsetX = Number(pos.offsetX) || 0;
  const offsetY = Number(pos.offsetY) || 0;
  const scale = (typeof pos.scale === 'number') ? pos.scale : 1.0;

  if (type === 'proposal') {
    const presetEl = document.getElementById('propStampPreset');
    if (presetEl) presetEl.value = preset;
    const xEl = document.getElementById('propStampOffsetX');
    if (xEl) xEl.value = offsetX;
    const yEl = document.getElementById('propStampOffsetY');
    if (yEl) yEl.value = offsetY;
    const xVal = document.getElementById('propStampOffsetXVal');
    if (xVal) xVal.textContent = (offsetX >= 0 ? '+' : '') + offsetX + ' pt';
    const yVal = document.getElementById('propStampOffsetYVal');
    if (yVal) yVal.textContent = (offsetY >= 0 ? '+' : '') + offsetY + ' pt';
    const scaleEl = document.getElementById('propStampScale');
    if (scaleEl) scaleEl.value = scale;
    const scaleVal = document.getElementById('propStampScaleVal');
    if (scaleVal) scaleVal.textContent = Math.round(scale * 100) + '%';
  } else if (type === 'director') {
    const presetEl = document.getElementById('dirStampPreset');
    if (presetEl) presetEl.value = preset;
    const xEl = document.getElementById('dirStampOffsetX');
    if (xEl) xEl.value = offsetX;
    const yEl = document.getElementById('dirStampOffsetY');
    if (yEl) yEl.value = offsetY;
    const xVal = document.getElementById('dirStampOffsetXVal');
    if (xVal) xVal.textContent = (offsetX >= 0 ? '+' : '') + offsetX + ' pt';
    const yVal = document.getElementById('dirStampOffsetYVal');
    if (yVal) yVal.textContent = (offsetY >= 0 ? '+' : '') + offsetY + ' pt';
    const scaleEl = document.getElementById('dirStampScale');
    if (scaleEl) scaleEl.value = scale;
    const scaleVal = document.getElementById('dirStampScaleVal');
    if (scaleVal) scaleVal.textContent = Math.round(scale * 100) + '%';
  } else if (type === 'inbound') {
    const presetEl = document.getElementById('inboundStampPreset');
    if (presetEl) presetEl.value = preset;
    const xEl = document.getElementById('inboundStampOffsetX');
    if (xEl) xEl.value = offsetX;
    const yEl = document.getElementById('inboundStampOffsetY');
    if (yEl) yEl.value = offsetY;
  }

  updateLocatorMockup(type);
}

function updateLocatorMockup(type) {
  if (type !== 'proposal' && type !== 'director') return;
  const badgeId = (type === 'proposal') ? 'propLocatorBadge' : 'dirLocatorBadge';
  const badge = document.getElementById(badgeId);
  if (!badge) return;

  const pos = getStampPositionValues(type);
  const mockupW = 86;
  const mockupH = 122;
  const badgeW = 38;
  const badgeH = 18;
  const marginX = 5;
  const marginY = 6;

  let baseLeft = marginX;
  let baseTop = marginY;

  switch (pos.preset) {
    case 'top-left':
      baseLeft = marginX;
      baseTop = marginY;
      break;
    case 'top-center':
      baseLeft = (mockupW - badgeW) / 2;
      baseTop = marginY;
      break;
    case 'top-right':
      baseLeft = mockupW - badgeW - marginX;
      baseTop = marginY;
      break;
    case 'mid-left':
      baseLeft = marginX;
      baseTop = (mockupH - badgeH) / 2;
      break;
    case 'mid-right':
      baseLeft = mockupW - badgeW - marginX;
      baseTop = (mockupH - badgeH) / 2;
      break;
    case 'bottom-left':
      baseLeft = marginX;
      baseTop = mockupH - badgeH - marginY - 4;
      break;
    case 'bottom-center':
      baseLeft = (mockupW - badgeW) / 2;
      baseTop = mockupH - badgeH - marginY - 4;
      break;
    case 'bottom-right':
    default:
      baseLeft = mockupW - badgeW - marginX;
      baseTop = mockupH - badgeH - marginY - 4;
      break;
  }

  // Scale offset pt to mini mockup pixels (~ 86px / 595pt ~ 0.14)
  const scale = 0.14;
  let finalLeft = baseLeft + (pos.offsetX * scale);
  let finalTop = baseTop - (pos.offsetY * scale);

  finalLeft = Math.max(2, Math.min(mockupW - badgeW - 2, finalLeft));
  finalTop = Math.max(2, Math.min(mockupH - badgeH - 2, finalTop));

  badge.style.left = Math.round(finalLeft) + 'px';
  badge.style.top = Math.round(finalTop) + 'px';
}

function onStampPositionChange(type) {
  updateLocatorMockup(type);
}

function onStampPositionSlider(type) {
  const xEl = document.getElementById(type === 'proposal' ? 'propStampOffsetX' : 'dirStampOffsetX');
  const yEl = document.getElementById(type === 'proposal' ? 'propStampOffsetY' : 'dirStampOffsetY');
  const xVal = document.getElementById(type === 'proposal' ? 'propStampOffsetXVal' : 'dirStampOffsetXVal');
  const yVal = document.getElementById(type === 'proposal' ? 'propStampOffsetYVal' : 'dirStampOffsetYVal');

  const x = Number(xEl?.value || 0);
  const y = Number(yEl?.value || 0);

  if (xVal) xVal.textContent = (x >= 0 ? '+' : '') + x + ' pt';
  if (yVal) yVal.textContent = (y >= 0 ? '+' : '') + y + ' pt';

  updateLocatorMockup(type);
}

function nudgeStampPosition(type, dx, dy) {
  if (type === 'inbound') {
    const xEl = document.getElementById('inboundStampOffsetX');
    const yEl = document.getElementById('inboundStampOffsetY');
    if (xEl && yEl) {
      let curX = Number(xEl.value || 0) + dx;
      let curY = Number(yEl.value || 0) + dy;
      curX = Math.max(-150, Math.min(150, curX));
      curY = Math.max(-150, Math.min(150, curY));
      xEl.value = curX;
      yEl.value = curY;
      showToast(`เลื่อนตราปั้มรับเข้า: X=${curX >= 0 ? '+' : ''}${curX}pt, Y=${curY >= 0 ? '+' : ''}${curY}pt`, 'info');
    }
    return;
  }

  const xEl = document.getElementById(type === 'proposal' ? 'propStampOffsetX' : 'dirStampOffsetX');
  const yEl = document.getElementById(type === 'proposal' ? 'propStampOffsetY' : 'dirStampOffsetY');
  if (!xEl || !yEl) return;

  let curX = Number(xEl.value || 0) + dx;
  let curY = Number(yEl.value || 0) + dy;
  curX = Math.max(-150, Math.min(150, curX));
  curY = Math.max(-150, Math.min(150, curY));

  xEl.value = curX;
  yEl.value = curY;

  onStampPositionSlider(type);
}

function resetStampPosition(type) {
  const defaultPreset = (type === 'proposal') ? 'bottom-left' : (type === 'director' ? 'bottom-right' : 'top-right');
  setStampPositionValues(type, { preset: defaultPreset, offsetX: 0, offsetY: 0 });
  showToast('รีเซ็ตตำแหน่งตราปั้มเป็นค่าเริ่มต้นเรียบร้อยแล้ว', 'info');
}

function handleLocatorMockupClick(event, type) {
  const mockup = event.currentTarget;
  const rect = mockup.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  let preset = (type === 'proposal') ? 'bottom-left' : 'bottom-right';
  if (clickY > 60) {
    // Bottom half
    if (clickX < 28) preset = 'bottom-left';
    else if (clickX > 54) preset = 'bottom-right';
    else preset = 'bottom-center';
  } else {
    // Top half
    if (clickX < 28) preset = 'top-left';
    else if (clickX > 54) preset = 'top-right';
    else preset = 'top-center';
  }

  setStampPositionValues(type, { preset, offsetX: 0, offsetY: 0 });
}

// Inbound Stamp Scale Helpers (ย่อ-ขยายตราปั๊มรับเข้า)
function onInboundScaleInput(val) {
  const scale = Math.max(0.5, Math.min(2.0, parseFloat(val) || 1.0));
  AppState.inboundStampScale = scale;
  const txt = document.getElementById('inboundStampScaleText');
  if (txt) txt.textContent = Math.round(scale * 100) + '%';
  if (AppState.inboundCustomPos) {
    AppState.inboundCustomPos.scale = scale;
  }
}

function adjustInboundScale(delta) {
  const slider = document.getElementById('inboundStampScale');
  if (slider) {
    let cur = parseFloat(slider.value) || 1.0;
    cur = Math.max(0.5, Math.min(2.0, Math.round((cur + delta) * 20) / 20));
    slider.value = cur;
    onInboundScaleInput(cur);
  }
}

/* ==========================================================================
   Interactive Document Stamp & Sign Position Selector
   (เปิดตัวเอกสารจากไฟล์แนบขึ้นมาให้คลิกหรือลากวางตำแหน่งตราปั๊มได้แม่นยำ
    รองรับ: ย่อ-ขยายตราปั๊ม, ปั๊มมากกว่า 1 หน้า, ปั๊มทุกหน้า, ปั๊มหลายจุด)
   ========================================================================== */
const ActivePositionPicker = {
  type: 'inbound', // 'inbound' | 'proposal' | 'director'
  currentDoc: null,
  canvasWidth: 0,
  canvasHeight: 0,
  stampWidth: 0,
  stampHeight: 0,
  percentX: 0.60,
  percentY: 0.03,
  scale: 1.0,
  currentPage: 1,
  totalPages: 1,
  pdfDoc: null,
  pageScope: 'single', // 'single' | 'all' | 'custom_pages'
  customPages: [], // [1, 2, ...]
  placements: [], // [ { id, page, percentX, percentY, scale } ]
  activePlacementIdx: 0,
  isDragging: false,
  isLocked: false,
  dragStartX: 0,
  dragStartY: 0,
  stampStartLeft: 0,
  stampStartTop: 0,
  listenersAttached: false
};

async function openDocumentPositionSelector(type = 'inbound') {
  ActivePositionPicker.type = type;
  ActivePositionPicker.currentPage = 1;
  ActivePositionPicker.totalPages = 1;
  ActivePositionPicker.pdfDoc = null;
  ActivePositionPicker.placements = [];
  ActivePositionPicker.activePlacementIdx = 0;
  ActivePositionPicker.customPages = [1];
  
  const modal = document.getElementById('stampPositionModal');
  const titleEl = document.getElementById('stampPositionModalTitle');
  const labelEl = document.getElementById('floatingStampLabel');
  const loadingEl = document.getElementById('positionDocLoading');
  const wrapperEl = document.getElementById('positionDocWrapper');
  const canvasHolder = document.getElementById('floatingStampCanvasHolder');

  if (!modal || !loadingEl || !wrapperEl) return;

  let targetFile = null;
  let targetDoc = null;
  let savedPos = null;

  if (type === 'inbound') {
    if (!AppState.selectedFiles || AppState.selectedFiles.length === 0) {
      showToast('กรุณาเลือกไฟล์แนบหนังสือรับก่อนเปิดเลือกตำแหน่ง', 'warning');
      const fileInput = document.getElementById('docFileInput');
      if (fileInput) fileInput.click();
      return;
    }
    targetFile = AppState.selectedFiles[0];
    if (titleEl) titleEl.textContent = 'เลือกตำแหน่งตราปั๊มรับเข้า บนหน้าเอกสารแนบจริง (ปรับย่อ-ขยายและเลือกหน้าได้)';
    if (labelEl) labelEl.textContent = 'ตราปั๊มรับเข้า';
    savedPos = AppState.inboundCustomPos;
    ActivePositionPicker.scale = AppState.inboundStampScale || 1.0;

  } else if (type === 'proposal') {
    targetDoc = AppState.records.find(r => r.id === AppState.currentDocId);
    if (!targetDoc) {
      showToast('ไม่พบข้อมูลเอกสารสำหรับเสนอ ผอ.', 'warning');
      return;
    }
    targetFile = {
      type: targetDoc.fileType,
      bytes: targetDoc.bytes || null,
      dataUrl: targetDoc.stampedDataUrl || targetDoc.originalDataUrl,
      driveFileUrl: targetDoc.driveFileUrl || (targetDoc.files && targetDoc.files[0] && targetDoc.files[0].driveFileUrl)
    };
    if (titleEl) titleEl.textContent = 'เลือกตำแหน่งตราเสนอ ผอ. บนหน้าเอกสารจริง (ปรับย่อ-ขยายและเลือกหน้าได้)';
    if (labelEl) labelEl.textContent = 'บันทึกเสนอ ผอ.';
    savedPos = targetDoc.proposalCustomPos || targetDoc.stamp2Pos;
    ActivePositionPicker.scale = Number(document.getElementById('propStampScale')?.value || 1.0);

  } else if (type === 'director') {
    targetDoc = AppState.records.find(r => r.id === AppState.currentDocId);
    if (!targetDoc) {
      showToast('ไม่พบข้อมูลเอกสารสำหรับสั่งการ ผอ.', 'warning');
      return;
    }
    targetFile = {
      type: targetDoc.fileType,
      bytes: targetDoc.bytes || null,
      dataUrl: targetDoc.stampedDataUrl || targetDoc.originalDataUrl,
      driveFileUrl: targetDoc.driveFileUrl || (targetDoc.files && targetDoc.files[0] && targetDoc.files[0].driveFileUrl)
    };
    if (titleEl) titleEl.textContent = 'เลือกตำแหน่งตราสั่งการและลงนาม ผอ. บนหน้าเอกสารจริง (ปรับย่อ-ขยายและเลือกหน้าได้)';
    if (labelEl) labelEl.textContent = 'คำสั่งการ/ลงนาม ผอ.';
    savedPos = targetDoc.directorCustomPos || targetDoc.stamp3Pos;
    ActivePositionPicker.scale = Number(document.getElementById('dirStampScale')?.value || 1.0);
  }

  ActivePositionPicker.currentDoc = targetDoc;

  // เคลียร์ค่าจำตำแหน่งเดิมใน localStorage ออกทั้งหมด เพื่อให้เอกสารใหม่เริ่มจากจุดเริ่มต้นเสมอ ไม่ล็อคคาไว้
  try {
    localStorage.removeItem('EDOC_DEFAULT_STAMP_POS_' + type);
  } catch (_) {}

  // เริ่มต้นทุกครั้งด้วยสถานะปลดล็อค (ไม่มีการล็อคคาไว้สำหรับเอกสารใหม่)
  ActivePositionPicker.isLocked = false;

  // Restore saved positions/placements เฉพาะเมื่อมีการกำหนดไว้ในเอกสารฉบับนี้เท่านั้น
  if (savedPos && Array.isArray(savedPos.placements) && savedPos.placements.length > 0) {
    ActivePositionPicker.placements = savedPos.placements.map((p, idx) => ({
      id: p.id || (Date.now() + idx),
      page: Number(p.page) || 1,
      percentX: typeof p.percentX === 'number' ? p.percentX : 0.6,
      percentY: typeof p.percentY === 'number' ? p.percentY : 0.03,
      scale: typeof p.scale === 'number' ? p.scale : (savedPos.scale || 1.0),
      isLocked: !!p.isLocked,
      preset: p.preset || 'custom'
    }));
    ActivePositionPicker.activePlacementIdx = 0;
    const firstP = ActivePositionPicker.placements[0];
    ActivePositionPicker.currentPage = firstP.page || 1;
    ActivePositionPicker.percentX = firstP.percentX;
    ActivePositionPicker.percentY = firstP.percentY;
    ActivePositionPicker.scale = firstP.scale || 1.0;
    ActivePositionPicker.pageScope = savedPos.pageScope || 'single';
    ActivePositionPicker.isLocked = !!firstP.isLocked;
  } else if (savedPos && (savedPos.pages === 'all' || savedPos.targetScope === 'all')) {
    ActivePositionPicker.pageScope = 'all';
    ActivePositionPicker.percentX = typeof savedPos.percentX === 'number' ? savedPos.percentX : (type === 'inbound' ? 0.60 : (type === 'proposal' ? 0.05 : 0.58));
    ActivePositionPicker.percentY = typeof savedPos.percentY === 'number' ? savedPos.percentY : (type === 'inbound' ? 0.03 : 0.60);
    ActivePositionPicker.scale = typeof savedPos.scale === 'number' ? savedPos.scale : 1.0;
    ActivePositionPicker.placements = [{
      id: 1,
      page: 1,
      percentX: ActivePositionPicker.percentX,
      percentY: ActivePositionPicker.percentY,
      scale: ActivePositionPicker.scale,
      isLocked: !!savedPos.isLocked,
      preset: 'custom'
    }];
    ActivePositionPicker.activePlacementIdx = 0;
    ActivePositionPicker.currentPage = 1;
    ActivePositionPicker.isLocked = !!savedPos.isLocked;
  } else if (savedPos && Array.isArray(savedPos.pages) && savedPos.pages.length > 0) {
    ActivePositionPicker.pageScope = 'custom_pages';
    ActivePositionPicker.customPages = [...savedPos.pages];
    ActivePositionPicker.currentPage = savedPos.pages[0] || 1;
    ActivePositionPicker.percentX = typeof savedPos.percentX === 'number' ? savedPos.percentX : (type === 'inbound' ? 0.60 : (type === 'proposal' ? 0.05 : 0.58));
    ActivePositionPicker.percentY = typeof savedPos.percentY === 'number' ? savedPos.percentY : (type === 'inbound' ? 0.03 : 0.60);
    ActivePositionPicker.scale = typeof savedPos.scale === 'number' ? savedPos.scale : 1.0;
    ActivePositionPicker.placements = savedPos.pages.map((pg, idx) => ({
      id: Date.now() + idx,
      page: Number(pg) || 1,
      percentX: ActivePositionPicker.percentX,
      percentY: ActivePositionPicker.percentY,
      scale: ActivePositionPicker.scale,
      isLocked: !!savedPos.isLocked,
      preset: 'custom'
    }));
    ActivePositionPicker.activePlacementIdx = 0;
    ActivePositionPicker.isLocked = !!savedPos.isLocked;
  } else if (savedPos && typeof savedPos.percentX === 'number') {
    ActivePositionPicker.pageScope = 'single';
    ActivePositionPicker.currentPage = Number(savedPos.page) || 1;
    ActivePositionPicker.percentX = savedPos.percentX;
    ActivePositionPicker.percentY = savedPos.percentY;
    ActivePositionPicker.scale = typeof savedPos.scale === 'number' ? savedPos.scale : 1.0;
    ActivePositionPicker.placements = [{
      id: 1,
      page: ActivePositionPicker.currentPage,
      percentX: ActivePositionPicker.percentX,
      percentY: ActivePositionPicker.percentY,
      scale: ActivePositionPicker.scale,
      isLocked: !!savedPos.isLocked,
      preset: 'custom'
    }];
    ActivePositionPicker.activePlacementIdx = 0;
    ActivePositionPicker.isLocked = !!savedPos.isLocked;
  } else {
    // เอกสารใหม่: เริ่มต้นใหม่จากจุดเริ่มต้น (หน้า 1, ขนาด 100%, พิกัดเริ่มต้น, ปลดล็อคอยู่)
    ActivePositionPicker.pageScope = 'single';
    ActivePositionPicker.currentPage = 1;
    ActivePositionPicker.scale = 1.0;
    ActivePositionPicker.percentX = (type === 'inbound') ? 0.60 : (type === 'proposal' ? 0.05 : 0.58);
    ActivePositionPicker.percentY = (type === 'inbound') ? 0.03 : 0.60;
    ActivePositionPicker.placements = [{
      id: 1,
      page: 1,
      percentX: ActivePositionPicker.percentX,
      percentY: ActivePositionPicker.percentY,
      scale: 1.0,
      isLocked: false,
      preset: 'custom'
    }];
    ActivePositionPicker.activePlacementIdx = 0;
    ActivePositionPicker.isLocked = false;
  }

  // Update UI Scope dropdown & Scale slider
  const scopeSelect = document.getElementById('posPageScopeSelect');
  if (scopeSelect) scopeSelect.value = ActivePositionPicker.pageScope;
  syncScaleSliderUI(ActivePositionPicker.scale);

  const customBar = document.getElementById('posCustomPagesBar');
  if (customBar) customBar.style.display = (ActivePositionPicker.pageScope === 'custom_pages') ? 'flex' : 'none';

  // Open modal
  openModal('stampPositionModal');
  loadingEl.style.display = 'block';
  wrapperEl.style.display = 'none';

  // Render the Stamp Canvas for floating preview
  let stampCanvas = null;
  try {
    if (type === 'inbound') {
      const bookNo = (document.getElementById('bookNo')?.value || '').trim() || '0001/2569';
      const receiveDate = (document.getElementById('receiveDate')?.value || '').trim() || ThaiDateUtil.formatDateBE(new Date());
      const receiveTime = (document.getElementById('receiveTime')?.value || '').trim() || ThaiDateUtil.formatTime(new Date());
      const s1 = await StampEngine.renderStamp1Canvas({ bookNo, receiveDate, receiveTime });
      stampCanvas = s1.canvas;
    } else if (type === 'proposal') {
      const checkboxes = {
        toKnow: document.getElementById('prop_toKnow')?.checked || false,
        toAct: document.getElementById('prop_toAct')?.checked || false,
        toConsider: document.getElementById('prop_toConsider')?.checked || false,
        toComply: document.getElementById('prop_toComply')?.checked || false,
        toNotify: document.getElementById('prop_toNotify')?.checked || false
      };
      const note = (document.getElementById('prop_note')?.value || '').trim();
      const date = (document.getElementById('prop_date')?.value || '').trim();
      const signatureDataUrl = (AppState.sigPadProposal && !AppState.sigPadProposal.isEmpty()) ? AppState.sigPadProposal.toDataUrl() : null;
      const signatureScale = AppState.sigScaleProposal || 1.0;
      const s2 = await StampEngine.renderStamp2Canvas({
        checkboxes,
        note,
        signatureDataUrl,
        signatureScale,
        date
      });
      stampCanvas = s2.canvas;
    } else if (type === 'director') {
      const checkboxes = {
        ack: document.getElementById('dir_ack')?.checked || false,
        follow: document.getElementById('dir_follow')?.checked || false,
        agree: document.getElementById('dir_agree')?.checked || false,
        approve: document.getElementById('dir_approve')?.checked || false
      };
      const comment = (document.getElementById('dir_comment')?.value || '').trim();
      const directorName = (document.getElementById('dir_name')?.value || '').trim() || 'นายกฤษฎา ผลพล';
      const date = (document.getElementById('dir_date')?.value || '').trim();
      const assignee = (document.getElementById('directorAssignee')?.value || '').trim();
      const signatureDataUrl = (AppState.sigPadDirector && !AppState.sigPadDirector.isEmpty()) ? AppState.sigPadDirector.toDataUrl() : null;
      const signatureScale = AppState.sigScaleDirector || 1.0;
      const s3 = await StampEngine.renderStamp3Canvas({
        checkboxes,
        comment,
        directorName,
        date,
        assignee,
        signatureDataUrl,
        signatureScale
      });
      stampCanvas = s3.canvas;
    }
  } catch (errStamp) {
    console.warn('Error rendering preview stamp canvas:', errStamp);
  }

  if (canvasHolder && stampCanvas) {
    canvasHolder.innerHTML = '';
    canvasHolder.appendChild(stampCanvas);
  }

  // Render the document page
  try {
    const docCanvas = document.getElementById('positionDocCanvas');
    if (!docCanvas) throw new Error('ไม่พบ Canvas แสดงเอกสาร');

    const viewportContainer = document.getElementById('positionModalViewport');
    const availableW = viewportContainer ? (viewportContainer.clientWidth - 48) : 650;
    const targetWidth = Math.max(380, Math.min(650, availableW));

    if (targetFile.type === 'application/pdf') {
      let pdfSource = targetFile.bytes;
      if (!pdfSource && targetFile.dataUrl) {
        pdfSource = await dataUrlToBytes(targetFile.dataUrl);
      }
      if (!pdfSource && targetDoc) {
        pdfSource = await ensureDocumentBytes(targetDoc);
      }
      if (!pdfSource && targetFile.driveFileUrl) {
        const loaded = await fetchFileFromDriveViaGas(targetFile.driveFileUrl);
        if (loaded && loaded.bytes) pdfSource = loaded.bytes;
        else if (loaded && loaded.dataUrl) pdfSource = await dataUrlToBytes(loaded.dataUrl);
      }
      if (!pdfSource) throw new Error('ไม่พบข้อมูลไฟล์ PDF กรุณาตรวจสอบว่ามีไฟล์แนบหรือเชื่อมต่อ Google Drive ถูกต้อง');

      if (!window.pdfjsLib) {
        throw new Error('ระบบกำลังโหลดตัวแปลงเอกสาร PDF กรุณาลองใหม่อีกครั้ง');
      }

      let pdf;
      try {
        const loadingTask = window.pdfjsLib.getDocument({
          data: pdfSource,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
          cMapPacked: true
        });
        pdf = await loadingTask.promise;
      } catch (workerErr) {
        console.warn('Standard PDF.js worker load failed, trying disableWorker fallback:', workerErr);
        const fallbackTask = window.pdfjsLib.getDocument({
          data: pdfSource,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/',
          cMapPacked: true,
          disableWorker: true
        });
        pdf = await fallbackTask.promise;
      }
      ActivePositionPicker.pdfDoc = pdf;
      ActivePositionPicker.totalPages = pdf.numPages || 1;

      // Populate Page Select Dropdown
      const pageSelect = document.getElementById('posPageSelect');
      const totalPagesEl = document.getElementById('posTotalPages');
      if (pageSelect) {
        pageSelect.innerHTML = Array.from({ length: ActivePositionPicker.totalPages }, (_, i) => 
          `<option value="${i + 1}">หน้า ${i + 1}</option>`
        ).join('');
      }
      if (totalPagesEl) totalPagesEl.textContent = ActivePositionPicker.totalPages;

      renderCustomPagesCheckboxes();

      // Render the designated page
      await renderPositionModalPage(ActivePositionPicker.currentPage || 1);

    } else {
      // Image document (Single page)
      ActivePositionPicker.pdfDoc = null;
      ActivePositionPicker.totalPages = 1;
      ActivePositionPicker.currentPage = 1;

      const pageSelect = document.getElementById('posPageSelect');
      const totalPagesEl = document.getElementById('posTotalPages');
      if (pageSelect) pageSelect.innerHTML = '<option value="1">หน้า 1</option>';
      if (totalPagesEl) totalPagesEl.textContent = '1';

      const prevBtn = document.getElementById('btnPosPrevPage');
      const nextBtn = document.getElementById('btnPosNextPage');
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;

      let imgSrc = targetFile.dataUrl;
      if (!imgSrc && targetDoc) {
        const driveUrl = targetDoc.driveFileUrl || (targetDoc.files && targetDoc.files[0] && targetDoc.files[0].driveFileUrl);
        if (driveUrl) {
          const loaded = await fetchFileFromDriveViaGas(driveUrl);
          if (loaded && loaded.dataUrl) imgSrc = loaded.dataUrl;
        }
      }
      if (!imgSrc) throw new Error('ไม่พบรูปภาพเอกสาร');

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('ไม่สามารถโหลดรูปภาพเอกสารได้'));
        img.src = imgSrc;
      });

      const scale = targetWidth / (img.naturalWidth || 600);
      docCanvas.width = targetWidth;
      docCanvas.height = (img.naturalHeight || 800) * scale;
      const ctx = docCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, docCanvas.width, docCanvas.height);

      ActivePositionPicker.canvasWidth = docCanvas.width;
      ActivePositionPicker.canvasHeight = docCanvas.height;
    }

    // Update stamp sizing with scale factor
    updatePositionModalStampDimensions();
    updatePlacementsBarUI();

    loadingEl.style.display = 'none';
    wrapperEl.style.display = 'block';

    updatePositionModalStampCoordinates();
    initPositionModalListeners();
    updatePositionLockUI();

  } catch (err) {
    console.error('Error rendering document in position modal:', err);
    loadingEl.innerHTML = `
      <div style="color: #fca5a5; padding: 20px; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; margin-bottom: 8px;"></i>
        <p style="font-size: 14px; margin: 0;">ไม่สามารถเปิดหน้าเอกสารได้: ${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal('stampPositionModal')" style="margin-top: 12px; color: #fff; border-color: #fff;">ปิดหน้าต่าง</button>
      </div>
    `;
  }
}

async function changePositionModalPage(deltaOrTarget) {
  if (!ActivePositionPicker.pdfDoc) return;
  let targetPage;
  if (typeof deltaOrTarget === 'number') {
    if (deltaOrTarget === 1 || deltaOrTarget === -1) {
      targetPage = ActivePositionPicker.currentPage + deltaOrTarget;
    } else {
      targetPage = deltaOrTarget;
    }
  } else {
    targetPage = parseInt(deltaOrTarget, 10);
  }

  if (isNaN(targetPage) || targetPage < 1 || targetPage > ActivePositionPicker.totalPages) return;
  await renderPositionModalPage(targetPage);
}

async function onPositionPageSelectChange(val) {
  await changePositionModalPage(parseInt(val, 10));
}

// Helper to get currently active placement
function getActivePlacement() {
  if (!ActivePositionPicker.placements || ActivePositionPicker.placements.length === 0) return null;
  const idx = ActivePositionPicker.activePlacementIdx;
  if (idx >= 0 && idx < ActivePositionPicker.placements.length) {
    return ActivePositionPicker.placements[idx];
  }
  return ActivePositionPicker.placements[0];
}

// Helper to check if the currently active point is locked
function isCurrentPointLocked() {
  const curP = getActivePlacement();
  return !!(curP && curP.isLocked);
}

async function renderPositionModalPage(pageNum) {
  if (!ActivePositionPicker.pdfDoc) return;

  // 1. บันทึกพิกัดจุดปั๊มปัจจุบันก่อนเปลี่ยนหน้า (บันทึกเฉพาะ X, Y, Scale ไม่เปลี่ยนหมายเลขหน้าของจุดเดิม)
  saveCurrentToActivePlacement();

  ActivePositionPicker.currentPage = pageNum;

  const docCanvas = document.getElementById('positionDocCanvas');
  const viewportContainer = document.getElementById('positionModalViewport');
  const availableW = viewportContainer ? (viewportContainer.clientWidth - 48) : 650;
  const targetWidth = Math.max(380, Math.min(650, availableW));

  const page = await ActivePositionPicker.pdfDoc.getPage(pageNum);
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  docCanvas.width = viewport.width;
  docCanvas.height = viewport.height;
  const ctx = docCanvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  ActivePositionPicker.canvasWidth = viewport.width;
  ActivePositionPicker.canvasHeight = viewport.height;

  // Update Page Navigation Buttons & Select
  const prevBtn = document.getElementById('btnPosPrevPage');
  const nextBtn = document.getElementById('btnPosNextPage');
  const pageSelect = document.getElementById('posPageSelect');
  const totalPagesEl = document.getElementById('posTotalPages');

  if (prevBtn) prevBtn.disabled = (pageNum <= 1);
  if (nextBtn) nextBtn.disabled = (pageNum >= ActivePositionPicker.totalPages);
  if (pageSelect) pageSelect.value = String(pageNum);
  if (totalPagesEl) totalPagesEl.textContent = ActivePositionPicker.totalPages;

  // จัดการซิงค์ตำแหน่งและแสดงผลตราปั๊มบนหน้านี้
  syncPlacementForCurrentPage();
  updatePositionModalStampDimensions();
  updatePositionModalStampCoordinates();
  updatePositionLockUI();
  updatePlacementsBarUI();
}

function onPositionPageScopeChange(scope) {
  ActivePositionPicker.pageScope = scope;
  const customBar = document.getElementById('posCustomPagesBar');
  if (customBar) {
    if (scope === 'custom_pages') {
      customBar.style.display = 'flex';
      renderCustomPagesCheckboxes();
    } else {
      customBar.style.display = 'none';
    }
  }
  updatePositionModalStampCoordinates();
  autoStagePlacementSettings();
}

function renderCustomPagesCheckboxes() {
  const boxHolder = document.getElementById('posCustomPagesCheckboxes');
  if (!boxHolder) return;
  const total = ActivePositionPicker.totalPages || 1;
  let html = '';
  for (let i = 1; i <= total; i++) {
    const checked = ActivePositionPicker.customPages.includes(i) || i === 1;
    html += `
      <label style="display:inline-flex; align-items:center; gap:3px; background:#fff; padding:2px 7px; border-radius:3px; border:1px solid #93c5fd; cursor:pointer; font-weight:500;">
        <input type="checkbox" value="${i}" ${checked ? 'checked' : ''} onchange="toggleCustomPageSelection(${i}, this.checked)">
        หน้า ${i}
      </label>
    `;
  }
  boxHolder.innerHTML = html;
  if (ActivePositionPicker.customPages.length === 0) {
    ActivePositionPicker.customPages = [1];
  }
}

function toggleCustomPageSelection(pageNum, isChecked) {
  if (isChecked) {
    if (!ActivePositionPicker.customPages.includes(pageNum)) {
      ActivePositionPicker.customPages.push(pageNum);
    }
  } else {
    ActivePositionPicker.customPages = ActivePositionPicker.customPages.filter(p => p !== pageNum);
  }
  updatePositionModalStampCoordinates();
  autoStagePlacementSettings();
}

function onPositionModalScaleInput(val) {
  if (isCurrentPointLocked()) {
    showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ กรุณาปลดล็อคก่อนปรับขนาด`, 'warning');
    const curP = getActivePlacement();
    syncScaleSliderUI(curP ? curP.scale : ActivePositionPicker.scale);
    return;
  }
  const scale = Math.max(0.5, Math.min(2.0, parseFloat(val) || 1.0));
  ActivePositionPicker.scale = scale;
  syncScaleSliderUI(scale);
  updatePositionModalStampDimensions();
  saveCurrentToActivePlacement();
  updatePlacementsBarUI();
  autoStagePlacementSettings();
}

function adjustPositionModalScale(delta) {
  let cur = ActivePositionPicker.scale || 1.0;
  cur = Math.max(0.5, Math.min(2.0, Math.round((cur + delta) * 20) / 20));
  onPositionModalScaleInput(cur);
}

function setPositionModalQuickScale(scale) {
  onPositionModalScaleInput(scale);
}

function syncScaleSliderUI(scale) {
  const slider = document.getElementById('posStampScaleSlider');
  const txt = document.getElementById('posStampScaleVal');
  if (slider) slider.value = scale;
  if (txt) txt.textContent = Math.round(scale * 100) + '%';
}

function updatePositionModalStampDimensions() {
  const stampEl = document.getElementById('positionFloatingStamp');
  if (!stampEl || !ActivePositionPicker.canvasWidth) return;

  const type = ActivePositionPicker.type;
  const basePercent = (type === 'inbound') ? 0.38 : 0.44;
  const scale = ActivePositionPicker.scale || 1.0;
  const computedStampW = Math.max(120, ActivePositionPicker.canvasWidth * basePercent * scale);

  stampEl.style.width = computedStampW + 'px';
  ActivePositionPicker.stampWidth = computedStampW;
  const ratio = (type === 'director') ? (972 / 1619) : (887 / 1774);
  ActivePositionPicker.stampHeight = computedStampW * ratio + 18;

  updatePositionModalStampCoordinates();
}

function syncPlacementForCurrentPage() {
  const stampEl = document.getElementById('positionFloatingStamp');
  const bannerEl = document.getElementById('posNoStampOnCurrentPageBanner');
  const labelEl = document.getElementById('floatingStampLabel');
  const curPage = ActivePositionPicker.currentPage;
  const type = ActivePositionPicker.type;

  // ค้นหาจุดปั๊มที่อยู่ในหน้านี้
  // 1. ตรวจสอบว่า activePlacementIdx เดิม อยู่ในหน้านี้หรือไม่
  let targetIdx = -1;
  const curActiveP = getActivePlacement();
  if (curActiveP && curActiveP.page === curPage) {
    targetIdx = ActivePositionPicker.activePlacementIdx;
  } else {
    // 2. ถ้าไม่อยู่ ให้ค้นหาจุดแรกที่อยู่บนหน้านี้
    targetIdx = ActivePositionPicker.placements.findIndex(p => p.page === curPage);
  }

  if (targetIdx !== -1) {
    // หน้านี้มีจุดปั๊ม: แสดงกล่องตราปั๊มและโหลดพิกัดของจุดนั้น
    ActivePositionPicker.activePlacementIdx = targetIdx;
    const p = ActivePositionPicker.placements[targetIdx];
    ActivePositionPicker.percentX = p.percentX;
    ActivePositionPicker.percentY = p.percentY;
    if (typeof p.scale === 'number') {
      ActivePositionPicker.scale = p.scale;
      syncScaleSliderUI(p.scale);
    }
    if (stampEl) stampEl.style.display = 'block';
    if (bannerEl) bannerEl.style.display = 'none';
    if (labelEl) {
      const typeLabel = (type === 'inbound') ? 'ตราปั๊มรับเข้า' : ((type === 'proposal') ? 'ตราเสนอ ผอ.' : 'ตราสั่งการ ผอ.');
      labelEl.textContent = `${typeLabel} จุดที่ ${targetIdx + 1} (หน้า ${curPage})`;
    }
  } else {
    // หน้านี้ยังไม่มีจุดปั๊ม: ซ่อนกล่องตราปั๊มลอย และแสดงแถบแจ้งเตือน
    // สำคัญมาก: ห้ามแตะต้องหรือเปลี่ยน page ของจุดเดิมเด็ดขาด เพื่อป้องกันจุดปั๊มหน้าเดิมเลื่อนมากระจุกหน้าเดียวกัน!
    if (stampEl) stampEl.style.display = 'none';
    if (bannerEl) {
      bannerEl.style.display = 'flex';
      const pageNotice = document.getElementById('posCurrentPageNotice');
      if (pageNotice) pageNotice.textContent = curPage;
    }
  }

  updatePositionLockUI();
}

function updatePlacementsBarUI() {
  const container = document.getElementById('posPlacementsBarContainer');
  const listEl = document.getElementById('posPlacementsList');
  const delBtn = document.getElementById('btnPosDeletePlacement');
  const moveSelect = document.getElementById('posMovePlacementPageSelect');

  if (!container || !listEl) return;

  if (ActivePositionPicker.placements.length > 1) {
    container.style.display = 'flex';
    if (delBtn) delBtn.style.display = 'inline-flex';

    listEl.innerHTML = ActivePositionPicker.placements.map((p, idx) => {
      const isSelected = (idx === ActivePositionPicker.activePlacementIdx);
      const isLocked = !!p.isLocked;
      let classes = ['pos-placement-pill'];
      if (isSelected) classes.push('active');
      if (isLocked) classes.push('pill-locked');

      const lockIcon = isLocked
        ? '<i class="fa-solid fa-lock" style="color: #16a34a;" title="ล็อคจุดนี้แล้ว"></i>'
        : '<i class="fa-solid fa-lock-open" style="color: #94a3b8;" title="จุดนี้ปลดล็อคอยู่"></i>';

      return `
        <span class="${classes.join(' ')}" onclick="selectStampPlacement(${idx})" title="คลิกเพื่อเลือกจุดที่ ${idx + 1} (หน้า ${p.page || 1}) - ${isLocked ? 'ล็อคอยู่' : 'ปลดล็อค'}">
          ${lockIcon}
          <span>จุดที่ ${idx + 1} (หน้า ${p.page || 1})</span>
          <span style="font-size: 10px; opacity: 0.85;">${Math.round((p.scale || 1) * 100)}%</span>
        </span>
      `;
    }).join('');

    // อัพเดทดรอปดาวน์ "ย้ายจุดนี้ไปหน้า"
    if (moveSelect) {
      const curActiveP = getActivePlacement();
      const curPPage = curActiveP ? (curActiveP.page || 1) : 1;
      const totalPages = ActivePositionPicker.totalPages || 1;
      moveSelect.innerHTML = Array.from({ length: totalPages }, (_, i) => {
        const pg = i + 1;
        return `<option value="${pg}" ${pg === curPPage ? 'selected' : ''}>หน้า ${pg}</option>`;
      }).join('');
      moveSelect.disabled = !!(curActiveP && curActiveP.isLocked);
    }
  } else {
    container.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
  }

  // อัพเดทปุ่มล็อคทุกจุด
  const btnLockAll = document.getElementById('btnPosLockAll');
  const iconLockAll = document.getElementById('iconLockAll');
  const textLockAll = document.getElementById('textLockAll');
  if (btnLockAll && ActivePositionPicker.placements && ActivePositionPicker.placements.length > 0) {
    const allLocked = ActivePositionPicker.placements.every(p => !!p.isLocked);
    if (allLocked) {
      btnLockAll.style.background = '#dcfce7';
      btnLockAll.style.borderColor = '#16a34a';
      btnLockAll.style.color = '#15803d';
      if (iconLockAll) iconLockAll.className = 'fa-solid fa-lock';
      if (textLockAll) textLockAll.textContent = 'ปลดล็อคทุกจุด';
    } else {
      btnLockAll.style.background = '#f0fdf4';
      btnLockAll.style.borderColor = '#86efac';
      btnLockAll.style.color = '#166534';
      if (iconLockAll) iconLockAll.className = 'fa-solid fa-lock';
      if (textLockAll) textLockAll.textContent = 'ล็อคทุกจุด';
    }
  }
}

function addNewStampPlacement(targetPage, customPercentX, customPercentY) {
  saveCurrentToActivePlacement();

  const page = Number(targetPage) || ActivePositionPicker.currentPage || 1;
  const newIdx = ActivePositionPicker.placements.length;
  const type = ActivePositionPicker.type;

  const defaultScale = ActivePositionPicker.scale || 1.0;
  const px = (typeof customPercentX === 'number') ? customPercentX : ((type === 'inbound') ? 0.60 : (type === 'proposal' ? 0.05 : 0.58));
  const py = (typeof customPercentY === 'number') ? customPercentY : ((type === 'inbound') ? 0.03 : 0.60);

  const newPlacement = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    page: page,
    percentX: px,
    percentY: py,
    scale: defaultScale,
    preset: 'custom',
    isLocked: false // จุดใหม่เริ่มต้นด้วยสถานะปลดล็อคเสมอ เพื่อให้ปรับตำแหน่งได้ทันที
  };

  ActivePositionPicker.placements.push(newPlacement);
  ActivePositionPicker.activePlacementIdx = newIdx;
  ActivePositionPicker.percentX = px;
  ActivePositionPicker.percentY = py;
  ActivePositionPicker.scale = defaultScale;

  syncScaleSliderUI(defaultScale);

  if (page !== ActivePositionPicker.currentPage && ActivePositionPicker.pdfDoc) {
    renderPositionModalPage(page);
  } else {
    const stampEl = document.getElementById('positionFloatingStamp');
    const bannerEl = document.getElementById('posNoStampOnCurrentPageBanner');
    if (stampEl) stampEl.style.display = 'block';
    if (bannerEl) bannerEl.style.display = 'none';
    updatePositionModalStampDimensions();
    updatePositionModalStampCoordinates();
    updatePositionLockUI();
    updatePlacementsBarUI();
  }

  autoStagePlacementSettings();
  showToast(`เพิ่มตำแหน่งตราปั๊มจุดที่ ${newIdx + 1} บนหน้า ${page} เรียบร้อยแล้ว (สามารถลากย้ายและปรับย่อ-ขยายได้)`, 'success');
}

function moveActivePlacementToPage(targetPage) {
  const pageNum = parseInt(targetPage, 10);
  if (isNaN(pageNum) || pageNum < 1 || pageNum > (ActivePositionPicker.totalPages || 1)) return;

  const curP = getActivePlacement();
  if (!curP) return;

  if (curP.isLocked) {
    showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ กรุณาปลดล็อคก่อนย้ายไปหน้าอื่น`, 'warning');
    return;
  }

  const oldPage = curP.page || 1;
  curP.page = pageNum;

  if (pageNum !== ActivePositionPicker.currentPage && ActivePositionPicker.pdfDoc) {
    renderPositionModalPage(pageNum);
  } else {
    syncPlacementForCurrentPage();
    updatePositionModalStampCoordinates();
    updatePositionLockUI();
    updatePlacementsBarUI();
  }

  autoStagePlacementSettings();
  showToast(`ย้ายตราปั๊มจุดที่ ${ActivePositionPicker.activePlacementIdx + 1} จากหน้า ${oldPage} ไปยังหน้า ${pageNum} เรียบร้อยแล้ว`, 'success');
}

function selectStampPlacement(index) {
  if (index < 0 || index >= ActivePositionPicker.placements.length) return;
  saveCurrentToActivePlacement();

  ActivePositionPicker.activePlacementIdx = index;
  const p = ActivePositionPicker.placements[index];
  ActivePositionPicker.percentX = p.percentX;
  ActivePositionPicker.percentY = p.percentY;
  ActivePositionPicker.scale = p.scale || 1.0;
  syncScaleSliderUI(ActivePositionPicker.scale);

  if (p.page && p.page !== ActivePositionPicker.currentPage && ActivePositionPicker.pdfDoc) {
    renderPositionModalPage(p.page);
  } else {
    syncPlacementForCurrentPage();
    updatePositionModalStampDimensions();
    updatePositionModalStampCoordinates();
    updatePositionLockUI();
    updatePlacementsBarUI();
  }
}

function deleteActiveStampPlacement() {
  if (ActivePositionPicker.placements.length <= 1) {
    showToast('ต้องมีตราปั๊มอย่างน้อย 1 จุดในเอกสาร', 'warning');
    return;
  }
  const idx = ActivePositionPicker.activePlacementIdx;
  ActivePositionPicker.placements.splice(idx, 1);
  ActivePositionPicker.activePlacementIdx = Math.max(0, idx - 1);
  const p = ActivePositionPicker.placements[ActivePositionPicker.activePlacementIdx];
  ActivePositionPicker.percentX = p.percentX;
  ActivePositionPicker.percentY = p.percentY;
  ActivePositionPicker.scale = p.scale || 1.0;
  syncScaleSliderUI(ActivePositionPicker.scale);

  if (p.page && p.page !== ActivePositionPicker.currentPage && ActivePositionPicker.pdfDoc) {
    renderPositionModalPage(p.page);
  } else {
    syncPlacementForCurrentPage();
    updatePositionModalStampDimensions();
    updatePositionModalStampCoordinates();
    updatePositionLockUI();
    updatePlacementsBarUI();
  }
  autoStagePlacementSettings();
  showToast(`ลบจุดปั๊มเรียบร้อยแล้ว (เหลือ ${ActivePositionPicker.placements.length} จุด)`, 'info');
}

function saveCurrentToActivePlacement() {
  const curP = getActivePlacement();
  if (curP) {
    // บันทึกเฉพาะพิกัด X/Y และขนาดสเกล ไม่เปลี่ยนหรือทับหมายเลขหน้าของจุดเดิมเด็ดขาด
    curP.percentX = ActivePositionPicker.percentX;
    curP.percentY = ActivePositionPicker.percentY;
    curP.scale = ActivePositionPicker.scale;
  }
}

function updatePositionModalStampCoordinates() {
  const stampEl = document.getElementById('positionFloatingStamp');
  const coordsDisplay = document.getElementById('positionCoordsDisplay');
  if (!stampEl || !ActivePositionPicker.canvasWidth) return;

  const W = ActivePositionPicker.canvasWidth;
  const H = ActivePositionPicker.canvasHeight;
  const sW = ActivePositionPicker.stampWidth || (W * 0.36);
  const sH = ActivePositionPicker.stampHeight || (sW * 0.55);

  const left = Math.max(0, Math.min(W - sW, ActivePositionPicker.percentX * W));
  const top = Math.max(0, Math.min(H - sH, ActivePositionPicker.percentY * H));

  stampEl.style.left = left + 'px';
  stampEl.style.top = top + 'px';

  ActivePositionPicker.percentX = left / W;
  ActivePositionPicker.percentY = top / H;

  saveCurrentToActivePlacement();

  const pctX = Math.round(ActivePositionPicker.percentX * 100);
  const pctY = Math.round(ActivePositionPicker.percentY * 100);
  const scalePct = Math.round((ActivePositionPicker.scale || 1.0) * 100);

  let desc = 'กำหนดเอง';
  if (pctY <= 15 && pctX >= 48) desc = 'ขวาบน';
  else if (pctY <= 15 && pctX >= 22 && pctX < 48) desc = 'กลางบน';
  else if (pctY <= 15 && pctX < 22) desc = 'ซ้ายบน';
  else if (pctY >= 55 && pctX >= 48) desc = 'ขวาล่าง';
  else if (pctY >= 55 && pctX < 48) desc = 'ซ้ายล่าง';

  let pageText = `หน้า ${ActivePositionPicker.currentPage}`;
  if (ActivePositionPicker.placements.length > 1) {
    pageText = `ปั๊ม ${ActivePositionPicker.placements.length} จุด (${ActivePositionPicker.placements.map((p, i) => `จุดที่ ${i+1}: น.${p.page}${p.isLocked ? '🔒' : ''}`).join(', ')})`;
  } else if (ActivePositionPicker.pageScope === 'all') {
    pageText = `ปั๊มทุกหน้า (1-${ActivePositionPicker.totalPages})`;
  } else if (ActivePositionPicker.pageScope === 'custom_pages' && ActivePositionPicker.customPages.length > 0) {
    pageText = `ปั๊มหน้า: ${ActivePositionPicker.customPages.join(', ')}`;
  }

  const curP = getActivePlacement();
  const lockStatusText = (curP && curP.isLocked) ? '🔒 ล็อคแล้ว' : '🔓 ปลดล็อค';
  if (coordsDisplay) {
    coordsDisplay.textContent = `${pageText} | ${lockStatusText} | ตำแหน่ง: X:${pctX}%, Y:${pctY}% (${desc}) | ขนาด: ${scalePct}%`;
  }
}

function applyPositionModalPreset(preset) {
  if (isCurrentPointLocked()) {
    showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ กรุณาปลดล็อคก่อนปรับตำแหน่ง`, 'warning');
    return;
  }
  const W = ActivePositionPicker.canvasWidth || 600;
  const H = ActivePositionPicker.canvasHeight || 800;
  const sW = ActivePositionPicker.stampWidth || (W * 0.36);
  const sH = ActivePositionPicker.stampHeight || (sW * 0.55);

  const marginX = 14;
  const marginY = 16;

  switch (preset) {
    case 'top-right':
      ActivePositionPicker.percentX = (W - sW - marginX) / W;
      ActivePositionPicker.percentY = marginY / H;
      break;
    case 'top-center':
      ActivePositionPicker.percentX = ((W - sW) / 2) / W;
      ActivePositionPicker.percentY = marginY / H;
      break;
    case 'top-left':
      ActivePositionPicker.percentX = marginX / W;
      ActivePositionPicker.percentY = marginY / H;
      break;
    case 'bottom-right':
      ActivePositionPicker.percentX = (W - sW - marginX) / W;
      ActivePositionPicker.percentY = (H - sH - Math.max(marginY * 2, H * 0.08)) / H;
      break;
    case 'bottom-left':
      ActivePositionPicker.percentX = marginX / W;
      ActivePositionPicker.percentY = (H - sH - Math.max(marginY * 2, H * 0.08)) / H;
      break;
  }

  updatePositionModalStampCoordinates();
  autoStagePlacementSettings();
}

function nudgePositionModal(deltaX, deltaY) {
  if (isCurrentPointLocked()) {
    showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ กรุณาปลดล็อคก่อนปรับตำแหน่ง`, 'warning');
    return;
  }
  ActivePositionPicker.percentX += (deltaX / 100);
  ActivePositionPicker.percentY += (deltaY / 100);
  updatePositionModalStampCoordinates();
  autoStagePlacementSettings();
}

function autoStagePlacementSettings() {
  saveCurrentToActivePlacement();
  const type = ActivePositionPicker.type;

  let posObj = {
    preset: 'custom',
    scale: ActivePositionPicker.scale || 1.0,
    percentX: ActivePositionPicker.percentX,
    percentY: ActivePositionPicker.percentY,
    page: ActivePositionPicker.currentPage || 1
  };

  let badgeLabel = '✅ กำหนดตำแหน่งแล้ว';

  if (ActivePositionPicker.pageScope === 'all') {
    posObj.pages = 'all';
    posObj.targetScope = 'all';
    badgeLabel = `✅ ปั๊มทุกหน้า (${ActivePositionPicker.totalPages || 1} หน้า)`;
  } else if (ActivePositionPicker.pageScope === 'custom_pages' && ActivePositionPicker.customPages && ActivePositionPicker.customPages.length > 0) {
    posObj.pages = [...ActivePositionPicker.customPages];
    badgeLabel = `✅ ปั๊มหน้า: ${ActivePositionPicker.customPages.join(', ')}`;
  } else if (ActivePositionPicker.placements && ActivePositionPicker.placements.length > 0) {
    posObj.placements = ActivePositionPicker.placements.map(p => ({
      id: p.id,
      page: Number(p.page) || 1,
      percentX: typeof p.percentX === 'number' ? p.percentX : ActivePositionPicker.percentX,
      percentY: typeof p.percentY === 'number' ? p.percentY : ActivePositionPicker.percentY,
      scale: typeof p.scale === 'number' ? p.scale : posObj.scale,
      isLocked: !!p.isLocked,
      preset: p.preset || 'custom'
    }));

    posObj.isLocked = posObj.placements.every(p => !!p.isLocked);

    if (posObj.placements.length > 1) {
      posObj.page = posObj.placements[0].page;
      badgeLabel = `✅ ปั๊ม ${posObj.placements.length} จุด (${posObj.placements.map((p, i) => `จุด${i+1}:น.${p.page}${p.isLocked ? '🔒' : ''}`).join(', ')})`;
    } else {
      posObj.page = posObj.placements[0].page;
      const singleLock = posObj.placements[0].isLocked ? ' 🔒' : '';
      badgeLabel = `✅ ปั๊มหน้า ${posObj.page}${singleLock}`;
    }
  } else {
    posObj.page = ActivePositionPicker.currentPage || 1;
    badgeLabel = `✅ ปั๊มหน้า ${posObj.page}`;
  }

  if (type === 'inbound') {
    AppState.inboundCustomPos = posObj;
    AppState.inboundStampScale = posObj.scale;
    const badge = document.getElementById('inboundPosBadge');
    if (badge) {
      badge.textContent = badgeLabel;
      badge.className = 'badge badge-success';
      badge.style.background = '#16a34a';
      badge.style.color = '#ffffff';
    }
    const formScaleSlider = document.getElementById('inboundStampScale');
    if (formScaleSlider) formScaleSlider.value = posObj.scale;
    const formScaleTxt = document.getElementById('inboundStampScaleText');
    if (formScaleTxt) formScaleTxt.textContent = Math.round(posObj.scale * 100) + '%';

  } else if (type === 'proposal') {
    if (ActivePositionPicker.currentDoc) {
      ActivePositionPicker.currentDoc.proposalCustomPos = posObj;
      ActivePositionPicker.currentDoc.stamp2Pos = posObj;
    }
    const propScaleEl = document.getElementById('propStampScale');
    if (propScaleEl) propScaleEl.value = posObj.scale;
    const propScaleVal = document.getElementById('propStampScaleVal');
    if (propScaleVal) propScaleVal.textContent = Math.round(posObj.scale * 100) + '%';

  } else if (type === 'director') {
    if (ActivePositionPicker.currentDoc) {
      ActivePositionPicker.currentDoc.directorCustomPos = posObj;
      ActivePositionPicker.currentDoc.stamp3Pos = posObj;
    }
    const dirScaleEl = document.getElementById('dirStampScale');
    if (dirScaleEl) dirScaleEl.value = posObj.scale;
    const dirScaleVal = document.getElementById('dirStampScaleVal');
    if (dirScaleVal) dirScaleVal.textContent = Math.round(posObj.scale * 100) + '%';
  }

  return { posObj, badgeLabel };
}

function confirmPositionModalSelection() {
  const { posObj, badgeLabel } = autoStagePlacementSettings();
  showToast(`✅ ยืนยันการปั๊มตรา ${badgeLabel} เรียบร้อยแล้ว`, 'success');
  closeModal('stampPositionModal');

  if (ActivePositionPicker.type === 'inbound') {
    const saveBtn = document.getElementById('saveInboundBtn');
    if (saveBtn) {
      saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function togglePositionLock(forceState) {
  const curP = getActivePlacement();
  if (!curP) return;

  const targetState = (typeof forceState === 'boolean') ? forceState : !curP.isLocked;
  curP.isLocked = targetState;

  updatePositionLockUI();
  updatePlacementsBarUI();
  autoStagePlacementSettings();

  const ptNumber = ActivePositionPicker.activePlacementIdx + 1;
  const pgNumber = curP.page || ActivePositionPicker.currentPage || 1;
  if (targetState) {
    showToast(`🔒 ล็อคตำแหน่งตราปั๊มจุดที่ ${ptNumber} (หน้า ${pgNumber}) เรียบร้อยแล้ว (จุดนี้จะไม่เลื่อนหลุด)`, 'info');
  } else {
    showToast(`🔓 ปลดล็อคตำแหน่งตราปั๊มจุดที่ ${ptNumber} (หน้า ${pgNumber}) แล้ว (ลากหรือคลิกเพื่อย้ายได้)`, 'info');
  }
}

function toggleLockAllPoints() {
  if (!ActivePositionPicker.placements || ActivePositionPicker.placements.length === 0) return;

  const allLocked = ActivePositionPicker.placements.every(p => !!p.isLocked);
  const nextState = !allLocked;

  ActivePositionPicker.placements.forEach(p => {
    p.isLocked = nextState;
  });

  updatePositionLockUI();
  updatePlacementsBarUI();
  autoStagePlacementSettings();

  if (nextState) {
    showToast(`🔒 ล็อคตำแหน่งตราปั๊มทุกจุด (${ActivePositionPicker.placements.length} จุด) เรียบร้อยแล้ว`, 'info');
  } else {
    showToast(`🔓 ปลดล็อคตำแหน่งตราปั๊มทุกจุดเรียบร้อยแล้ว`, 'info');
  }
}

function updatePositionLockUI() {
  const curP = getActivePlacement();
  const isLocked = !!(curP && curP.isLocked);
  const activeIdx = ActivePositionPicker.activePlacementIdx;
  const ptLabel = `จุดที่ ${activeIdx + 1}`;

  const btnToggle = document.getElementById('btnPosLockToggle');
  const iconToggle = document.getElementById('iconPosLock');
  const textToggle = document.getElementById('textPosLock');

  const stampEl = document.getElementById('positionFloatingStamp');
  const wrapperEl = document.getElementById('positionDocWrapper');
  const handleLockIcon = document.getElementById('floatingStampLockIcon');
  const handleLockText = document.getElementById('floatingStampLockText');
  const dragIcon = document.getElementById('floatingStampDragIcon');
  const moveSelect = document.getElementById('posMovePlacementPageSelect');

  if (btnToggle) {
    if (isLocked) {
      btnToggle.classList.add('locked');
      if (iconToggle) iconToggle.className = 'fa-solid fa-lock';
      if (textToggle) textToggle.textContent = `ล็อค${ptLabel}แล้ว`;
      btnToggle.title = `คลิกเพื่อปลดล็อค ${ptLabel}`;
    } else {
      btnToggle.classList.remove('locked');
      if (iconToggle) iconToggle.className = 'fa-solid fa-lock-open';
      if (textToggle) textToggle.textContent = `ปลดล็อค${ptLabel}`;
      btnToggle.title = `คลิกล็อคตำแหน่ง ${ptLabel} เพื่อไม่ให้เลื่อนหลุด`;
    }
  }

  if (stampEl) {
    if (isLocked) {
      stampEl.classList.add('locked');
      stampEl.title = `${ptLabel} ถูกล็อคตำแหน่งแล้ว (คลิกไอคอนกุญแจเพื่อปลดล็อค)`;
    } else {
      stampEl.classList.remove('locked');
      stampEl.title = `คลิกค้างเพื่อลาก หรือคลิกบนเอกสารเพื่อย้ายตำแหน่ง ${ptLabel}`;
    }
  }

  if (wrapperEl) {
    if (isLocked) {
      wrapperEl.classList.add('locked');
    } else {
      wrapperEl.classList.remove('locked');
    }
  }

  if (handleLockIcon) {
    handleLockIcon.className = isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
  }
  if (handleLockText) {
    handleLockText.textContent = isLocked ? 'ล็อคแล้ว' : 'ปลดล็อค';
  }
  if (dragIcon) {
    dragIcon.className = isLocked ? 'fa-solid fa-shield-halved' : 'fa-solid fa-arrows-up-down-left-right';
  }

  if (moveSelect) {
    moveSelect.disabled = isLocked;
    if (isLocked) {
      moveSelect.title = `${ptLabel} ถูกล็อคตำแหน่งอยู่ กรุณาปลดล็อคก่อนย้ายไปหน้าอื่น`;
    } else {
      moveSelect.title = 'เลือกหน้าที่ต้องการย้ายจุดนี้ไป';
    }
  }
}

function savePositionModalAsDefault() {
  saveCurrentToActivePlacement();
  autoStagePlacementSettings();
  togglePositionLock(true);
  showToast(`📌 ล็อคและบันทึกตำแหน่งจุดที่ ${ActivePositionPicker.activePlacementIdx + 1} เรียบร้อยแล้ว`, 'success');
}

function initPositionModalListeners() {
  if (ActivePositionPicker.listenersAttached) return;
  ActivePositionPicker.listenersAttached = true;

  const wrapper = document.getElementById('positionDocWrapper');
  const stampEl = document.getElementById('positionFloatingStamp');
  if (!wrapper || !stampEl) return;

  // Click on document to jump stamp or place on current page
  wrapper.addEventListener('click', (e) => {
    if (e.target === stampEl || stampEl.contains(e.target) || ActivePositionPicker.isDragging) return;

    const curPage = ActivePositionPicker.currentPage;
    const curP = getActivePlacement();
    const hasStampOnPage = ActivePositionPicker.placements.some(p => p.page === curPage);

    const rect = wrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const W = ActivePositionPicker.canvasWidth;
    const H = ActivePositionPicker.canvasHeight;
    const sW = ActivePositionPicker.stampWidth || (W * 0.36);
    const sH = ActivePositionPicker.stampHeight || (sW * 0.55);

    const left = Math.max(0, Math.min(W - sW, clickX - (sW / 2)));
    const top = Math.max(0, Math.min(H - sH, clickY - (sH / 2)));
    const pctX = left / W;
    const pctY = top / H;

    if (hasStampOnPage) {
      // หน้านี้มีจุดปั๊มอยู่แล้ว
      // ถ้าจุดที่เลือกถูกล็อคอยู่ ห้ามขยับ
      if (isCurrentPointLocked()) {
        showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ (คลิกปุ่มกุญแจเพื่อปลดล็อค)`, 'warning');
        return;
      }
      ActivePositionPicker.percentX = pctX;
      ActivePositionPicker.percentY = pctY;
    } else {
      // หน้านี้ยังไม่มีตราปั๊ม
      // หากมีแค่ 1 จุดและปลดล็อคอยู่: ย้ายจุดเดียวนั้นมาหน้านี้ตามพิกัดที่คลิก
      if (ActivePositionPicker.placements.length <= 1 && curP && !curP.isLocked) {
        curP.page = curPage;
        ActivePositionPicker.percentX = pctX;
        ActivePositionPicker.percentY = pctY;
        const bannerEl = document.getElementById('posNoStampOnCurrentPageBanner');
        if (bannerEl) bannerEl.style.display = 'none';
        if (stampEl) stampEl.style.display = 'block';
      } else {
        // หากมีหลายจุด หรือจุดเดิมล็อคอยู่: เพิ่มจุดปั๊มใหม่บนหน้านี้ที่พิกัดคลิกทันที
        addNewStampPlacement(curPage, pctX, pctY);
        return;
      }
    }

    updatePositionModalStampCoordinates();
    updatePlacementsBarUI();
    autoStagePlacementSettings();
  });

  // Pointer drag on stamp
  stampEl.addEventListener('pointerdown', (e) => {
    if (isCurrentPointLocked()) {
      showToast(`🔒 จุดที่ ${ActivePositionPicker.activePlacementIdx + 1} ถูกล็อคตำแหน่งอยู่ (คลิกปุ่มกุญแจเพื่อปลดล็อค)`, 'warning');
      return;
    }
    ActivePositionPicker.isDragging = true;
    ActivePositionPicker.dragStartX = e.clientX;
    ActivePositionPicker.dragStartY = e.clientY;
    ActivePositionPicker.stampStartLeft = parseFloat(stampEl.style.left) || 0;
    ActivePositionPicker.stampStartTop = parseFloat(stampEl.style.top) || 0;
    try { stampEl.setPointerCapture(e.pointerId); } catch (_) {}
    e.stopPropagation();
  });

  stampEl.addEventListener('pointermove', (e) => {
    if (!ActivePositionPicker.isDragging) return;
    const deltaX = e.clientX - ActivePositionPicker.dragStartX;
    const deltaY = e.clientY - ActivePositionPicker.dragStartY;

    const W = ActivePositionPicker.canvasWidth;
    const H = ActivePositionPicker.canvasHeight;
    const sW = ActivePositionPicker.stampWidth || (W * 0.36);
    const sH = ActivePositionPicker.stampHeight || (sW * 0.55);

    const newLeft = Math.max(0, Math.min(W - sW, ActivePositionPicker.stampStartLeft + deltaX));
    const newTop = Math.max(0, Math.min(H - sH, ActivePositionPicker.stampStartTop + deltaY));

    ActivePositionPicker.percentX = newLeft / W;
    ActivePositionPicker.percentY = newTop / H;
    updatePositionModalStampCoordinates();
  });

  const stopDrag = (e) => {
    if (ActivePositionPicker.isDragging) {
      ActivePositionPicker.isDragging = false;
      try { stampEl.releasePointerCapture(e.pointerId); } catch (_) {}
      autoStagePlacementSettings();
    }
  };

  stampEl.addEventListener('pointerup', stopDrag);
  stampEl.addEventListener('pointercancel', stopDrag);
}

/* ==========================================================================
   Document Viewer Modal (รองรับดูไฟล์แนบหลายไฟล์ & สลับไฟล์)
   ========================================================================== */
function viewDocument(docId, fileIndex = 0) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  AppState.currentDocId = docId;
  AppState.activeViewFileIndex = fileIndex;

  document.getElementById('viewModalDocNo').textContent = doc.bookNo;
  document.getElementById('viewModalDocTitle').textContent = doc.title;

  const viewerContainer = document.getElementById('documentViewerContainer');
  if (!viewerContainer) return;

  const files = (doc.files && doc.files.length > 0) ? doc.files : [{
    name: doc.fileName || 'หนังสือรับ.pdf',
    type: doc.fileType || 'application/pdf',
    originalDataUrl: doc.originalDataUrl,
    stampedDataUrl: doc.stampedDataUrl,
    isPrimary: true
  }];

  const safeIdx = Math.max(0, Math.min(files.length - 1, fileIndex));
  const currentFile = files[safeIdx];
  const fileDataUrl = currentFile.stampedDataUrl || currentFile.originalDataUrl || doc.stampedDataUrl || doc.originalDataUrl;

  let switcherHtml = '';
  if (files.length > 1) {
    switcherHtml = `
      <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <span style="font-size: 12px; font-weight: 600; color: #1e40af; margin-right: 4px;">
          <i class="fa-solid fa-paperclip"></i> รายการไฟล์แนบ (${files.length} ไฟล์):
        </span>
        ${files.map((f, idx) => {
          const isActive = idx === safeIdx;
          const isPdf = f.type === 'application/pdf';
          const label = idx === 0 ? 'เอกสารหลัก (ประทับตรา)' : `เอกสารแนบ ${idx}`;
          return `
            <button type="button" class="file-switcher-pill ${isActive ? 'active' : ''}"
              onclick="viewDocument('${docId}', ${idx})"
              title="${escapeHtml(f.name)}">
              <i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file-image'}"></i>
              <span>${label}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  if (!fileDataUrl && doc.driveFileUrl) {
    viewerContainer.innerHTML = switcherHtml + `
      <div style="text-align:center; padding: 40px;">
        <i class="fa-solid fa-cloud-arrow-down" style="font-size: 52px; color: #0284c7; margin-bottom: 16px;"></i>
        <h4 style="margin-bottom: 8px;">เอกสารจัดเก็บบน Google Drive</h4>
        <p style="color: #64748b; margin-bottom: 24px; font-size: 14px;">ไฟล์เอกสารประทับตราถูกจัดเก็บบน Google Drive เรียบร้อยแล้ว</p>
        <a href="${doc.driveFileUrl}" target="_blank" class="btn btn-primary" style="padding: 10px 20px;">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดดูไฟล์บน Google Drive
        </a>
      </div>
    `;
    setupDownloadButtons(doc, currentFile, files);
    openModal('documentViewModal');
    return;
  }

  let bodyHtml = '';
  if (currentFile.type === 'application/pdf') {
    bodyHtml = `
      <iframe src="${fileDataUrl}" style="width:100%; height:550px; border:none; border-radius:8px;"></iframe>
    `;
  } else {
    bodyHtml = `
      <div style="text-align:center; padding:10px; max-height:550px; overflow:auto;">
        <img src="${fileDataUrl}" alt="${escapeHtml(currentFile.name)}" style="max-width:100%; height:auto; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.15);">
      </div>
    `;
  }

  viewerContainer.innerHTML = switcherHtml + bodyHtml;
  setupDownloadButtons(doc, currentFile, files);
  openModal('documentViewModal');
}

function setupDownloadButtons(doc, currentFile, files) {
  const downloadBtn = document.getElementById('btnDownloadDoc');
  let downloadAllBtn = document.getElementById('btnDownloadAllDocs');

  if (downloadBtn) {
    const isPrimary = !!currentFile.isPrimary || (files && files[0] === currentFile);
    const isStamped = isPrimary && (currentFile.stampedDataUrl || doc.stampedDataUrl);
    const shortName = currentFile.name.length > 25 ? (currentFile.name.slice(0, 22) + '...') : currentFile.name;
    downloadBtn.innerHTML = `<i class="fa-solid fa-download"></i> ดาวน์โหลดไฟล์นี้ (${escapeHtml(shortName)})`;
    downloadBtn.onclick = () => {
      const dataUrl = currentFile.stampedDataUrl || currentFile.originalDataUrl || doc.stampedDataUrl || doc.originalDataUrl;
      const ext = currentFile.type === 'application/pdf' ? 'pdf' : 'png';
      const cleanBookNo = (doc.bookNo || 'เอกสาร').replace(/[\/\\?%*:|"<>]/g, '-');
      const suffix = isStamped ? '_ประทับตรา' : '';
      const fname = currentFile.name || `หนังสือรับ_${cleanBookNo}${suffix}.${ext}`;
      downloadFile(dataUrl, fname);
      showToast(`ดาวน์โหลดไฟล์: ${currentFile.name}`, 'success');
    };
  }

  const modalFooter = document.querySelector('#documentViewModal .modal-footer');
  if (modalFooter) {
    if (files && files.length > 1) {
      if (!downloadAllBtn) {
        downloadAllBtn = document.createElement('button');
        downloadAllBtn.type = 'button';
        downloadAllBtn.id = 'btnDownloadAllDocs';
        downloadAllBtn.className = 'btn btn-success';
        downloadAllBtn.style.marginLeft = '8px';
        modalFooter.appendChild(downloadAllBtn);
      }
      downloadAllBtn.style.display = 'inline-flex';
      downloadAllBtn.innerHTML = `<i class="fa-solid fa-file-zipper"></i> ดาวน์โหลดทั้งหมด (${files.length} ไฟล์)`;
      downloadAllBtn.onclick = () => downloadAllDocFiles(doc);
    } else if (downloadAllBtn) {
      downloadAllBtn.style.display = 'none';
    }
  }
}

function downloadAllDocFiles(doc) {
  const files = (doc.files && doc.files.length > 0) ? doc.files : [{
    name: doc.fileName || 'หนังสือรับ.pdf',
    type: doc.fileType || 'application/pdf',
    originalDataUrl: doc.originalDataUrl,
    stampedDataUrl: doc.stampedDataUrl,
    isPrimary: true
  }];

  const cleanBookNo = (doc.bookNo || 'เอกสาร').replace(/[\/\\?%*:|"<>]/g, '-');
  files.forEach((f, idx) => {
    setTimeout(() => {
      const dataUrl = f.stampedDataUrl || f.originalDataUrl || doc.stampedDataUrl || doc.originalDataUrl;
      if (dataUrl) {
        const ext = f.type === 'application/pdf' ? 'pdf' : 'png';
        const suffix = (idx === 0) ? '_ประทับตรา' : `_แนบ${idx}`;
        const name = f.name || `หนังสือรับ_${cleanBookNo}${suffix}.${ext}`;
        downloadFile(dataUrl, name);
      }
    }, idx * 450);
  });
  showToast(`กำลังเริ่มดาวน์โหลดไฟล์ทั้งหมด (${files.length} ไฟล์)...`, 'info');
}

function downloadFile(dataUrl, fileName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ==========================================================================
   Edit & Delete Document
   ========================================================================== */
function openEditModal(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  AppState.currentDocId = docId;
  document.getElementById('editDocId').value = doc.id;
  document.getElementById('editBookNo').value = doc.bookNo;
  setEditReceiveDate(doc.receiveDate);
  document.getElementById('editReceiveTime').value = doc.receiveTime;
  document.getElementById('editTitle').value = doc.title;

  openModal('editModal');
}

async function handleSaveEdit() {
  const docId = document.getElementById('editDocId').value;
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  const newBookNo = (document.getElementById('editBookNo').value || '').trim();
  const newReceiveDate = (document.getElementById('editReceiveDate').value || '').trim();
  const newReceiveTime = (document.getElementById('editReceiveTime').value || '').trim();
  const newTitle = (document.getElementById('editTitle').value || '').trim();

  if (!newBookNo) {
    showToast('กรุณาระบุเลขหนังสือรับ', 'warning');
    return;
  }

  doc.bookNo = newBookNo;
  doc.receiveDate = newReceiveDate;
  doc.receiveTime = newReceiveTime;
  doc.title = newTitle;
  doc.updatedAt = new Date().toISOString();

  saveRecordsToStorage();
  syncToGasIfAvailable('editRecord', doc);

  closeModal('editModal');
  renderAllTables();
  updateLatestBookNoPlaceholder();
  showToast('แก้ไขข้อมูลหนังสือรับเรียบร้อย', 'success');
}

function deleteRecord(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  if (confirm(`คุณต้องการลบหนังสือรับเลขที่ "${doc.bookNo}" ใช่หรือไม่?`)) {
    AppState.records = AppState.records.filter(r => r.id !== docId);
    reindexRecords();
    saveRecordsToStorage();
    syncToGasIfAvailable('deleteRecord', { id: docId });

    renderAllTables();
    updateKpiStats();
    updateLatestBookNoPlaceholder();
    showToast(`ลบหนังสือรับเลขที่ ${doc.bookNo} เรียบร้อย`, 'info');
  }
}

/* ==========================================================================
   IndexedDB & LocalStorage Robust Persistence
   ========================================================================== */
const StorageDB = {
  dbName: 'BanSandapSarabanDB',
  storeName: 'records_store',
  dbPromise: null,

  getDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB open error:', req.error);
        resolve(null);
      };
    });
    return this.dbPromise;
  },

  async set(key, val) {
    try {
      const db = await this.getDB();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(val, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('IndexedDB set error:', e);
      return false;
    }
  },

  async get(key) {
    try {
      const db = await this.getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('IndexedDB get error:', e);
      return null;
    }
  }
};

/* ==========================================================================
   Google Apps Script Sync & Storage (ยึดฐานข้อมูล Google Sheet เป็นหลักสูงสุด)
   ========================================================================== */
async function loadStoredRecords() {
  try {
    // 1. Initial attempt: read storage so we have local files and cache structure ready
    const idbData = await StorageDB.get('inbound_book_records');
    if (Array.isArray(idbData) && idbData.length > 0) {
      AppState.records = idbData;
    } else {
      const raw = localStorage.getItem('inbound_book_records');
      if (raw) {
        AppState.records = JSON.parse(raw);
      }
    }
  } catch (e) {
    AppState.records = [];
  }

  // 2. Render initial view
  reindexRecords();
  renderAllTables();
  updateKpiStats();
  updateLatestBookNoPlaceholder();

  // 3. Immediately sync and strictly overwrite with Google Sheet database
  await syncInboundRecordsFromGas(false);
}

function saveRecordsToStorage() {
  // 1. Save full data with all PDFs, canvas stamps, and signatures into IndexedDB (virtually unlimited quota)
  StorageDB.set('inbound_book_records', AppState.records);

  // 2. Save to localStorage as secondary backup
  try {
    localStorage.setItem('inbound_book_records', JSON.stringify(AppState.records));
  } catch (e) {
    // If 5MB quota exceeded, save metadata version into localStorage so status and signatures data are NEVER lost
    try {
      const safeRecords = AppState.records.map(r => {
        const clone = { ...r };
        if (clone.originalDataUrl && clone.originalDataUrl.length > 50000) {
          clone.originalDataUrl = '';
        }
        if (clone.stampedDataUrl && clone.stampedDataUrl.length > 50000) {
          clone.stampedDataUrl = '';
        }
        if (Array.isArray(clone.files)) {
          clone.files = clone.files.map(f => {
            const fClone = { ...f };
            if (fClone.originalDataUrl && fClone.originalDataUrl.length > 50000) fClone.originalDataUrl = '';
            if (fClone.stampedDataUrl && fClone.stampedDataUrl.length > 50000) fClone.stampedDataUrl = '';
            return fClone;
          });
        }
        return clone;
      });
      localStorage.setItem('inbound_book_records', JSON.stringify(safeRecords));
    } catch (err2) {
      console.warn('LocalStorage save failed even for trimmed records:', err2);
    }
  }
}

async function syncInboundRecordsFromGas(isManual = false) {
  if (isManual) {
    showToast('กำลังเชื่อมต่อและดึงข้อมูลจาก Google Sheet...', 'info');
  }

  let fetchedData = null;

  // วิธีที่ 1: ดึงผ่าน Google Apps Script Web App API
  if (AppState.gasWebAppUrl) {
    try {
      const gasUrl = AppState.gasWebAppUrl + (AppState.gasWebAppUrl.includes('?') ? '&' : '?') + 'action=getRecords&t=' + Date.now();
      const res = await fetch(gasUrl, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.data)) {
          fetchedData = json.data;
        }
      }
    } catch (errGas) {
      console.warn('Could not fetch from GAS Web App, attempting GViz fallback:', errGas);
    }
  }

  // วิธีที่ 2: ดึงตรงผ่าน Google Sheets GViz API (Fallback ความเร็วสูง เชื่อมต่อชีตโดยตรง)
  if (fetchedData === null && AppState.sheetInboundId) {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${AppState.sheetInboundId}/gviz/tq?tqx=out:json&sheet=InboundRecords&t=${Date.now()}`;
      const res = await fetch(gvizUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const gviz = JSON.parse(jsonStr);
        const rows = gviz.table ? (gviz.table.rows || []) : [];
        const records = [];

        rows.forEach((r, idx) => {
          const getVal = (colIdx) => {
            const c = r.c ? r.c[colIdx] : null;
            if (!c) return '';
            if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return String(c.f).trim();
            if (c.v !== null && c.v !== undefined) {
              const vStr = String(c.v);
              if (vStr.startsWith('Date(')) {
                const parts = vStr.replace(/[^\d,]/g, '').split(',').map(Number);
                if (parts.length >= 3) {
                  const y = parts[0];
                  const m = String(parts[1] + 1).padStart(2, '0');
                  const d = String(parts[2]).padStart(2, '0');
                  return `${d}/${m}/${y}`;
                }
              }
              return vStr.trim();
            }
            return '';
          };

          const id = String(getVal(0) || '').trim();
          const orderNo = getVal(1) || (idx + 1);
          const bookNo = String(getVal(2) || '').trim();
          const title = String(getVal(5) || '').trim();

          // ข้ามแถวหัวตาราง (Header)
          if (id === 'ID' && (bookNo === 'เลขหนังสือรับ' || getVal(1) === 'ลำดับ')) return;
          if (!id && !bookNo && !title) return;

          let proposalData = null;
          let directorData = null;
          try {
            const pVal = getVal(9);
            if (pVal) proposalData = typeof pVal === 'string' ? JSON.parse(pVal) : pVal;
          } catch (e) {}
          try {
            const dVal = getVal(10);
            if (dVal) directorData = typeof dVal === 'string' ? JSON.parse(dVal) : dVal;
          } catch (e) {}

          records.push({
            id: id || ('doc_row_' + (idx + 1)),
            orderNo: Number(orderNo) || (idx + 1),
            bookNo: bookNo || '-',
            receiveDate: getVal(3) || '',
            receiveTime: getVal(4) || '',
            title: title || '',
            assignee: getVal(6) || '-',
            status: getVal(7) || 'รอเสนอ ผอ.',
            driveFileUrl: getVal(8) || '',
            proposalData: proposalData,
            directorData: directorData,
            updatedAt: getVal(11) || ''
          });
        });

        fetchedData = records;
      }
    } catch (errGviz) {
      console.warn('GViz fallback failed as well:', errGviz);
    }
  }

  // ปรับปรุงข้อมูลตามฐานข้อมูลจริงเป็นหลักสูงสุด (Single Source of Truth)
  if (Array.isArray(fetchedData)) {
    // เก็บแคชไฟล์แนบหรือตราประทับในเครื่องไว้เฉพาะรายการที่ยังมีอยู่ในฐานข้อมูล
    const localFileCache = new Map();
    (AppState.records || []).forEach(r => {
      if (r.id) localFileCache.set(String(r.id), r);
      if (r.bookNo) localFileCache.set('no_' + String(r.bookNo), r);
    });

    // กำหนดรายการในระบบให้ตรงตามฐานข้อมูล Google Sheet 100%
    AppState.records = fetchedData.map((sheetRec, idx) => {
      const cached = localFileCache.get(String(sheetRec.id)) || localFileCache.get('no_' + String(sheetRec.bookNo)) || {};

      return {
        id: sheetRec.id || cached.id || ('doc_row_' + (idx + 1)),
        orderNo: sheetRec.orderNo || (idx + 1),
        bookNo: sheetRec.bookNo || '-',
        receiveDate: sheetRec.receiveDate || cached.receiveDate || '',
        receiveTime: sheetRec.receiveTime || cached.receiveTime || '',
        title: sheetRec.title || cached.title || '',
        assignee: sheetRec.assignee || cached.assignee || '-',
        status: sheetRec.status || cached.status || 'รอเสนอ ผอ.',
        step: sheetRec.status === 'เสร็จสิ้น' ? 3 : (sheetRec.proposalData || cached.proposalData ? 2 : 1),
        driveFileUrl: sheetRec.driveFileUrl || cached.driveFileUrl || '',
        proposalData: sheetRec.proposalData || cached.proposalData || null,
        directorData: sheetRec.directorData || cached.directorData || null,
        stamp1Pos: cached.stamp1Pos || null,
        stamp2Pos: cached.stamp2Pos || null,
        stamp3Pos: cached.stamp3Pos || null,
        originalDataUrl: cached.originalDataUrl || '',
        stampedDataUrl: cached.stampedDataUrl || '',
        fileName: cached.fileName || (sheetRec.bookNo ? `หนังสือรับ_${sheetRec.bookNo}.pdf` : 'เอกสาร.pdf'),
        fileType: cached.fileType || 'application/pdf',
        files: cached.files || [],
        updatedAt: sheetRec.updatedAt || cached.updatedAt || new Date().toISOString()
      };
    });

    reindexRecords();
    saveRecordsToStorage();
    renderAllTables();
    updateKpiStats();
    updateLatestBookNoPlaceholder();

    if (isManual) {
      if (AppState.records.length > 0) {
        showToast(`✓ ซิงค์ฐานข้อมูลสำเร็จ! ข้อมูลตรงตาม Google Sheet ทั้งหมด ${AppState.records.length} รายการ`, 'success');
      } else {
        showToast('✓ ฐานข้อมูล Google Sheet ปัจจุบันว่าง (0 รายการ) ระบบได้อัปเดตตรงตามฐานข้อมูลเรียบร้อย', 'info');
      }
    }
  } else {
    console.warn('Could not sync with Google Sheet database');
    if (isManual) {
      showToast('ไม่สามารถเชื่อมต่อฐานข้อมูล Google Sheet ได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'danger');
    }
  }
}

async function syncToGasIfAvailable(action, payload) {
  if (!AppState.gasWebAppUrl) {
    console.info('Google Apps Script Web App URL is not set. Data saved to local storage.');
    return;
  }

  try {
    let cleanPayload = payload;
    if (action === 'saveRecord' && payload) {
      cleanPayload = { ...payload };
      // Strip duplicated base64 in root fields if files array is present
      if (Array.isArray(cleanPayload.files) && cleanPayload.files.length > 0) {
        delete cleanPayload.originalDataUrl;
        delete cleanPayload.stampedDataUrl;
        cleanPayload.files = cleanPayload.files.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size,
          stampedDataUrl: f.stampedDataUrl || f.originalDataUrl
        }));
      }
    }

    await fetch(AppState.gasWebAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: cleanPayload })
    });
    console.log('Synced to GAS Web App:', action);
  } catch (err) {
    console.warn('GAS sync warning:', err);
  }
}

function openGasModal() {
  const input = document.getElementById('gasModalUrlInput');
  if (input) input.value = AppState.gasWebAppUrl || '';
  openModal('gasModal');
}

function saveGasSettingsFromModal() {
  const url = (document.getElementById('gasModalUrlInput')?.value || '').trim();
  AppState.gasWebAppUrl = url;
  localStorage.setItem('gasWebAppUrl', url);
  updateGasStatusBadge();
  closeModal('gasModal');
  if (url) {
    showToast('บันทึกและเชื่อมต่อ Google Apps Script เรียบร้อย', 'success');
    syncExistingRecordsToGas();
  } else {
    showToast('ล้างการเชื่อมต่อ Google Apps Script เรียบร้อย', 'info');
  }
}

async function syncExistingRecordsToGas() {
  if (!AppState.gasWebAppUrl) return;
  try {
    // 1. Sync Inbound records
    for (const r of AppState.records) {
      await syncToGasIfAvailable('saveRecord', r);
    }
    // 2. Sync Outbound records
    for (const r of (AppState.outboundRecords || [])) {
      await syncToGasIfAvailable('saveOutboundRecord', r);
    }
    // 3. Sync Order records
    for (const r of (AppState.orderRecords || [])) {
      await syncToGasIfAvailable('saveOrderRecord', r);
    }
    showToast('ซิงค์ข้อมูลทั้งหมดลง Google Sheet เรียบร้อยแล้ว', 'success');
  } catch (e) {
    console.warn('Sync existing records error:', e);
  }
}

function updateGasStatusBadge() {
  const btn = document.getElementById('gasStatusBtn');
  const txt = document.getElementById('gasStatusText');
  if (!btn || !txt) return;

  if (AppState.gasWebAppUrl) {
    btn.className = 'gas-badge-btn connected';
    txt.innerHTML = '<i class="fa-solid fa-cloud-check"></i> เชื่อมต่อ Google Sheet แล้ว';
    btn.title = 'เชื่อมต่อ Google Sheet แล้ว คลิกเพื่อแก้ไข';
  } else {
    btn.className = 'gas-badge-btn warning';
    txt.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> เชื่อมต่อ Google Sheet';
    btn.title = 'คลิกเพื่อระบุ Web App URL สำหรับบันทึกลง Google Sheet';
  }
}

function saveGasSettings() {
  const url = (document.getElementById('gasUrlInput')?.value || '').trim();
  AppState.gasWebAppUrl = url;
  localStorage.setItem('gasWebAppUrl', url);
  updateGasStatusBadge();
  showToast('บันทึกการตั้งค่า Google Apps Script เรียบร้อย', 'success');
}

/* ==========================================================================
   Modal Helpers
   ========================================================================== */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
  if (modalId === 'stampPositionModal' && typeof autoStagePlacementSettings === 'function') {
    autoStagePlacementSettings();
  }
}

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: 'fa-circle-check text-success',
    warning: 'fa-triangle-exclamation text-warning',
    danger: 'fa-circle-xmark text-danger',
    info: 'fa-circle-info text-primary'
  };

  toast.innerHTML = `
    <i class="fa-solid ${iconMap[type] || 'fa-info'}"></i>
    <div style="flex:1;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ==========================================================================
   Utility Helpers
   ========================================================================== */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBytes(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string') {
      resolve(null);
      return;
    }
    try {
      const commaIdx = dataUrl.indexOf(',');
      const base64Str = (commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl).replace(/\s/g, '');
      if (!base64Str) {
        resolve(null);
        return;
      }
      const binary = atob(base64Str);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      resolve(bytes);
    } catch (e) {
      console.warn('dataUrlToBytes decode warning safely handled:', e);
      resolve(null);
    }
  });
}

function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

async function fetchFileFromDriveViaGas(driveUrl) {
  if (!AppState.gasWebAppUrl || !driveUrl) return null;
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) return null;

  try {
    const url = `${AppState.gasWebAppUrl}${AppState.gasWebAppUrl.includes('?') ? '&' : '?'}action=getFileBase64&fileId=${fileId}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.status === 'success' && json.dataUrl) {
      return json;
    }
  } catch (e) {
    console.warn('Failed to fetch file from Drive via GAS:', e);
  }
  return null;
}

async function ensureDocumentBytes(doc) {
  if (!doc) return null;

  // 1. In-memory Uint8Array
  if (doc.bytes instanceof Uint8Array && doc.bytes.length > 0) {
    return doc.bytes;
  }

  // 2. originalDataUrl
  if (doc.originalDataUrl) {
    const b = await dataUrlToBytes(doc.originalDataUrl);
    if (b && b.length > 0) return b;
  }

  // 3. stampedDataUrl
  if (doc.stampedDataUrl) {
    const b = await dataUrlToBytes(doc.stampedDataUrl);
    if (b && b.length > 0) return b;
  }

  // 4. Files array
  if (Array.isArray(doc.files) && doc.files.length > 0) {
    for (const f of doc.files) {
      if (f.bytes instanceof Uint8Array && f.bytes.length > 0) return f.bytes;
      if (f.originalDataUrl) {
        const b = await dataUrlToBytes(f.originalDataUrl);
        if (b && b.length > 0) return b;
      }
      if (f.stampedDataUrl) {
        const b = await dataUrlToBytes(f.stampedDataUrl);
        if (b && b.length > 0) return b;
      }
    }
  }

  // 5. Fetch from Google Drive via GAS Web App proxy (enables cross-device stamping and positioning!)
  if (doc.driveFileUrl) {
    const loaded = await fetchFileFromDriveViaGas(doc.driveFileUrl);
    if (loaded && loaded.dataUrl) {
      doc.originalDataUrl = loaded.dataUrl;
      const b = await dataUrlToBytes(loaded.dataUrl);
      if (b && b.length > 0) {
        saveRecordsToStorage();
        return b;
      }
    }
  }

  return null;
}

/* ==========================================================================
   Date Dropdown Helpers (Dropbox วัน / เดือน / ปี ให้เลือก)
   ========================================================================== */
function populateDateDropdowns(dayId, monthId, yearId, defaultDate = new Date()) {
  const dayEl = document.getElementById(dayId);
  const monthEl = document.getElementById(monthId);
  const yearEl = document.getElementById(yearId);
  if (!dayEl || !monthEl || !yearEl) return;

  // Day options 1..31
  let dayHtml = '<option value="">วัน</option>';
  for (let d = 1; d <= 31; d++) {
    dayHtml += `<option value="${d}">${d}</option>`;
  }
  dayEl.innerHTML = dayHtml;

  // Month options 1..12 in Thai
  let monthHtml = '<option value="">เดือน</option>';
  ThaiDateUtil.thaiMonths.forEach((mName, idx) => {
    monthHtml += `<option value="${idx + 1}">${mName}</option>`;
  });
  monthEl.innerHTML = monthHtml;

  // Year options (Buddhist Era)
  const currentBEYear = ThaiDateUtil.getBuddhistYear();
  let yearHtml = '<option value="">ปี พ.ศ.</option>';
  for (let y = currentBEYear - 2; y <= currentBEYear + 3; y++) {
    yearHtml += `<option value="${y}">พ.ศ. ${y}</option>`;
  }
  yearEl.innerHTML = yearHtml;

  // Determine initial selected date
  let d = 1, m = 1, y = currentBEYear;
  if (defaultDate instanceof Date) {
    d = defaultDate.getDate();
    m = defaultDate.getMonth() + 1;
    y = ThaiDateUtil.getBuddhistYear(defaultDate);
  } else if (typeof defaultDate === 'string' && defaultDate.includes('/')) {
    const parts = defaultDate.split('/');
    if (parts.length === 3) {
      d = parseInt(parts[0], 10) || 1;
      m = parseInt(parts[1], 10) || 1;
      y = parseInt(parts[2], 10) || currentBEYear;
    }
  }

  dayEl.value = String(d);
  monthEl.value = String(m);
  yearEl.value = String(y);
}

function getDateStringFromDropdowns(dayId, monthId, yearId) {
  const d = document.getElementById(dayId)?.value;
  const m = document.getElementById(monthId)?.value;
  const y = document.getElementById(yearId)?.value;
  if (!d || !m || !y) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/* ==========================================================================
   MODULE: ทะเบียนหนังสือส่ง (Outbound Documents)
   ========================================================================== */
function initOutboundDate() {
  const el = document.getElementById('outboundDate');
  if (el && !el.value) {
    el.value = ThaiDateUtil.formatThaiDateShort(new Date());
  }
}
function initOutboundDateDropdowns() {
  initOutboundDate();
}

function handleOutboundFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    AppState.selectedOutboundFile = {
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      dataUrl: ev.target.result
    };
    const nameEl = document.getElementById('outboundFileName');
    if (nameEl) {
      nameEl.innerHTML = `<strong style="color: #2563eb;"><i class="fa-solid fa-file-circle-check text-primary"></i> ${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    }
    showToast(`แนบไฟล์: ${file.name} เรียบร้อย`, 'info');
  };
  reader.readAsDataURL(file);
}

function resetOutboundForm() {
  const form = document.getElementById('outboundForm');
  if (form) form.reset();
  AppState.selectedOutboundFile = null;
  const nameEl = document.getElementById('outboundFileName');
  if (nameEl) {
    nameEl.textContent = 'คลิกหรือลากไฟล์มาวางที่นี่ (PDF, JPG, PNG)';
  }
  const fromEl = document.getElementById('outboundFrom');
  if (fromEl) fromEl.value = 'ผู้อำนวยการโรงเรียนบ้านสันดาบ';
  initOutboundDate();
}

function saveOutboundDocument(e) {
  if (e) e.preventDefault();

  const outboundNo = (document.getElementById('outboundNo')?.value || '').trim();
  const date = (document.getElementById('outboundDate')?.value || '').trim();
  const from = (document.getElementById('outboundFrom')?.value || '').trim();
  const to = (document.getElementById('outboundTo')?.value || '').trim();
  const title = (document.getElementById('outboundTitle')?.value || '').trim();

  if (!outboundNo) {
    showToast('กรุณากรอกเลขหนังสือส่ง', 'warning');
    document.getElementById('outboundNo')?.focus();
    return;
  }
  if (!date) {
    showToast('กรุณากรอก วัน/เดือน/ปี ที่ลงวันที่', 'warning');
    document.getElementById('outboundDate')?.focus();
    return;
  }
  if (!from) {
    showToast('กรุณากรอกข้อมูล จาก (ผู้ส่ง)', 'warning');
    document.getElementById('outboundFrom')?.focus();
    return;
  }
  if (!to) {
    showToast('กรุณากรอกข้อมูล ถึง (ผู้รับ)', 'warning');
    document.getElementById('outboundTo')?.focus();
    return;
  }
  if (!title) {
    showToast('กรุณากรอกเรื่องหนังสือส่ง', 'warning');
    document.getElementById('outboundTitle')?.focus();
    return;
  }

  const record = {
    id: 'out_' + Date.now(),
    outboundNo,
    date,
    from,
    to,
    title,
    fileName: AppState.selectedOutboundFile ? AppState.selectedOutboundFile.name : `หนังสือส่ง_${outboundNo.replace(/[\/\\]/g, '_')}.pdf`,
    fileType: AppState.selectedOutboundFile ? AppState.selectedOutboundFile.type : 'application/pdf',
    fileDataUrl: AppState.selectedOutboundFile ? AppState.selectedOutboundFile.dataUrl : null,
    createdAt: new Date().toISOString()
  };

  AppState.outboundRecords.unshift(record);
  saveOutboundRecordsToStorage();
  syncToGasIfAvailable('saveOutboundRecord', record);
  renderOutboundTable();
  updateKpiStats();
  resetOutboundForm();
  showToast(`บันทึกทะเบียนหนังสือส่งเลขที่ "${outboundNo}" เรียบร้อยแล้ว`, 'success');
}

function renderOutboundTable() {
  const tbody = document.getElementById('outboundTableBody');
  if (!tbody) return;

  const search = (document.getElementById('outboundSearchInput')?.value || '').toLowerCase().trim();
  let list = AppState.outboundRecords || [];

  if (search) {
    list = list.filter(r =>
      (r.outboundNo && r.outboundNo.toLowerCase().includes(search)) ||
      (r.title && r.title.toLowerCase().includes(search)) ||
      (r.to && r.to.toLowerCase().includes(search)) ||
      (r.from && r.from.toLowerCase().includes(search))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">
          <i class="fa-solid fa-paper-plane" style="font-size: 26px; margin-bottom: 6px; display: block; opacity: 0.4;"></i>
          ${search ? 'ไม่พบข้อมูลหนังสือส่งที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการทะเบียนหนังสือส่ง'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((r, i) => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${i + 1}</td>
      <td style="font-weight: 600; color: #1d4ed8;">${escapeHtml(r.outboundNo)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.from)}</td>
      <td>${escapeHtml(r.to)}</td>
      <td><div style="font-weight: 500;">${escapeHtml(r.title)}</div></td>
      <td style="text-align: center;">
        <div class="action-buttons-group">
          <button type="button" class="btn-download-sm" onclick="downloadOutboundRecord('${r.id}')" title="ดาวน์โหลดไฟล์แนบ">
            <i class="fa-solid fa-download"></i> ดาวน์โหลด
          </button>
          <button type="button" class="btn-edit-sm" onclick="openEditOutboundModal('${r.id}')" title="แก้ไขข้อมูล">
            <i class="fa-solid fa-pen-to-square"></i> แก้ไข
          </button>
          <button type="button" class="btn-danger-sm" onclick="deleteOutboundRecord('${r.id}')" title="ลบข้อมูล">
            <i class="fa-solid fa-trash-can"></i> ลบ
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function downloadOutboundRecord(id) {
  const r = AppState.outboundRecords.find(x => x.id === id);
  if (!r) return;

  if (r.fileDataUrl) {
    downloadFile(r.fileDataUrl, r.fileName || `หนังสือส่ง_${r.outboundNo.replace(/[\/\\]/g, '-')}.pdf`);
    showToast(`กำลังดาวน์โหลดไฟล์: ${r.fileName}`, 'success');
  } else {
    // Generate text/pdf voucher for mock records
    generateAndDownloadDummyFile(
      r.fileName || `หนังสือส่ง_${r.outboundNo.replace(/[\/\\]/g, '_')}.txt`,
      `============================================================\nทะเบียนหนังสือส่ง - โรงเรียนบ้านสันดาบ\n============================================================\nเลขหนังสือส่ง: ${r.outboundNo}\nลงวันที่: ${r.date}\nจาก: ${r.from}\nถึง: ${r.to}\nเรื่อง: ${r.title}\nวันที่บันทึกระบบ: ${r.createdAt || '-'}\n============================================================\nระบบสารบรรณอิเล็กทรอนิกส์ โรงเรียนบ้านสันดาบ สพป.สมุทรสาคร`
    );
    showToast(`ดาวน์โหลดเอกสารหนังสือส่ง ${r.outboundNo}`, 'success');
  }
}

function openEditOutboundModal(id) {
  const r = AppState.outboundRecords.find(x => x.id === id);
  if (!r) return;

  document.getElementById('editOutboundId').value = r.id;
  document.getElementById('editOutboundNo').value = r.outboundNo;
  document.getElementById('editOutboundFrom').value = r.from;
  document.getElementById('editOutboundTo').value = r.to;
  document.getElementById('editOutboundTitle').value = r.title;
  const dateEl = document.getElementById('editOutboundDate');
  if (dateEl) dateEl.value = r.date || '';
  openModal('editOutboundModal');
}

function handleSaveEditOutbound() {
  const id = document.getElementById('editOutboundId')?.value;
  const r = AppState.outboundRecords.find(x => x.id === id);
  if (!r) return;

  const no = (document.getElementById('editOutboundNo')?.value || '').trim();
  const date = (document.getElementById('editOutboundDate')?.value || '').trim();
  const from = (document.getElementById('editOutboundFrom')?.value || '').trim();
  const to = (document.getElementById('editOutboundTo')?.value || '').trim();
  const title = (document.getElementById('editOutboundTitle')?.value || '').trim();
  const fileInput = document.getElementById('editOutboundFileInput');

  if (!no || !date || !from || !to || !title) {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    return;
  }

  r.outboundNo = no;
  r.date = date;
  r.from = from;
  r.to = to;
  r.title = title;

  if (fileInput?.files?.[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      r.fileName = file.name;
      r.fileType = file.type || 'application/pdf';
      r.fileDataUrl = ev.target.result;
      saveOutboundRecordsToStorage();
      renderOutboundTable();
    };
    reader.readAsDataURL(file);
  } else {
    saveOutboundRecordsToStorage();
    renderOutboundTable();
  }

  closeModal('editOutboundModal');
  showToast('แก้ไขข้อมูลหนังสือส่งเรียบร้อยแล้ว', 'success');
}

function deleteOutboundRecord(id) {
  const r = AppState.outboundRecords.find(x => x.id === id);
  if (!r) return;

  if (confirm(`คุณต้องการลบหนังสือส่งเลขที่ "${r.outboundNo}" ใช่หรือไม่?`)) {
    AppState.outboundRecords = AppState.outboundRecords.filter(x => x.id !== id);
    saveOutboundRecordsToStorage();
    syncToGasIfAvailable('deleteOutboundRecord', { id });
    renderOutboundTable();
    updateKpiStats();
    showToast(`ลบหนังสือส่งเลขที่ ${r.outboundNo} เรียบร้อย`, 'info');
  }
}

/* ==========================================================================
   MODULE: หนังสือคำสั่ง (Directives & Orders)
   ========================================================================== */
function initOrderDateDropdowns() {
  populateDateDropdowns('orderDay', 'orderMonth', 'orderYear', new Date());
}

function updateLatestOrderNoDisplay() {
  const hintEl = document.getElementById('latestOrderNoDisplay');
  const inputEl = document.getElementById('orderNo');
  let latest = '-';
  if (AppState.orderRecords && AppState.orderRecords.length > 0) {
    latest = AppState.orderRecords[0].orderNo || '-';
  }
  if (hintEl) hintEl.textContent = latest;
  if (inputEl) {
    inputEl.placeholder = latest !== '-' ? `เลขล่าสุด: ${latest}` : 'กรอกตัวเลขคำสั่ง (เช่น 15/2569)...';
  }
}

function applyNextOrderNo() {
  const inputEl = document.getElementById('orderNo');
  if (!inputEl) return;
  const currentBEYear = ThaiDateUtil.getBuddhistYear();
  let nextSeq = 1;

  if (AppState.orderRecords && AppState.orderRecords.length > 0) {
    const latest = AppState.orderRecords[0].orderNo;
    const match = String(latest).match(/^(\d+)/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  inputEl.value = `${nextSeq}/${currentBEYear}`;
  inputEl.focus();
}

function handleOrderFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    AppState.selectedOrderFile = {
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      dataUrl: ev.target.result
    };
    const nameEl = document.getElementById('orderFileName');
    if (nameEl) {
      nameEl.innerHTML = `<strong style="color: #059669;"><i class="fa-solid fa-file-circle-check text-success"></i> ${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    }
    showToast(`แนบไฟล์คำสั่ง: ${file.name} เรียบร้อย`, 'info');
  };
  reader.readAsDataURL(file);
}

function initOrderDate() {
  const el = document.getElementById('orderDate');
  if (el && !el.value) {
    el.value = ThaiDateUtil.formatThaiDateShort(new Date());
  }
}
function initOrderDateDropdowns() {
  initOrderDate();
}

function resetOrderForm() {
  const form = document.getElementById('orderForm');
  if (form) form.reset();
  AppState.selectedOrderFile = null;
  const nameEl = document.getElementById('orderFileName');
  if (nameEl) {
    nameEl.textContent = 'คลิกหรือลากไฟล์คำสั่งมาวางที่นี่ (PDF, JPG, PNG)';
  }
  initOrderDate();
  updateLatestOrderNoDisplay();
}

function saveOrderDocument(e) {
  if (e) e.preventDefault();

  const orderNo = (document.getElementById('orderNo')?.value || '').trim();
  const title = (document.getElementById('orderTitle')?.value || '').trim();
  const date = (document.getElementById('orderDate')?.value || '').trim();
  const assignedDuty = (document.getElementById('orderAssignedDuty')?.value || '').trim();

  if (!orderNo) {
    showToast('กรุณากรอกที่คำสั่ง', 'warning');
    document.getElementById('orderNo')?.focus();
    return;
  }
  if (!date) {
    showToast('กรุณากรอก วัน/เดือน/ปี ที่ลงคำสั่ง', 'warning');
    document.getElementById('orderDate')?.focus();
    return;
  }
  if (!title) {
    showToast('กรุณากรอกเรื่องคำสั่ง', 'warning');
    document.getElementById('orderTitle')?.focus();
    return;
  }
  if (!assignedDuty) {
    showToast('กรุณากรอกหน้าที่ที่ได้รับมอบหมาย', 'warning');
    document.getElementById('orderAssignedDuty')?.focus();
    return;
  }

  const record = {
    id: 'ord_' + Date.now(),
    orderNo,
    title,
    date,
    assignedDuty,
    fileName: AppState.selectedOrderFile ? AppState.selectedOrderFile.name : `คำสั่งที่_${orderNo.replace(/[\/\\]/g, '_')}.pdf`,
    fileType: AppState.selectedOrderFile ? AppState.selectedOrderFile.type : 'application/pdf',
    fileDataUrl: AppState.selectedOrderFile ? AppState.selectedOrderFile.dataUrl : null,
    createdAt: new Date().toISOString()
  };

  AppState.orderRecords.unshift(record);
  saveOrderRecordsToStorage();
  syncToGasIfAvailable('saveOrderRecord', record);
  renderOrderTable();
  updateLatestOrderNoDisplay();
  updateKpiStats();
  resetOrderForm();
  showToast(`บันทึกคำสั่งที่ "${orderNo}" เรียบร้อยแล้ว`, 'success');
}

function renderOrderTable() {
  const tbody = document.getElementById('orderTableBody');
  if (!tbody) return;

  const search = (document.getElementById('orderSearchInput')?.value || '').toLowerCase().trim();
  let list = AppState.orderRecords || [];

  if (search) {
    list = list.filter(r =>
      (r.orderNo && r.orderNo.toLowerCase().includes(search)) ||
      (r.title && r.title.toLowerCase().includes(search)) ||
      (r.assignedDuty && r.assignedDuty.toLowerCase().includes(search))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">
          <i class="fa-solid fa-scroll" style="font-size: 26px; margin-bottom: 6px; display: block; opacity: 0.4;"></i>
          ${search ? 'ไม่พบข้อมูลคำสั่งที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการหนังสือคำสั่ง'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((r, i) => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${i + 1}</td>
      <td style="font-weight: 600; color: #059669;">${escapeHtml(r.orderNo)}</td>
      <td><div style="font-weight: 500;">${escapeHtml(r.title)}</div></td>
      <td>${escapeHtml(r.date)}</td>
      <td><div style="color: #334155; font-size: 13px;">${escapeHtml(r.assignedDuty)}</div></td>
      <td style="text-align: center;">
        <span class="file-preview-pill" style="font-size: 11px; padding: 2px 8px;" title="${escapeHtml(r.fileName || 'ไฟล์คำสั่ง')}">
          <i class="fa-solid fa-paperclip"></i> ${escapeHtml(r.fileName ? (r.fileName.length > 14 ? r.fileName.substring(0, 12) + '...' : r.fileName) : 'แนบไฟล์')}
        </span>
      </td>
      <td style="text-align: center;">
        <div class="action-buttons-group">
          <button type="button" class="btn-download-sm" onclick="downloadOrderRecord('${r.id}')" title="ดาวน์โหลดไฟล์คำสั่ง">
            <i class="fa-solid fa-download"></i> ดาวน์โหลด
          </button>
          <button type="button" class="btn-edit-sm" onclick="openEditOrderModal('${r.id}')" title="แก้ไขข้อมูล">
            <i class="fa-solid fa-pen-to-square"></i> แก้ไข
          </button>
          <button type="button" class="btn-danger-sm" onclick="deleteOrderRecord('${r.id}')" title="ลบข้อมูล">
            <i class="fa-solid fa-trash-can"></i> ลบ
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function downloadOrderRecord(id) {
  const r = AppState.orderRecords.find(x => x.id === id);
  if (!r) return;

  if (r.fileDataUrl) {
    downloadFile(r.fileDataUrl, r.fileName || `คำสั่งที่_${r.orderNo.replace(/[\/\\]/g, '-')}.pdf`);
    showToast(`กำลังดาวน์โหลดไฟล์คำสั่ง: ${r.fileName}`, 'success');
  } else {
    // Generate text/pdf voucher for mock records
    generateAndDownloadDummyFile(
      r.fileName || `คำสั่งที่_${r.orderNo.replace(/[\/\\]/g, '_')}.txt`,
      `============================================================\nทะเบียนหนังสือคำสั่ง - โรงเรียนบ้านสันดาบ\n============================================================\nคำสั่งที่: ${r.orderNo}\nเรื่อง: ${r.title}\nลงวันที่: ${r.date}\nหน้าที่ที่ได้รับมอบหมาย: ${r.assignedDuty}\nวันที่บันทึกระบบ: ${r.createdAt || '-'}\n============================================================\nโรงเรียนบ้านสันดาบ สพป.สมุทรสาคร`
    );
    showToast(`ดาวน์โหลดเอกสารคำสั่ง ${r.orderNo}`, 'success');
  }
}

function openEditOrderModal(id) {
  const r = AppState.orderRecords.find(x => x.id === id);
  if (!r) return;

  document.getElementById('editOrderId').value = r.id;
  document.getElementById('editOrderNo').value = r.orderNo;
  document.getElementById('editOrderTitle').value = r.title;
  document.getElementById('editOrderAssignedDuty').value = r.assignedDuty;
  const dateEl = document.getElementById('editOrderDate');
  if (dateEl) dateEl.value = r.date || '';
  openModal('editOrderModal');
}

function handleSaveEditOrder() {
  const id = document.getElementById('editOrderId')?.value;
  const r = AppState.orderRecords.find(x => x.id === id);
  if (!r) return;

  const no = (document.getElementById('editOrderNo')?.value || '').trim();
  const title = (document.getElementById('editOrderTitle')?.value || '').trim();
  const date = (document.getElementById('editOrderDate')?.value || '').trim();
  const duty = (document.getElementById('editOrderAssignedDuty')?.value || '').trim();
  const fileInput = document.getElementById('editOrderFileInput');

  if (!no || !title || !date || !duty) {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    return;
  }

  r.orderNo = no;
  r.title = title;
  r.date = date;
  r.assignedDuty = duty;

  if (fileInput?.files?.[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      r.fileName = file.name;
      r.fileType = file.type || 'application/pdf';
      r.fileDataUrl = ev.target.result;
      saveOrderRecordsToStorage();
      renderOrderTable();
      updateLatestOrderNoDisplay();
    };
    reader.readAsDataURL(file);
  } else {
    saveOrderRecordsToStorage();
    renderOrderTable();
    updateLatestOrderNoDisplay();
  }

  closeModal('editOrderModal');
  showToast('แก้ไขข้อมูลหนังสือคำสั่งเรียบร้อยแล้ว', 'success');
}

function deleteOrderRecord(id) {
  const r = AppState.orderRecords.find(x => x.id === id);
  if (!r) return;

  if (confirm(`คุณต้องการลบหนังสือคำสั่งที่ "${r.orderNo}" ใช่หรือไม่?`)) {
    AppState.orderRecords = AppState.orderRecords.filter(x => x.id !== id);
    saveOrderRecordsToStorage();
    syncToGasIfAvailable('deleteOrderRecord', { id });
    renderOrderTable();
    updateLatestOrderNoDisplay();
    updateKpiStats();
    showToast(`ลบคำสั่งที่ ${r.orderNo} เรียบร้อย`, 'info');
  }
}

/* ==========================================================================
   Mock File Downloader & LocalStorage Persistence
   ========================================================================== */
function generateAndDownloadDummyFile(fileName, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function loadStoredOutboundAndOrderRecords() {
  try {
    const idbOut = await StorageDB.get('banSandap_outboundRecords');
    AppState.outboundRecords = Array.isArray(idbOut) ? idbOut : [];
  } catch (e) {
    AppState.outboundRecords = [];
  }

  try {
    const idbOrd = await StorageDB.get('banSandap_orderRecords');
    AppState.orderRecords = Array.isArray(idbOrd) ? idbOrd : [];
  } catch (e) {
    AppState.orderRecords = [];
  }

  renderOutboundTable();
  renderOrderTable();
  updateOutboundStats();
  updateOrderStats();

  // ซิงค์ตรงกับฐานข้อมูล Google Sheet
  await syncOutboundAndOrderFromDatabase();
}

async function syncOutboundAndOrderFromDatabase() {
  // 1. ซิงค์ข้อมูลหนังสือส่งจากชีต OutboundRecords
  try {
    let outRecords = null;
    if (AppState.gasWebAppUrl) {
      try {
        const gasUrl = AppState.gasWebAppUrl + (AppState.gasWebAppUrl.includes('?') ? '&' : '?') + 'action=getOutboundRecords&t=' + Date.now();
        const res = await fetch(gasUrl, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            outRecords = json.data;
          }
        }
      } catch (eGas) {}
    }
    if (outRecords === null && AppState.sheetInboundId) {
      const gvizOutUrl = `https://docs.google.com/spreadsheets/d/${AppState.sheetInboundId}/gviz/tq?tqx=out:json&sheet=OutboundRecords&t=${Date.now()}`;
      const res = await fetch(gvizOutUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const gviz = JSON.parse(jsonStr);
        const rows = gviz.table ? (gviz.table.rows || []) : [];
        const records = [];
        rows.forEach((r, idx) => {
          const getVal = (colIdx) => {
            const c = r.c ? r.c[colIdx] : null;
            if (!c) return '';
            if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return String(c.f).trim();
            if (c.v !== null && c.v !== undefined) {
              const vStr = String(c.v);
              if (vStr.startsWith('Date(')) {
                const parts = vStr.replace(/[^\d,]/g, '').split(',').map(Number);
                if (parts.length >= 3) {
                  const y = parts[0];
                  const m = String(parts[1] + 1).padStart(2, '0');
                  const d = String(parts[2]).padStart(2, '0');
                  return `${d}/${m}/${y}`;
                }
              }
              return vStr.trim();
            }
            return '';
          };
          const id = String(getVal(0) || '').trim();
          const outboundNo = String(getVal(2) || '').trim();
          if (id === 'ID' && (outboundNo === 'เลขหนังสือส่ง' || getVal(1) === 'ลำดับ')) return;
          if (!id && !outboundNo && !getVal(6)) return;

          records.push({
            id: id || ('out_' + (idx + 1)),
            orderNo: Number(getVal(1)) || (idx + 1),
            outboundNo: outboundNo,
            date: getVal(3) || '',
            from: getVal(4) || '',
            to: getVal(5) || '',
            title: getVal(6) || '',
            fileName: getVal(7) || '',
            driveFileUrl: getVal(8) || '',
            createdAt: getVal(9) || ''
          });
        });
        outRecords = records;
      }
    }
    if (Array.isArray(outRecords)) {
      AppState.outboundRecords = outRecords;
      saveOutboundRecordsToStorage();
    }
  } catch (errOut) {
    console.warn('Outbound sync failed:', errOut);
  }

  // 2. ซิงค์ข้อมูลคำสั่งจากชีต OrderRecords
  try {
    let ordRecords = null;
    if (AppState.gasWebAppUrl) {
      try {
        const gasUrl = AppState.gasWebAppUrl + (AppState.gasWebAppUrl.includes('?') ? '&' : '?') + 'action=getOrderRecords&t=' + Date.now();
        const res = await fetch(gasUrl, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            ordRecords = json.data;
          }
        }
      } catch (eGas) {}
    }
    if (ordRecords === null && AppState.sheetInboundId) {
      const gvizOrdUrl = `https://docs.google.com/spreadsheets/d/${AppState.sheetInboundId}/gviz/tq?tqx=out:json&sheet=OrderRecords&t=${Date.now()}`;
      const res = await fetch(gvizOrdUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const gviz = JSON.parse(jsonStr);
        const rows = gviz.table ? (gviz.table.rows || []) : [];
        const records = [];
        rows.forEach((r, idx) => {
          const getVal = (colIdx) => {
            const c = r.c ? r.c[colIdx] : null;
            if (!c) return '';
            if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return String(c.f).trim();
            if (c.v !== null && c.v !== undefined) {
              const vStr = String(c.v);
              if (vStr.startsWith('Date(')) {
                const parts = vStr.replace(/[^\d,]/g, '').split(',').map(Number);
                if (parts.length >= 3) {
                  const y = parts[0];
                  const m = String(parts[1] + 1).padStart(2, '0');
                  const d = String(parts[2]).padStart(2, '0');
                  return `${d}/${m}/${y}`;
                }
              }
              return vStr.trim();
            }
            return '';
          };
          const id = String(getVal(0) || '').trim();
          const orderNo = String(getVal(2) || '').trim();
          if (id === 'ID' && (orderNo === 'ที่คำสั่ง' || getVal(1) === 'ลำดับ')) return;
          if (!id && !orderNo && !getVal(3)) return;

          records.push({
            id: id || ('ord_' + (idx + 1)),
            seqNo: Number(getVal(1)) || (idx + 1),
            orderNo: orderNo,
            title: getVal(3) || '',
            date: getVal(4) || '',
            assignedDuty: getVal(5) || '',
            fileName: getVal(6) || '',
            driveFileUrl: getVal(7) || '',
            createdAt: getVal(8) || ''
          });
        });
        ordRecords = records;
      }
    }
    if (Array.isArray(ordRecords)) {
      AppState.orderRecords = ordRecords;
      saveOrderRecordsToStorage();
    }
  } catch (errOrd) {
    console.warn('Order sync failed:', errOrd);
  }

  renderOutboundTable();
  renderOrderTable();
  updateOutboundStats();
  updateOrderStats();
}

function saveOutboundRecordsToStorage() {
  StorageDB.set('banSandap_outboundRecords', AppState.outboundRecords);
  try {
    localStorage.setItem('banSandap_outboundRecords', JSON.stringify(AppState.outboundRecords));
  } catch (e) {
    try {
      const safe = AppState.outboundRecords.map(r => {
        const c = { ...r };
        if (c.fileDataUrl && c.fileDataUrl.length > 50000) c.fileDataUrl = '';
        return c;
      });
      localStorage.setItem('banSandap_outboundRecords', JSON.stringify(safe));
    } catch (e2) {}
  }
}

function saveOrderRecordsToStorage() {
  StorageDB.set('banSandap_orderRecords', AppState.orderRecords);
  try {
    localStorage.setItem('banSandap_orderRecords', JSON.stringify(AppState.orderRecords));
  } catch (e) {
    try {
      const safe = AppState.orderRecords.map(r => {
        const c = { ...r };
        if (c.fileDataUrl && c.fileDataUrl.length > 50000) c.fileDataUrl = '';
        return c;
      });
      localStorage.setItem('banSandap_orderRecords', JSON.stringify(safe));
    } catch (e2) {}
  }
}
