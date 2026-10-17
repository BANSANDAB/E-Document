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
  currentDocId: null, // Active document being stamped
  activeTab: 'receive', // 'receive' | 'pending' | 'search' | 'settings'
  showAllInbound: false, // Default show 5 items
  showAllPending: false, // Default show 5 items

  // Main Section Navigation (Left Sidebar)
  currentMainSection: 'receive', // 'receive' | 'outbound' | 'order'
  outboundRecords: [],
  orderRecords: [],
  selectedOutboundFile: null,
  selectedOrderFile: null,

  // Signature Pads & Scaling
  sigPadProposal: null,
  sigPadDirector: null,
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
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
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

  // Set today's date in Buddhist Era for the date input
  const dateInput = document.getElementById('receiveDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = ThaiDateUtil.formatThaiDateShort(new Date());
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

function populateTeacherDropdowns() {
  const dropdown = document.getElementById('directorAssignee');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">-- เลือกผู้รับผิดชอบ --</option>';

  // Option: ครูทุกคน
  const optAll = document.createElement('option');
  optAll.value = 'ครูทุกคน';
  optAll.textContent = '⭐ ครูทุกคน (All Teachers)';
  optAll.style.fontWeight = 'bold';
  optAll.style.color = '#2563eb';
  dropdown.appendChild(optAll);

  // Teachers from Google Sheet
  AppState.teachers.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    dropdown.appendChild(opt);
  });
}

/* ==========================================================================
   File Dropzone & Upload Handler
   ========================================================================== */
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });
}

async function handleSelectedFile(file) {
  const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (!validTypes.includes(file.type)) {
    showToast('กรุณาเลือกไฟล์ .pdf หรือไฟล์รูปภาพ (.jpg, .png)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    let bytes = null;

    if (file.type === 'application/pdf') {
      const arrayBufferReader = new FileReader();
      arrayBufferReader.onload = () => {
        AppState.selectedFile = {
          name: file.name,
          type: file.type,
          dataUrl,
          bytes: new Uint8Array(arrayBufferReader.result)
        };
        updateFilePreviewUI();
      };
      arrayBufferReader.readAsArrayBuffer(file);
    } else {
      AppState.selectedFile = {
        name: file.name,
        type: file.type,
        dataUrl,
        bytes: null
      };
      updateFilePreviewUI();
    }
  };
  reader.readAsDataURL(file);
}

function updateFilePreviewUI() {
  const previewDiv = document.getElementById('selectedFilePreview');
  if (!previewDiv) return;

  if (AppState.selectedFile) {
    const isPdf = AppState.selectedFile.type === 'application/pdf';
    previewDiv.innerHTML = `
      <div class="file-preview-pill">
        <i class="fa-solid ${isPdf ? 'fa-file-pdf text-danger' : 'fa-file-image text-primary'}"></i>
        <span><strong>${escapeHtml(AppState.selectedFile.name)}</strong></span>
        <button type="button" class="btn-outline btn-sm" onclick="clearSelectedFile()" style="margin-left: 8px; border:none; color:#ef4444;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  } else {
    previewDiv.innerHTML = '';
  }
}

function clearSelectedFile() {
  AppState.selectedFile = null;
  const fileInput = document.getElementById('docFileInput');
  if (fileInput) fileInput.value = '';
  updateFilePreviewUI();
}

/* ==========================================================================
   Helper: Create Sample Document
   ========================================================================== */
async function generateSampleDoc() {
  showToast('กำลังสร้างตัวอย่างหนังสือราชการจำลอง...', 'info');
  try {
    const pdfBytes = await StampEngine.createSampleDocumentPdf();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const reader = new FileReader();
    reader.onload = () => {
      AppState.selectedFile = {
        name: `หนังสือราชการ_ตัวอย่าง_${Date.now().toString().slice(-4)}.pdf`,
        type: 'application/pdf',
        dataUrl: reader.result,
        bytes: pdfBytes
      };
      updateFilePreviewUI();
      showToast('สร้างตัวอย่างหนังสือราชการสำเร็จ พร้อมลงรับ!', 'success');
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    console.error(err);
    showToast('เกิดข้อผิดพลาดในการสร้างเอกสารตัวอย่าง', 'danger');
  }
}

/* ==========================================================================
   Latest Book Number Placeholder & Calculation
   ========================================================================== */
function updateLatestBookNoPlaceholder() {
  const bookNoInput = document.getElementById('bookNo');
  if (!bookNoInput) return;

  let latestNo = '';
  const currentBEYear = ThaiDateUtil.getBuddhistYear();

  if (AppState.records && AppState.records.length > 0) {
    // Get the first record (most recent)
    latestNo = AppState.records[0].bookNo;
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

  if (AppState.records && AppState.records.length > 0) {
    const latest = AppState.records[0].bookNo;
    const match = latest.match(/^(\d+)/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  const padded = String(nextSeq).padStart(4, '0');
  bookNoInput.value = `${padded}/${currentBEYear}`;
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
    container.innerHTML = `<img src="${stamp1.dataUrl}" alt="ตัวอย่างตราปั้มหนังสือรับ" style="max-height: 82px; width: auto; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); background: #ffffff;">`;
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

  // If no file selected, offer auto sample
  if (!AppState.selectedFile) {
    await generateSampleDoc();
  }

  // Set loading state
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังประทับตราและบันทึก...';
  }

  try {
    // 1. Render Stamp 1 Canvas
    const stamp1 = await StampEngine.renderStamp1Canvas({
      bookNo,
      receiveDate,
      receiveTime
    });

    let stampedDataUrl = null;
    let stampedBytes = null;

    // 2. Stamp immediately onto document
    if (AppState.selectedFile.type === 'application/pdf') {
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: AppState.selectedFile.bytes,
        stamp1Canvas: stamp1.canvas
      });

      stampedBytes = stampedPdfBytes;
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      stampedDataUrl = await blobToDataUrl(blob);
    } else {
      // Image stamping
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: AppState.selectedFile.dataUrl,
        stamp1Canvas: stamp1.canvas
      });
      stampedDataUrl = stampedImg.dataUrl;
    }

    // 3. Create document record object
    const newRecord = {
      id: 'doc_' + Date.now(),
      orderNo: AppState.records.length + 1,
      bookNo,
      receiveDate,
      receiveTime,
      title,
      fileName: AppState.selectedFile.name,
      fileType: AppState.selectedFile.type,
      originalDataUrl: AppState.selectedFile.dataUrl,
      stampedDataUrl,
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
    clearSelectedFile();
    updateLatestBookNoPlaceholder();

    renderAllTables();
    updateKpiStats();

    showToast(`ลงรับหนังสือเลขที่ ${bookNo} สำเร็จ! ตราประทับถูกพิมพ์ลงบนไฟล์แนบเรียบร้อย`, 'success');

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
function reindexRecords() {
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

  // Show only 5 items by default, or all items if toggled
  const limit = 5;
  const displayRecords = AppState.showAllInbound ? AppState.records : AppState.records.slice(0, limit);

  tbody.innerHTML = displayRecords.map((r, i) => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${i + 1}</td>
      <td style="font-weight: 600; color: #2563eb;">${escapeHtml(r.bookNo)}</td>
      <td>
        <div>${escapeHtml(r.receiveDate)}</div>
        <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(r.receiveTime)}</div>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewDocument('${r.id}')" title="เปิดดูเอกสารประทับตรา" style="padding: 3px 8px; font-size: 12px;">
          <i class="fa-solid fa-file-signature text-primary"></i> ${escapeHtml(r.fileName || 'ดูไฟล์')}
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
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> ย่อลง (แสดง 5 รายการล่าสุด)`;
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

  const limit = 5;
  const displayRecords = AppState.showAllPending ? AppState.records : AppState.records.slice(0, limit);

  tbody.innerHTML = displayRecords.map((r, i) => {
    const isCompleted = r.status === 'เสร็จสิ้น';
    const isReadyForDirector = r.proposalData !== null;

    return `
      <tr>
        <td style="text-align: center; font-weight: 600;">${i + 1}</td>
        <td style="font-weight: 600; color: #2563eb;">${escapeHtml(r.bookNo)}</td>
        <td>${escapeHtml(r.receiveDate)}</td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(r.title)}</div>
        </td>
        <td>
          ${isCompleted ? `
            <span class="responsible-teacher-badge">
              <i class="fa-solid fa-user-check"></i> ${escapeHtml(r.assignee)}
            </span>
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

          <!-- ปุ่ม ดูเอกสาร -->
          <button class="btn btn-outline btn-sm"
                  onclick="viewDocument('${r.id}')"
                  title="ดูเอกสารประทับตรา"
                  style="margin-left: 4px;">
            <i class="fa-regular fa-eye"></i>
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
        toggleBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> ย่อลง (แสดง 5 รายการล่าสุด)`;
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
      <td>${escapeHtml(r.receiveDate)}</td>
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

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#002299'; // Deep official blue ink
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
    clear() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      hasDrawn = false;
      if (typeof onChange === 'function') {
        onChange();
      }
    },
    isEmpty() {
      return !hasDrawn;
    },
    toDataUrl() {
      if (!hasDrawn) return null;
      return canvas.toDataURL('image/png');
    },
    loadDataUrl(url, callback) {
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        const padW = Math.max(rect.width - 20, 40);
        const padH = Math.max(rect.height - 20, 30);
        const scale = Math.min(padW / img.width, padH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const drawX = (rect.width - drawW) / 2;
        const drawY = (rect.height - drawH) / 2;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        hasDrawn = true;
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

  if (AppState.sigPadProposal) {
    AppState.sigPadProposal.clear();
    if (data.signatureDataUrl) {
      AppState.sigPadProposal.loadDataUrl(data.signatureDataUrl);
    }
  }

  // Update live preview
  updateProposalStampPreview();

  // Show modal
  openModal('proposalModal');
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
  const signatureDataUrl = AppState.sigPadProposal ? AppState.sigPadProposal.toDataUrl() : null;
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
    const signatureDataUrl = AppState.sigPadProposal ? AppState.sigPadProposal.toDataUrl() : null;
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

    // 2. Re-stamp Document with Stamp 1 and Stamp 2 (Bottom-Left)
    if (doc.fileType === 'application/pdf') {
      const originalBytes = await dataUrlToBytes(doc.originalDataUrl);
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: originalBytes,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2.canvas
      });
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      doc.stampedDataUrl = await blobToDataUrl(blob);
    } else {
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: doc.originalDataUrl,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2.canvas
      });
      doc.stampedDataUrl = stampedImg.dataUrl;
    }

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

// Remove white paper background from uploaded signature images and boost ink to bold deep official blue
function removeImageBackground(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      const width = c.width;
      const height = c.height;

      let minX = width, minY = height, maxX = -1, maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = d[idx];
          const g = d[idx + 1];
          const b = d[idx + 2];
          const a = d[idx + 3];

          // If pixel was already transparent
          if (a < 15) {
            d[idx + 3] = 0;
            continue;
          }

          // Weighted perceived brightness
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

          // Pure or light paper background -> make 100% transparent
          if (brightness >= 215) {
            d[idx + 3] = 0;
          } else {
            // Ink stroke detected: bold, deep official navy blue (RGB: 10, 38, 150)
            let alpha = 255;
            if (brightness > 195) {
              // Smooth soft anti-aliased edge
              alpha = Math.round(255 * ((215 - brightness) / 20));
            }
            d[idx] = 10;      // Deep navy red channel
            d[idx + 1] = 38;  // Deep navy green channel
            d[idx + 2] = 150; // Deep official blue channel
            d[idx + 3] = alpha;

            if (alpha > 40) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Crop tightly to ink bounding box so position stays anchored exactly
      if (maxX >= minX && maxY >= minY) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const pad = 4;
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
        if (AppState.sigPadProposal) {
          AppState.sigPadProposal.loadDataUrl(cleanDataUrl, () => {
            updateProposalStampPreview();
          });
        }
      } else if (type === 'director') {
        if (AppState.sigPadDirector) {
          AppState.sigPadDirector.loadDataUrl(cleanDataUrl, () => {
            updateDirectorStampPreview();
          });
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

  // Assignee dropdown
  populateTeacherDropdowns();
  const assigneeSelect = document.getElementById('directorAssignee');
  if (assigneeSelect) {
    assigneeSelect.value = doc.assignee !== '-' ? doc.assignee : '';
  }

  if (AppState.sigPadDirector) {
    AppState.sigPadDirector.clear();
    if (data.signatureDataUrl) {
      AppState.sigPadDirector.loadDataUrl(data.signatureDataUrl);
    }
  }

  updateDirectorStampPreview();
  openModal('directorModal');
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
  const signatureDataUrl = AppState.sigPadDirector ? AppState.sigPadDirector.toDataUrl() : null;
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

  const assignee = document.getElementById('directorAssignee').value;
  if (!assignee) {
    showToast('กรุณาเลือกผู้รับผิดชอบ (ชื่อครู หรือ ครูทุกคน)', 'warning');
    document.getElementById('directorAssignee').focus();
    return;
  }

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
    const signatureDataUrl = AppState.sigPadDirector ? AppState.sigPadDirector.toDataUrl() : null;
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

    // 2. Composite all stamps onto document
    if (doc.fileType === 'application/pdf') {
      const originalBytes = await dataUrlToBytes(doc.originalDataUrl);
      const stampedPdfBytes = await StampEngine.stampPdfDocument({
        pdfBytes: originalBytes,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2 ? stamp2.canvas : null,
        stamp3Canvas: stamp3.canvas
      });
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      doc.stampedDataUrl = await blobToDataUrl(blob);
    } else {
      const stampedImg = await StampEngine.stampImageDocument({
        imageSource: doc.originalDataUrl,
        stamp1Canvas: stamp1.canvas,
        stamp2Canvas: stamp2 ? stamp2.canvas : null,
        stamp3Canvas: stamp3.canvas
      });
      doc.stampedDataUrl = stampedImg.dataUrl;
    }

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

    showToast(`ประทับตรา "ความเห็น ผอ." และมอบหมายงานให้ ${assignee} เรียบร้อยแล้ว!`, 'success');
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

/* ==========================================================================
   Document Viewer Modal
   ========================================================================== */
function viewDocument(docId) {
  const doc = AppState.records.find(r => r.id === docId);
  if (!doc) return;

  AppState.currentDocId = docId;

  document.getElementById('viewModalDocNo').textContent = doc.bookNo;
  document.getElementById('viewModalDocTitle').textContent = doc.title;

  const viewerContainer = document.getElementById('documentViewerContainer');
  if (!viewerContainer) return;

  const dataUrl = doc.stampedDataUrl || doc.originalDataUrl;

  if (!dataUrl && doc.driveFileUrl) {
    viewerContainer.innerHTML = `
      <div style="text-align:center; padding: 40px;">
        <i class="fa-solid fa-cloud-arrow-down" style="font-size: 52px; color: #0284c7; margin-bottom: 16px;"></i>
        <h4 style="margin-bottom: 8px;">เอกสารจัดเก็บบน Google Drive</h4>
        <p style="color: #64748b; margin-bottom: 24px; font-size: 14px;">ไฟล์เอกสารประทับตราถูกจัดเก็บบน Google Drive เรียบร้อยแล้ว</p>
        <a href="${doc.driveFileUrl}" target="_blank" class="btn btn-primary" style="padding: 10px 20px;">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดดูไฟล์บน Google Drive
        </a>
      </div>
    `;
    const downloadBtn = document.getElementById('btnDownloadDoc');
    if (downloadBtn) {
      downloadBtn.onclick = () => window.open(doc.driveFileUrl, '_blank');
    }
    openModal('documentViewModal');
    return;
  }

  if (doc.fileType === 'application/pdf') {
    viewerContainer.innerHTML = `
      <iframe src="${dataUrl}" style="width:100%; height:550px; border:none; border-radius:8px;"></iframe>
    `;
  } else {
    viewerContainer.innerHTML = `
      <div style="text-align:center; padding:10px; max-height:550px; overflow:auto;">
        <img src="${dataUrl}" style="max-width:100%; height:auto; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.15);">
      </div>
    `;
  }

  // Setup download button
  const downloadBtn = document.getElementById('btnDownloadDoc');
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadFile(dataUrl, `หนังสือรับ_${doc.bookNo.replace(/[\/\\]/g, '-')}_ประทับตรา.${doc.fileType === 'application/pdf' ? 'pdf' : 'png'}`);
  }

  openModal('documentViewModal');
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
  document.getElementById('editReceiveDate').value = doc.receiveDate;
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
   Google Apps Script Sync & Storage
   ========================================================================== */
async function loadStoredRecords() {
  try {
    // 1. Try to load from IndexedDB first (stores complete files and signatures)
    const idbData = await StorageDB.get('inbound_book_records');
    if (Array.isArray(idbData) && idbData.length > 0) {
      AppState.records = idbData;
      console.log('Loaded inbound records from IndexedDB:', idbData.length);
    } else {
      // 2. Fallback to localStorage
      const raw = localStorage.getItem('inbound_book_records');
      if (raw) {
        AppState.records = JSON.parse(raw);
        StorageDB.set('inbound_book_records', AppState.records);
      }
    }
  } catch (e) {
    console.error('Failed to parse stored records', e);
    AppState.records = [];
  }

  renderAllTables();
  updateKpiStats();
  updateLatestBookNoPlaceholder();

  // 3. Sync from Google Sheet in background
  syncInboundRecordsFromGas();
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
        return clone;
      });
      localStorage.setItem('inbound_book_records', JSON.stringify(safeRecords));
    } catch (err2) {
      console.warn('LocalStorage save failed even for trimmed records:', err2);
    }
  }
}

async function syncInboundRecordsFromGas() {
  if (!AppState.gasWebAppUrl) return;

  try {
    const gasUrl = AppState.gasWebAppUrl + (AppState.gasWebAppUrl.includes('?') ? '&' : '?') + 'action=getRecords';
    const res = await fetch(gasUrl);
    const json = await res.json();

    if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
      let changed = false;

      json.data.forEach(sheetRec => {
        if (!sheetRec.bookNo && !sheetRec.id) return;
        // Find existing record by id or bookNo
        let localRec = AppState.records.find(r => 
          (r.id && sheetRec.id && String(r.id) === String(sheetRec.id)) || 
          (r.bookNo && sheetRec.bookNo && String(r.bookNo) === String(sheetRec.bookNo))
        );

        if (localRec) {
          // If status in sheet is more updated (e.g. 'เสร็จสิ้น' or 'รอ ผอ. ลงนาม')
          if (sheetRec.status && localRec.status !== sheetRec.status) {
            localRec.status = sheetRec.status;
            changed = true;
          }
          if (sheetRec.assignee && (!localRec.assignee || localRec.assignee === '-')) {
            localRec.assignee = sheetRec.assignee;
            changed = true;
          }
          if (sheetRec.proposalData && !localRec.proposalData) {
            localRec.proposalData = sheetRec.proposalData;
            if (!localRec.step || localRec.step < 2) localRec.step = 2;
            changed = true;
          }
          if (sheetRec.directorData && !localRec.directorData) {
            localRec.directorData = sheetRec.directorData;
            localRec.step = 3;
            changed = true;
          }
          if (sheetRec.driveFileUrl && !localRec.driveFileUrl) {
            localRec.driveFileUrl = sheetRec.driveFileUrl;
            changed = true;
          }
        } else {
          // Record exists on Google Sheet but not in local storage, add it
          AppState.records.push({
            id: sheetRec.id || ('doc_' + Date.now()),
            orderNo: sheetRec.orderNo || (AppState.records.length + 1),
            bookNo: sheetRec.bookNo,
            receiveDate: sheetRec.receiveDate,
            receiveTime: sheetRec.receiveTime,
            title: sheetRec.title,
            assignee: sheetRec.assignee || '-',
            status: sheetRec.status || 'รอเสนอ ผอ.',
            step: sheetRec.status === 'เสร็จสิ้น' ? 3 : (sheetRec.proposalData ? 2 : 1),
            driveFileUrl: sheetRec.driveFileUrl || '',
            proposalData: sheetRec.proposalData,
            directorData: sheetRec.directorData,
            updatedAt: sheetRec.updatedAt || new Date().toISOString()
          });
          changed = true;
        }
      });

      if (changed) {
        reindexRecords();
        saveRecordsToStorage();
        renderAllTables();
        updateKpiStats();
        updateLatestBookNoPlaceholder();
        console.log('Synchronized records with Google Sheet successfully');
      }
    }
  } catch (err) {
    console.warn('Could not sync records from Google Sheet:', err);
  }
}

async function syncToGasIfAvailable(action, payload) {
  if (!AppState.gasWebAppUrl) {
    console.info('Google Apps Script Web App URL is not set. Data saved to local storage.');
    return;
  }

  try {
    await fetch(AppState.gasWebAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: payload })
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
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    resolve(bytes);
  });
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
    if (Array.isArray(idbOut) && idbOut.length > 0) {
      AppState.outboundRecords = idbOut;
    } else {
      const rawOut = localStorage.getItem('banSandap_outboundRecords');
      if (rawOut) {
        AppState.outboundRecords = JSON.parse(rawOut);
        StorageDB.set('banSandap_outboundRecords', AppState.outboundRecords);
      } else {
        AppState.outboundRecords = [
          {
            id: 'out_1',
            outboundNo: 'ศธ 04135.050/024',
            date: '15/10/2569',
            from: 'โรงเรียนบ้านสันดาบ',
            to: 'ผู้อำนวยการ สพป.สมุทรสาคร',
            title: 'รายงานสรุปผลการดำเนินงานโครงการพัฒนาคุณภาพการศึกษา ภาคเรียนที่ 1',
            fileName: 'รายงานสรุปโครงการ_2569.pdf',
            fileType: 'application/pdf',
            fileDataUrl: null,
            createdAt: new Date().toISOString()
          },
          {
            id: 'out_2',
            outboundNo: 'ศธ 04135.050/023',
            date: '10/10/2569',
            from: 'โรงเรียนบ้านสันดาบ',
            to: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร',
            title: 'ขออนุมัติจัดกิจกรรมค่ายวิชาการยกระดับผลสัมฤทธิ์ทางการเรียน',
            fileName: 'ขออนุมัติจัดกิจกรรมค่ายวิชาการ.pdf',
            fileType: 'application/pdf',
            fileDataUrl: null,
            createdAt: new Date().toISOString()
          }
        ];
        saveOutboundRecordsToStorage();
      }
    }
  } catch (e) {
    AppState.outboundRecords = [];
  }

  try {
    const idbOrd = await StorageDB.get('banSandap_orderRecords');
    if (Array.isArray(idbOrd) && idbOrd.length > 0) {
      AppState.orderRecords = idbOrd;
    } else {
      const rawOrd = localStorage.getItem('banSandap_orderRecords');
      if (rawOrd) {
        AppState.orderRecords = JSON.parse(rawOrd);
        StorageDB.set('banSandap_orderRecords', AppState.orderRecords);
      } else {
        AppState.orderRecords = [
          {
            id: 'ord_1',
            orderNo: '15/2569',
            title: 'แต่งตั้งคณะกรรมการดำเนินการสอบวัดผลปลายภาคเรียนที่ 1 ปีการศึกษา 2569',
            date: '12/10/2569',
            assignedDuty: 'คณะกรรมการฝ่ายอำนวยการและจัดพิมพ์ข้อสอบ',
            fileName: 'คำสั่งที่_15_2569_สอบวัดผล.pdf',
            fileType: 'application/pdf',
            fileDataUrl: null,
            createdAt: new Date().toISOString()
          },
          {
            id: 'ord_2',
            orderNo: '14/2569',
            title: 'แต่งตั้งคณะกรรมการจัดกิจกรรมวันภาษาไทยแห่งชาติ ประจำปี 2569',
            date: '01/08/2569',
            assignedDuty: 'คณะกรรมการฝ่ายกิจกรรมและการประกวด',
            fileName: 'คำสั่งที่_14_2569_วันภาษาไทย.pdf',
            fileType: 'application/pdf',
            fileDataUrl: null,
            createdAt: new Date().toISOString()
          }
        ];
        saveOrderRecordsToStorage();
      }
    }
  } catch (e) {
    AppState.orderRecords = [];
  }
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
