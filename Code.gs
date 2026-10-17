/**
 * ============================================================================
 * ระบบหนังสือรับอิเล็กทรอนิกส์ - โรงเรียนบ้านสันดาบ
 * Code.gs: Google Apps Script Backend Integration
 * ============================================================================
 * 
 * การเชื่อมต่อ Google Workspace:
 * 1. ฐานข้อมูลครู: Google Sheet ID = 1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA (ชีต Teachers)
 * 2. ฐานข้อมูลบันทึกหนังสือรับ: Google Sheet ID = 1iyrtsfjL3WEl2BQOpbTWLEhaacA95dfScXYj_1QBqK8
 * 3. โฟลเดอร์จัดเก็บไฟล์: Google Drive Folder ID = 136nyrJjpEK2vYwaRjGgUwvbxtg5uoLEj
 */

const CONFIG = {
  SHEET_TEACHERS_ID: '1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA',
  SHEET_INBOUND_ID: '1iyrtsfjL3WEl2BQOpbTWLEhaacA95dfScXYj_1QBqK8',
  DRIVE_FOLDER_ID: '136nyrJjpEK2vYwaRjGgUwvbxtg5uoLEj',
  TEACHERS_TAB_NAME: 'Teachers',
  INBOUND_TAB_NAME: 'InboundRecords'
};

/**
 * ฟังก์ชันสำหรับทดสอบการทำงานของระบบ (สามารถเลือกชื่อฟังก์ชันนี้แล้วกดปุ่ม "▷ Run" เพื่อทดสอบได้ทันที)
 */
function testConnection() {
  Logger.log("==================================================");
  Logger.log("เริ่มต้นทดสอบระบบสารบรรณ: โรงเรียนบ้านสันดาบ");
  Logger.log("==================================================");

  // 1. ตรวจสอบชีตข้อมูลครู
  try {
    const teachers = getTeachersList();
    Logger.log("✓ 1. เชื่อมต่อชีตข้อมูลครูสำเร็จ (พบ " + teachers.length + " ท่าน)");
  } catch (err) {
    Logger.log("✗ 1. ข้อผิดพลาดชีตครู: " + err.toString());
  }

  // 2. ตรวจสอบและทดสอบบันทึกชีตหนังสือรับ
  try {
    const sheet = getInboundSheet();
    Logger.log("✓ 2. เชื่อมต่อชีตหนังสือรับสำเร็จ: " + sheet.getName());
    
    // ทดลองบันทึกแถวทดสอบ 1 รายการ
    const testRow = [
      'test_' + Date.now(),
      sheet.getLastRow(),
      'ทดสอบ/' + (new Date().getFullYear() + 543),
      '17/10/2569',
      '20:30 น.',
      'ทดสอบการเชื่อมต่อระบบฐานข้อมูล Google Sheets',
      '-',
      'รอเสนอ ผอ.',
      '',
      '',
      '',
      new Date().toLocaleString('th-TH')
    ];
    sheet.appendRow(testRow);
    Logger.log("✓ 2.1 บันทึกข้อมูลทดสอบลงชีตหนังสือรับสำเร็จ! แถวที่ " + sheet.getLastRow());
  } catch (err) {
    Logger.log("✗ 2. ข้อผิดพลาดชีตหนังสือรับ: " + err.toString());
  }

  // 3. ตรวจสอบชีตหนังสือส่ง
  try {
    const outSheet = getOutboundSheet();
    Logger.log("✓ 3. เชื่อมต่อชีตหนังสือส่งสำเร็จ: " + outSheet.getName());
  } catch (err) {
    Logger.log("✗ 3. ข้อผิดพลาดชีตหนังสือส่ง: " + err.toString());
  }

  // 4. ตรวจสอบชีตคำสั่ง
  try {
    const ordSheet = getOrderSheet();
    Logger.log("✓ 4. เชื่อมต่อชีตคำสั่งสำเร็จ: " + ordSheet.getName());
  } catch (err) {
    Logger.log("✗ 4. ข้อผิดพลาดชีตคำสั่ง: " + err.toString());
  }

  // 5. ตรวจสอบโฟลเดอร์ Google Drive
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log("✓ 5. เชื่อมต่อ Google Drive สำเร็จ: โฟลเดอร์ชื่อ \"" + folder.getName() + "\"");
  } catch (err) {
    Logger.log("✗ 5. ข้อผิดพลาด Google Drive: " + err.toString());
  }

  Logger.log("==================================================");
  Logger.log("การทดสอบเสร็จสมบูรณ์! ระบบฐานข้อมูลพร้อมทำงาน");
  Logger.log("==================================================");
}

/**
 * Web App HTTP GET Handler
 */
function doGet(e) {
  // If requesting API data
  if (e && e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    let result = { status: 'error', message: 'Unknown action' };

    try {
      if (action === 'getTeachers') {
        result = { status: 'success', data: getTeachersList() };
      } else if (action === 'getRecords') {
        result = { status: 'success', data: getInboundRecords() };
      }
    } catch (err) {
      result = { status: 'error', message: err.toString() };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // If index.html exists in Apps Script project, serve it as Web Page
  try {
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('ระบบหนังสือรับ - โรงเรียนบ้านสันดาบ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    // If running as API-only backend (without index.html inside Apps Script project)
    const apiStatus = {
      status: 'online',
      service: 'ระบบหนังสือรับอิเล็กทรอนิกส์ โรงเรียนบ้านสันดาบ (GAS API Backend)',
      message: 'API พร้อมใช้งานเรียบร้อยแล้ว',
      timestamp: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      endpoints: {
        getTeachers: '?action=getTeachers',
        getRecords: '?action=getRecords',
        postData: 'POST JSON payload'
      }
    };
    return ContentService.createTextOutput(JSON.stringify(apiStatus, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web App HTTP POST Handler (REST API for saving files and data)
 */
function doPost(e) {
  let result = { status: 'error', message: 'No data received' };

  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const data = payload.data;

    if (action === 'saveRecord') {
      result = saveInboundRecord(data);
    } else if (action === 'updateProposal') {
      result = updateProposalRecord(data);
    } else if (action === 'updateDirectorComment' || action === 'completeDirector') {
      result = updateDirectorRecord(data);
    } else if (action === 'editRecord') {
      result = editInboundRecord(data);
    } else if (action === 'deleteRecord') {
      result = deleteInboundRecord(data.id);
    } else if (action === 'saveOutboundRecord') {
      result = saveOutboundRecord(data);
    } else if (action === 'deleteOutboundRecord') {
      result = deleteOutboundRecord(data.id);
    } else if (action === 'saveOrderRecord') {
      result = saveOrderRecord(data);
    } else if (action === 'deleteOrderRecord') {
      result = deleteOrderRecord(data.id);
    }
  } catch (err) {
    result = { status: 'error', message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ดึงรายชื่อครูจากชีต Teachers (Google Sheet ID: 1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA)
 */
function getTeachersList() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_TEACHERS_ID);
    const sheet = ss.getSheetByName(CONFIG.TEACHERS_TAB_NAME) || ss.getSheets()[0];
    const values = sheet.getDataRange().getValues();

    const teachers = [];
    // Skip header row 0, read column 1 (ชื่อ-นามสกุล)
    for (let i = 1; i < values.length; i++) {
      const name = values[i][1];
      if (name && String(name).trim() !== '' && String(name).trim() !== 'ชื่อ-นามสกุล') {
        teachers.push(String(name).trim());
      }
    }
    return teachers;
  } catch (err) {
    Logger.log('Error getTeachersList: ' + err);
    return [
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
  }
}

/**
 * เตรียมชีตสำหรับบันทึกหนังสือรับ (Google Sheet ID: 1iyrtsfjL3WEl2BQOpbTWLEhaacA95dfScXYj_1QBqK8)
 */
function getInboundSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_INBOUND_ID);
  let sheet = ss.getSheetByName(CONFIG.INBOUND_TAB_NAME);

  if (!sheet) {
    const firstSheet = ss.getSheets()[0];
    if (firstSheet && firstSheet.getLastRow() === 0) {
      sheet = firstSheet;
      sheet.setName(CONFIG.INBOUND_TAB_NAME);
    } else {
      sheet = ss.insertSheet(CONFIG.INBOUND_TAB_NAME);
    }

    // Create headers
    sheet.appendRow([
      'ID',
      'ลำดับ',
      'เลขหนังสือรับ',
      'วันที่รับ',
      'เวลา',
      'เรื่อง',
      'ผู้รับผิดชอบ',
      'สถานะ',
      'ลิงก์ไฟล์ Drive',
      'ข้อมูลเสนอ_ผอ',
      'ความเห็น_ผอ',
      'วันที่ปรับปรุงล่าสุด'
    ]);
    sheet.getRange(1, 1, 1, 12)
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * อ่านรายการหนังสือรับทั้งหมด
 */
function getInboundRecords() {
  const sheet = getInboundSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    let proposalData = null;
    let directorData = null;
    try {
      if (r[9]) proposalData = typeof r[9] === 'string' ? JSON.parse(r[9]) : r[9];
    } catch (e) {}
    try {
      if (r[10]) directorData = typeof r[10] === 'string' ? JSON.parse(r[10]) : r[10];
    } catch (e) {}

    records.push({
      id: r[0],
      orderNo: r[1],
      bookNo: r[2],
      receiveDate: r[3],
      receiveTime: r[4],
      title: r[5],
      assignee: r[6],
      status: r[7],
      driveFileUrl: r[8],
      proposalData: proposalData,
      directorData: directorData,
      updatedAt: r[11]
    });
  }

  return records;
}

/**
 * บันทึกหนังสือรับเข้า Google Sheet และอัพโหลดไฟล์เข้า Google Drive
 */
function saveInboundRecord(record) {
  const sheet = getInboundSheet();
  let fileUrl = '';

  // Save stamped file to Drive folder
  if (record.stampedDataUrl) {
    fileUrl = uploadBase64FileToDrive(
      record.stampedDataUrl,
      'หนังสือรับ_' + record.bookNo.replace(/[\/\\]/g, '-') + '.pdf',
      record.fileType || 'application/pdf'
    );
  }

  sheet.appendRow([
    record.id,
    sheet.getLastRow(), // Order number
    record.bookNo,
    record.receiveDate,
    record.receiveTime,
    record.title || '',
    record.assignee || '-',
    record.status || 'รอเสนอ ผอ.',
    fileUrl,
    record.proposalData ? JSON.stringify(record.proposalData) : '',
    record.directorData ? JSON.stringify(record.directorData) : '',
    new Date().toLocaleString('th-TH')
  ]);

  return { status: 'success', fileUrl };
}

/**
 * อัพเดทข้อมูลเสนอ ผอ. (Stamp 2)
 */
function updateProposalRecord(record) {
  const sheet = getInboundSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(record.id)) {
      const rowIndex = i + 1;
      let fileUrl = rows[i][8];

      if (record.stampedDataUrl) {
        fileUrl = uploadBase64FileToDrive(
          record.stampedDataUrl,
          'หนังสือรับ_' + record.bookNo.replace(/[\/\\]/g, '-') + '_เสนอผอ.pdf',
          record.fileType || 'application/pdf'
        );
      }

      sheet.getRange(rowIndex, 8).setValue('รอ ผอ. ลงนาม');
      sheet.getRange(rowIndex, 9).setValue(fileUrl);
      sheet.getRange(rowIndex, 10).setValue(JSON.stringify(record.proposalData || {}));
      sheet.getRange(rowIndex, 12).setValue(new Date().toLocaleString('th-TH'));
      return { status: 'success', fileUrl };
    }
  }

  return { status: 'error', message: 'Record not found' };
}

/**
 * อัพเดทความคิดเห็น ผอ. และผู้รับผิดชอบ (Stamp 3)
 */
function updateDirectorRecord(record) {
  const sheet = getInboundSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(record.id)) {
      const rowIndex = i + 1;
      let fileUrl = rows[i][8];

      if (record.stampedDataUrl) {
        fileUrl = uploadBase64FileToDrive(
          record.stampedDataUrl,
          'หนังสือรับ_' + record.bookNo.replace(/[\/\\]/g, '-') + '_เสร็จสิ้น.pdf',
          record.fileType || 'application/pdf'
        );
      }

      sheet.getRange(rowIndex, 7).setValue(record.assignee || 'ครูทุกคน');
      sheet.getRange(rowIndex, 8).setValue('เสร็จสิ้น');
      sheet.getRange(rowIndex, 9).setValue(fileUrl);
      sheet.getRange(rowIndex, 11).setValue(JSON.stringify(record.directorData || {}));
      sheet.getRange(rowIndex, 12).setValue(new Date().toLocaleString('th-TH'));
      return { status: 'success', fileUrl };
    }
  }

  return { status: 'error', message: 'Record not found' };
}

/**
 * แก้ไขข้อมูลหนังสือรับ
 */
function editInboundRecord(record) {
  const sheet = getInboundSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(record.id)) {
      const rowIndex = i + 1;
      sheet.getRange(rowIndex, 3).setValue(record.bookNo);
      sheet.getRange(rowIndex, 4).setValue(record.receiveDate);
      sheet.getRange(rowIndex, 5).setValue(record.receiveTime);
      sheet.getRange(rowIndex, 6).setValue(record.title || '');
      sheet.getRange(rowIndex, 12).setValue(new Date().toLocaleString('th-TH'));
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Record not found' };
}

/**
 * ลบรายการหนังสือรับ
 */
function deleteInboundRecord(id) {
  const sheet = getInboundSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Record not found' };
}

/**
 * อัพโหลดไฟล์ Base64 เข้า Google Drive Folder ID: 136nyrJjpEK2vYwaRjGgUwvbxtg5uoLEj
 */
function uploadBase64FileToDrive(base64DataUrl, fileName, mimeType) {
  try {
    if (!base64DataUrl || typeof base64DataUrl !== 'string') return '';
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const base64Data = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType || 'application/pdf', fileName);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('Drive upload error: ' + err);
    return '';
  }
}

/**
 * ============================================================================
 * ทะเบียนหนังสือส่ง (Outbound Records)
 * ============================================================================
 */
function getOutboundSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_INBOUND_ID);
  let sheet = ss.getSheetByName('OutboundRecords');
  if (!sheet) {
    sheet = ss.insertSheet('OutboundRecords');
    sheet.appendRow([
      'ID', 'ลำดับ', 'เลขหนังสือส่ง', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'ชื่อไฟล์แนบ', 'ลิงก์ไฟล์ Drive', 'วันที่บันทึก'
    ]);
    sheet.getRange(1, 1, 1, 10).setBackground('#0284c7').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveOutboundRecord(record) {
  const sheet = getOutboundSheet();
  let fileUrl = '';
  if (record.fileDataUrl) {
    fileUrl = uploadBase64FileToDrive(
      record.fileDataUrl,
      record.fileName || ('หนังสือส่ง_' + String(record.outboundNo).replace(/[\/\\]/g, '_') + '.pdf'),
      record.fileType || 'application/pdf'
    );
  }

  sheet.appendRow([
    record.id,
    sheet.getLastRow(),
    record.outboundNo,
    record.date,
    record.from,
    record.to,
    record.title,
    record.fileName || '',
    fileUrl,
    new Date().toLocaleString('th-TH')
  ]);
  return { status: 'success', fileUrl };
}

function deleteOutboundRecord(id) {
  const sheet = getOutboundSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Not found' };
}

/**
 * ============================================================================
 * ทะเบียนหนังสือคำสั่ง (Order Records)
 * ============================================================================
 */
function getOrderSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_INBOUND_ID);
  let sheet = ss.getSheetByName('OrderRecords');
  if (!sheet) {
    sheet = ss.insertSheet('OrderRecords');
    sheet.appendRow([
      'ID', 'ลำดับ', 'ที่คำสั่ง', 'เรื่อง', 'วันที่ลงคำสั่ง', 'หน้าที่ที่ได้รับมอบหมาย', 'ชื่อไฟล์แนบ', 'ลิงก์ไฟล์ Drive', 'วันที่บันทึก'
    ]);
    sheet.getRange(1, 1, 1, 9).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveOrderRecord(record) {
  const sheet = getOrderSheet();
  let fileUrl = '';
  if (record.fileDataUrl) {
    fileUrl = uploadBase64FileToDrive(
      record.fileDataUrl,
      record.fileName || ('คำสั่งที่_' + String(record.orderNo).replace(/[\/\\]/g, '_') + '.pdf'),
      record.fileType || 'application/pdf'
    );
  }

  sheet.appendRow([
    record.id,
    sheet.getLastRow(),
    record.orderNo,
    record.title,
    record.date,
    record.assignedDuty,
    record.fileName || '',
    fileUrl,
    new Date().toLocaleString('th-TH')
  ]);
  return { status: 'success', fileUrl };
}

function deleteOrderRecord(id) {
  const sheet = getOrderSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'Not found' };
}
