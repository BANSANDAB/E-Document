/**
 * ระบบหนังสือรับ - โรงเรียนบ้านสันดาบ
 * stampEngine.js: Stamping Engine using PDF-Lib and HTML5 Canvas
 */

const StampEngine = (function () {
  const STAMP_BLUE = '#002db3';
  const STAMP_FONT = 'bold 44px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';

  // Cache preloaded images
  const imageCache = {};

  function loadImage(src) {
    if (imageCache[src]) {
      return Promise.resolve(imageCache[src]);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageCache[src] = img;
        resolve(img);
      };
      img.onerror = (err) => reject(new Error('Failed to load stamp image: ' + err));
      img.src = src;
    });
  }

  function getStampAsset(stampKey) {
    if (typeof STAMP_ASSETS !== 'undefined' && STAMP_ASSETS[stampKey]) {
      return STAMP_ASSETS[stampKey];
    }
    // Fallback relative paths
    if (stampKey === 'stamp1') return './ตราปั้มหนังสือรับ.png';
    if (stampKey === 'stamp2') return './ตราปั้มหนังสือรับ 2.png';
    if (stampKey === 'stamp3') return './ตราปั้มหนังสือรับ 3.png';
    return '';
  }

  // Draw clean vector checkmark on canvas
  function drawCheckmark(ctx, cx, cy, size = 36) {
    ctx.save();
    ctx.strokeStyle = STAMP_BLUE;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.38, cy);
    ctx.lineTo(cx - size * 0.08, cy + size * 0.38);
    ctx.lineTo(cx + size * 0.45, cy - size * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  // Remove white or off-white background from stamp so it is completely transparent
  function makeTransparentBackground(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const len = d.length;
      for (let i = 0; i < len; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        // Blue ink has low R/G and higher B
        // Background pixels are white or light gray (R > 215, G > 215, B > 210)
        if (r > 215 && g > 215 && b > 210) {
          d[i + 3] = 0; // Transparent
        } else if (r > 190 && g > 190 && b > 190) {
          const brightness = (r + g + b) / 3;
          const alpha = Math.max(0, Math.min(255, (255 - brightness) * 4));
          d[i + 3] = Math.min(d[i + 3], alpha);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('Canvas transparency processing failed (possibly tainted):', e);
    }
  }

  // Auto-crop signature image to remove empty margins so scaling stays anchored on dotted line
  function trimSignatureImage(img) {
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;

      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const a = d[i + 3];
          if (a > 15) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            if (brightness < 230) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }

      if (maxX >= minX && maxY >= minY) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const pad = 2;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW + pad * 2;
        cropCanvas.height = cropH + pad * 2;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(c, minX, minY, cropW, cropH, pad, pad, cropW, cropH);
        return cropCanvas;
      }
      return c;
    } catch (e) {
      return img;
    }
  }

  // Parse date into Day, Month, Year parts for spaced placement around slashes
  function parseDateSegments(dateStr) {
    if (!dateStr) return { day: '', month: '', year: '' };
    const str = String(dateStr).trim();
    let parts = [];
    if (str.includes('/')) {
      parts = str.split('/');
    } else if (str.includes('-')) {
      parts = str.split('-');
    } else {
      parts = str.split(/\s+/);
    }

    if (parts.length >= 3) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const p2 = parts[2].trim();
      // If p0 is 4 digits (e.g. 2026 or 2569 in ISO format YYYY-MM-DD), swap to day/month/year
      if (p0.length === 4 && p2.length <= 2) {
        return { day: p2, month: p1, year: p0 };
      }
      return { day: p0, month: p1, year: p2 };
    }
    return { day: str, month: '', year: '' };
  }

  /**
   * Stamp 1: ตราปั้มหนังสือรับ (มุมบนขวา)
   * Size: 1774 x 887
   */
  async function renderStamp1Canvas(params) {
    const { bookNo = '', receiveDate = '', receiveTime = '' } = params || {};
    const img = await loadImage(getStampAsset('stamp1'));

    const canvas = document.createElement('canvas');
    canvas.width = 1774;
    canvas.height = 887;
    const ctx = canvas.getContext('2d');

    // Draw base stamp
    ctx.drawImage(img, 0, 0, 1774, 887);

    // Text settings: Well-proportioned font ("ขนาดพอดี"), strictly ABOVE the dotted lines
    ctx.fillStyle = STAMP_BLUE;
    ctx.font = 'bold 54px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';
    ctx.textBaseline = 'bottom';

    // 1. เลขรับที่ (Dotted line at Y=430-441 -> baseline at Y=414, 16px clear space above dots)
    if (bookNo) {
      ctx.fillText(bookNo, 430, 414);
    }

    // 2. วันที่ (Dotted line at Y=557-568 -> baseline at Y=540, 17px clear space above dots)
    if (receiveDate) {
      ctx.fillText(receiveDate, 330, 540);
    }

    // 3. เวลา (Dotted line at Y=678-689 -> baseline at Y=662, 16px clear space above dots)
    if (receiveTime) {
      ctx.fillText(receiveTime, 330, 662);
    }

    // Remove white background to make stamp transparent
    makeTransparentBackground(ctx, 1774, 887);

    return {
      canvas,
      dataUrl: canvas.toDataURL('image/png'),
      width: 1774,
      height: 887
    };
  }

  /**
   * Stamp 2: เสนอ ผอ. (ด้านซ้ายล่างเลยครึ่งกระดาษลงมา)
   * Size: 1774 x 887
   */
  async function renderStamp2Canvas(params) {
    const {
      checkboxes = {},
      customNotice = '',
      note = '',
      signatureDataUrl = null,
      signatureScale = 1.0,
      date = ''
    } = params || {};

    const img = await loadImage(getStampAsset('stamp2'));

    const canvas = document.createElement('canvas');
    canvas.width = 1774;
    canvas.height = 887;
    const ctx = canvas.getContext('2d');

    // Draw base stamp
    ctx.drawImage(img, 0, 0, 1774, 887);

    // Checkboxes Row 1 (center Y = 309)
    // เพื่อทราบ: X = 152
    if (checkboxes.toKnow) drawCheckmark(ctx, 152, 309, 34);
    // เพื่อดำเนินการ: X = 632
    if (checkboxes.toAct) drawCheckmark(ctx, 632, 309, 34);
    // เพื่อพิจารณา: X = 1228
    if (checkboxes.toConsider) drawCheckmark(ctx, 1228, 309, 34);

    // Checkboxes Row 2 (center Y = 417)
    // เพื่อถือปฏิบัติ: X = 152
    if (checkboxes.toComply) drawCheckmark(ctx, 152, 417, 34);
    // เพื่อแจ้ง: X = 632
    if (checkboxes.toNotify) drawCheckmark(ctx, 632, 417, 34);

    // Text: Single message/note placed strictly BELOW "เพื่อถือปฏิบัติ" and ABOVE dots (line at Y=540)
    ctx.fillStyle = STAMP_BLUE;
    ctx.font = 'bold 46px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';
    ctx.textBaseline = 'bottom';

    const textToDraw = (note || customNotice || '').trim();
    if (textToDraw) {
      // Always place on full dotted line below เพื่อถือปฏิบัติ (dots at Y=540 -> baseline at Y=526)
      ctx.fillText(textToDraw, 140, 526);
    }

    // Signature strictly ABOVE dots on "ลงชื่อ...................." (dots at Y=630) with scalable sizing anchored on baseline
    if (signatureDataUrl) {
      try {
        const rawSigImg = await loadImage(signatureDataUrl);
        const sigImg = trimSignatureImage(rawSigImg);
        const scaleMultiplier = Math.max(0.4, Math.min(2.5, Number(signatureScale) || 1.0));
        const maxW = 520 * scaleMultiplier;
        const maxH = 135 * scaleMultiplier;
        const scale = Math.min(maxW / sigImg.width, maxH / sigImg.height);
        const w = sigImg.width * scale;
        const h = sigImg.height * scale;
        // Center X = 960 (center of dotted line), bottom anchored at Y = 624 (directly above dots at Y=630)
        ctx.drawImage(sigImg, 960 - w / 2, 624 - h, w, h);
      } catch (e) {
        console.warn('Failed to draw signature 2', e);
      }
    }

    // Date on Stamp 2: Formatted as Day before 1st '/', Month before 2nd '/', Year after 2nd '/'
    // Slashes on stamp 2: Slash 1 at X=863, Slash 2 at X=1084. Dots at Y=702 -> baseline at Y=690
    if (date) {
      const { day, month, year } = parseDateSegments(date);
      ctx.textAlign = 'center';
      // 1. วัน อยู่หน้า / (Center X = 765)
      if (day) {
        ctx.fillText(day, 765, 690);
      }
      // 2. เดือน อยู่หน้า / (Center X = 972, between slashes)
      if (month) {
        ctx.fillText(month, 972, 690);
      }
      // 3. ปี หลัง / (Center X = 1190)
      if (year) {
        ctx.fillText(year, 1190, 690);
      }
      ctx.textAlign = 'start';
    }

    // Remove white background to make stamp transparent
    makeTransparentBackground(ctx, 1774, 887);

    return {
      canvas,
      dataUrl: canvas.toDataURL('image/png'),
      width: 1774,
      height: 887
    };
  }

  /**
   * Stamp 3: ความคิดเห็น ผอ. (ด้านขวาล่างเลยครึ่งกระดาษลงมา)
   * Size: 1619 x 972
   */
  async function renderStamp3Canvas(params) {
    const {
      checkboxes = {},
      comment = '',
      signatureDataUrl = null,
      signatureScale = 1.0,
      directorName = 'นายกฤษฎา ผลพล',
      date = '',
      assignee = ''
    } = params || {};

    const img = await loadImage(getStampAsset('stamp3'));

    const canvas = document.createElement('canvas');
    canvas.width = 1619;
    canvas.height = 972;
    const ctx = canvas.getContext('2d');

    // Draw base stamp
    ctx.drawImage(img, 0, 0, 1619, 972);

    // Checkboxes Row 1 (center Y = 300)
    // ทราบ: X = 215, Y = 300
    if (checkboxes.ack) drawCheckmark(ctx, 215, 300, 36);
    // ดำเนินการตาม: X = 710, Y = 300
    if (checkboxes.follow) drawCheckmark(ctx, 710, 300, 36);

    // Checkboxes Row 2 (center Y = 408)
    // เห็นชอบ: X = 215, Y = 408
    if (checkboxes.agree) drawCheckmark(ctx, 215, 408, 36);
    // อนุมัติ: X = 710, Y = 408
    if (checkboxes.approve) drawCheckmark(ctx, 710, 408, 36);

    ctx.fillStyle = STAMP_BLUE;
    ctx.font = 'bold 46px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';
    ctx.textBaseline = 'bottom';

    // Comment Line 1 (Above dots at Y=520 -> baseline at Y=508)
    if (comment) {
      ctx.fillText(comment, 180, 508);
    }

    // Assignee Line 2 (Above dots at Y=610 -> baseline at Y=598)
    if (assignee) {
      const assigneeText = 'มอบ: ' + assignee;
      const maxAssigneeW = 1360; // Available width before right border
      let fontSize = 46;
      ctx.font = `bold ${fontSize}px "Sarabun", "TH Sarabun New", "Kanit", sans-serif`;
      let textW = ctx.measureText(assigneeText).width;
      while (textW > maxAssigneeW && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Sarabun", "TH Sarabun New", "Kanit", sans-serif`;
        textW = ctx.measureText(assigneeText).width;
      }
      ctx.fillText(assigneeText, 180, 598);
      // Reset font back to default
      ctx.font = 'bold 46px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';
    }

    // Signature strictly ABOVE dots on "ลงชื่อ...................." (dots at Y=712 -> bottom at Y=704) with scalable sizing anchored on baseline
    if (signatureDataUrl) {
      try {
        const rawSigImg = await loadImage(signatureDataUrl);
        const sigImg = trimSignatureImage(rawSigImg);
        const scaleMultiplier = Math.max(0.4, Math.min(2.5, Number(signatureScale) || 1.0));
        const maxW = 520 * scaleMultiplier;
        const maxH = 135 * scaleMultiplier;
        const scale = Math.min(maxW / sigImg.width, maxH / sigImg.height);
        const w = sigImg.width * scale;
        const h = sigImg.height * scale;
        // Center X = 880 (center of dotted line), bottom anchored at Y = 704 (directly above dots at Y=712)
        ctx.drawImage(sigImg, 880 - w / 2, 704 - h, w, h);
      } catch (e) {
        console.warn('Failed to draw signature 3', e);
      }
    }

    // Director Name in parentheses: ( นายกฤษฎา ผลพล ) strictly ABOVE dots (dots at Y=778 -> baseline at Y=766)
    if (directorName) {
      const nameText = '(' + directorName + ')';
      ctx.textAlign = 'center';
      ctx.fillText(nameText, 880, 766);
      ctx.textAlign = 'start';
    }

    // Date: Formatted as Day before 1st '/', Month before 2nd '/', Year after 2nd '/'
    // Slashes on stamp: Slash 1 at X=780, Slash 2 at X=1088. Dots at Y=834 -> baseline at Y=822
    if (date) {
      const { day, month, year } = parseDateSegments(date);
      ctx.textAlign = 'center';
      // 1. วัน อยู่หน้า / (Center X = 665)
      if (day) {
        ctx.fillText(day, 665, 822);
      }
      // 2. เดือน อยู่หน้า / (Center X = 934, between slashes)
      if (month) {
        ctx.fillText(month, 934, 822);
      }
      // 3. ปี หลัง / (Center X = 1200)
      if (year) {
        ctx.fillText(year, 1200, 822);
      }
      ctx.textAlign = 'start';
    }

    // Remove white background to make stamp transparent
    makeTransparentBackground(ctx, 1619, 972);

    return {
      canvas,
      dataUrl: canvas.toDataURL('image/png'),
      width: 1619,
      height: 972
    };
  }

  /**
   * Helper: คำนวณพิกัด X, Y บนหน้า PDF ตาม Preset และค่า Offset
   */
  function calculateStampCoordinatesPdf(preset, offsetX, offsetY, stampW, stampH, pageW, pageH, defaultMargin = 18) {
    let x = 0;
    let y = 0;

    switch (preset) {
      case 'top-left':
        x = defaultMargin;
        y = pageH - stampH - defaultMargin;
        break;
      case 'top-center':
        x = (pageW - stampW) / 2;
        y = pageH - stampH - defaultMargin;
        break;
      case 'top-right':
        x = pageW - stampW - defaultMargin;
        y = pageH - stampH - defaultMargin;
        break;
      case 'bottom-left':
        x = defaultMargin;
        y = Math.max(55, pageH * 0.08);
        break;
      case 'bottom-center':
        x = (pageW - stampW) / 2;
        y = Math.max(55, pageH * 0.08);
        break;
      case 'bottom-right':
        x = pageW - stampW - defaultMargin;
        y = Math.max(55, pageH * 0.08);
        break;
      case 'mid-left':
        x = defaultMargin;
        y = (pageH - stampH) / 2;
        break;
      case 'mid-center':
        x = (pageW - stampW) / 2;
        y = (pageH - stampH) / 2;
        break;
      case 'mid-right':
        x = pageW - stampW - defaultMargin;
        y = (pageH - stampH) / 2;
        break;
      default:
        x = pageW - stampW - defaultMargin;
        y = pageH - stampH - defaultMargin;
        break;
    }

    // Offset: +offsetX = เลื่อนขวา, +offsetY = เลื่อนขึ้น
    x += (Number(offsetX) || 0);
    y += (Number(offsetY) || 0);

    // ป้องกันหลุดขอบหน้ากระดาษ
    x = Math.max(0, Math.min(pageW - stampW, x));
    y = Math.max(0, Math.min(pageH - stampH, y));

    return { x, y };
  }

  /**
   * Helper: คำนวณพิกัด X, Y บน Canvas รูปภาพตาม Preset และค่า Offset
   */
  function calculateStampCoordinatesImage(preset, offsetX, offsetY, stampW, stampH, W, H, defaultMargin = 20) {
    let x = 0;
    let y = 0;

    switch (preset) {
      case 'top-left':
        x = defaultMargin;
        y = defaultMargin;
        break;
      case 'top-center':
        x = (W - stampW) / 2;
        y = defaultMargin;
        break;
      case 'top-right':
        x = W - stampW - defaultMargin;
        y = defaultMargin;
        break;
      case 'bottom-left':
        x = defaultMargin;
        y = H - stampH - Math.max(defaultMargin * 2.2, H * 0.08);
        break;
      case 'bottom-center':
        x = (W - stampW) / 2;
        y = H - stampH - Math.max(defaultMargin * 2.2, H * 0.08);
        break;
      case 'bottom-right':
        x = W - stampW - defaultMargin;
        y = H - stampH - Math.max(defaultMargin * 2.2, H * 0.08);
        break;
      case 'mid-left':
        x = defaultMargin;
        y = (H - stampH) / 2;
        break;
      case 'mid-center':
        x = (W - stampW) / 2;
        y = (H - stampH) / 2;
        break;
      case 'mid-right':
        x = W - stampW - defaultMargin;
        y = (H - stampH) / 2;
        break;
      default:
        x = W - stampW - defaultMargin;
        y = defaultMargin;
        break;
    }

    const scaleFactor = Math.max(1, W / 595.28);
    x += (Number(offsetX) || 0) * scaleFactor;
    y -= (Number(offsetY) || 0) * scaleFactor;

    x = Math.max(0, Math.min(W - stampW, x));
    y = Math.max(0, Math.min(H - stampH, y));

    return { x, y };
  }

  /**
   * Helper: วาดตราปั๊มลงบนหน้า PDF ตามการกำหนดตำแหน่ง (รองรับปั๊มหลายหน้า, ทุกหน้า, หรือหลายจุด)
   */
  async function drawStampOnPdfPages({
    pdfDoc,
    pages,
    stampCanvas,
    baseWidthFormula,
    aspectRatio,
    posConfig = {},
    defaultPreset = 'top-right',
    defaultMargin = 18
  }) {
    if (!stampCanvas) return;
    const dataUrl = stampCanvas.toDataURL('image/png');
    const pngBase64 = dataUrl.split(',')[1];
    const binaryString = atob(pngBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const stampImage = await pdfDoc.embedPng(bytes);
    const totalPages = pages.length;

    // รวบรวมรายการตำแหน่งที่จะปั๊มทั้งหมด
    let placementList = [];

    if (Array.isArray(posConfig.placements) && posConfig.placements.length > 0) {
      // ผู้ใช้กำหนดหลายตำแหน่งหรือหลายหน้าอย่างอิสระ
      placementList = posConfig.placements.map(p => ({
        page: Number(p.page) || 1,
        percentX: p.percentX,
        percentY: p.percentY,
        preset: p.preset || posConfig.preset || defaultPreset,
        offsetX: p.offsetX || 0,
        offsetY: p.offsetY || 0,
        scale: typeof p.scale === 'number' ? p.scale : (typeof posConfig.scale === 'number' ? posConfig.scale : 1.0)
      }));
    } else if (posConfig.pages === 'all' || posConfig.targetScope === 'all') {
      // ปั๊มทุกหน้า
      for (let p = 1; p <= totalPages; p++) {
        placementList.push({
          page: p,
          percentX: posConfig.percentX,
          percentY: posConfig.percentY,
          preset: posConfig.preset || defaultPreset,
          offsetX: posConfig.offsetX || 0,
          offsetY: posConfig.offsetY || 0,
          scale: typeof posConfig.scale === 'number' ? posConfig.scale : 1.0
        });
      }
    } else if (Array.isArray(posConfig.pages) && posConfig.pages.length > 0) {
      // ปั๊มตามรายการหน้าที่เลือก เช่น [1, 2]
      for (const p of posConfig.pages) {
        const pageNum = Number(p);
        if (pageNum >= 1 && pageNum <= totalPages) {
          placementList.push({
            page: pageNum,
            percentX: posConfig.percentX,
            percentY: posConfig.percentY,
            preset: posConfig.preset || defaultPreset,
            offsetX: posConfig.offsetX || 0,
            offsetY: posConfig.offsetY || 0,
            scale: typeof posConfig.scale === 'number' ? posConfig.scale : 1.0
          });
        }
      }
    } else {
      // ตำแหน่งเดียว (หน้าระบุ หรือหน้า 1 เป็นค่าเริ่มต้น)
      const pageNum = Number(posConfig.page) || 1;
      placementList.push({
        page: Math.max(1, Math.min(totalPages, pageNum)),
        percentX: posConfig.percentX,
        percentY: posConfig.percentY,
        preset: posConfig.preset || defaultPreset,
        offsetX: posConfig.offsetX || 0,
        offsetY: posConfig.offsetY || 0,
        scale: typeof posConfig.scale === 'number' ? posConfig.scale : 1.0
      });
    }

    // วาดตราปั๊มลงบนแต่ละหน้าตามที่ระบุ
    for (const item of placementList) {
      const pageIdx = item.page - 1;
      if (pageIdx < 0 || pageIdx >= totalPages) continue;

      const page = pages[pageIdx];
      const pageW = page.getWidth();
      const pageH = page.getHeight();

      const scale = typeof item.scale === 'number' ? item.scale : 1.0;
      const baseW = baseWidthFormula(pageW);
      const stampW = baseW * scale;
      const stampH = stampW * aspectRatio;

      let coords;
      if (typeof item.percentX === 'number' && typeof item.percentY === 'number') {
        coords = {
          x: Math.max(0, Math.min(pageW - stampW, item.percentX * pageW)),
          y: Math.max(0, Math.min(pageH - stampH, pageH - (item.percentY * pageH) - stampH))
        };
      } else {
        coords = calculateStampCoordinatesPdf(
          item.preset || defaultPreset,
          item.offsetX || 0,
          item.offsetY || 0,
          stampW,
          stampH,
          pageW,
          pageH,
          defaultMargin
        );
      }

      page.drawImage(stampImage, {
        x: coords.x,
        y: coords.y,
        width: stampW,
        height: stampH
      });
    }
  }

  /**
   * Main function to stamp a PDF document
   * รองรับตราปั๊มมากกว่า 1 หน้า, ปั๊มหลายจุด, และปรับย่อ-ขยายขนาดได้
   */
  async function stampPdfDocument(options) {
    if (!window.PDFLib) {
      throw new Error('PDF-Lib library is not loaded');
    }

    const {
      pdfBytes,
      stamp1Canvas,
      stamp2Canvas,
      stamp3Canvas,
      stamp1Pos,
      stamp2Pos,
      stamp3Pos
    } = options;

    // Load PDF with decryption support for encrypted/permission-restricted government PDFs
    let pdfDoc;
    try {
      pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    } catch (err1) {
      try {
        pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true, password: '' });
      } catch (err2) {
        pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
      }
    }
    const pages = pdfDoc.getPages();

    // 1. Stamp 1: ตราปั๊มรับเข้า (รองรับปั๊มมากกว่า 1 หน้า และปรับย่อขยายขนาดได้)
    if (stamp1Canvas) {
      await drawStampOnPdfPages({
        pdfDoc,
        pages,
        stampCanvas: stamp1Canvas,
        baseWidthFormula: (pw) => Math.min(235, pw * 0.38),
        aspectRatio: (887 / 1774),
        posConfig: stamp1Pos || {},
        defaultPreset: 'top-right',
        defaultMargin: 18
      });
    }

    // 2. Stamp 2: เสนอ ผอ. (รองรับปั๊มมากกว่า 1 หน้า และปรับย่อขยายขนาดได้)
    if (stamp2Canvas) {
      await drawStampOnPdfPages({
        pdfDoc,
        pages,
        stampCanvas: stamp2Canvas,
        baseWidthFormula: (pw) => Math.min(255, pw * 0.44),
        aspectRatio: (887 / 1774),
        posConfig: stamp2Pos || {},
        defaultPreset: 'bottom-left',
        defaultMargin: 20
      });
    }

    // 3. Stamp 3: ความคิดเห็น ผอ. (รองรับปั๊มมากกว่า 1 หน้า และปรับย่อขยายขนาดได้)
    if (stamp3Canvas) {
      await drawStampOnPdfPages({
        pdfDoc,
        pages,
        stampCanvas: stamp3Canvas,
        baseWidthFormula: (pw) => Math.min(255, pw * 0.44),
        aspectRatio: (972 / 1619),
        posConfig: stamp3Pos || {},
        defaultPreset: 'bottom-right',
        defaultMargin: 20
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return modifiedPdfBytes;
  }

  /**
   * Embed stamps onto Image document
   */
  async function stampImageDocument(options) {
    const {
      imageSource,
      stamp1Canvas,
      stamp2Canvas,
      stamp3Canvas,
      stamp1Pos,
      stamp2Pos,
      stamp3Pos
    } = options;
    const baseImg = await loadImage(imageSource);

    const canvas = document.createElement('canvas');
    canvas.width = baseImg.naturalWidth || baseImg.width;
    canvas.height = baseImg.naturalHeight || baseImg.height;
    const ctx = canvas.getContext('2d');

    // Draw document image
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

    const W = canvas.width;
    const H = canvas.height;

    // Stamp 1: Top Right (หรือตามตำแหน่งที่ลากวาง)
    if (stamp1Canvas) {
      drawStampOnImageCanvas({
        ctx,
        W,
        H,
        stampCanvas: stamp1Canvas,
        baseWFormula: (w) => Math.max(410, w * 0.38),
        aspectRatio: (887 / 1774),
        posConfig: stamp1Pos || {},
        defaultPreset: 'top-right',
        defaultMargin: W * 0.025
      });
    }

    // Stamp 2: Bottom Left (หรือตามตำแหน่งที่ลากวาง)
    if (stamp2Canvas) {
      drawStampOnImageCanvas({
        ctx,
        W,
        H,
        stampCanvas: stamp2Canvas,
        baseWFormula: (w) => Math.max(450, w * 0.44),
        aspectRatio: (887 / 1774),
        posConfig: stamp2Pos || {},
        defaultPreset: 'bottom-left',
        defaultMargin: W * 0.03
      });
    }

    // Stamp 3: Bottom Right (หรือตามตำแหน่งที่ลากวาง)
    if (stamp3Canvas) {
      drawStampOnImageCanvas({
        ctx,
        W,
        H,
        stampCanvas: stamp3Canvas,
        baseWFormula: (w) => Math.max(450, w * 0.44),
        aspectRatio: (972 / 1619),
        posConfig: stamp3Pos || {},
        defaultPreset: 'bottom-right',
        defaultMargin: W * 0.03
      });
    }

    return {
      canvas,
      dataUrl: canvas.toDataURL('image/png'),
      width: W,
      height: H
    };
  }

  /**
   * Helper: Create a sample blank government official memorandum PDF
   */
  async function createSampleDocumentPdf() {
    if (!window.PDFLib) return null;
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    // Decorative government header bar
    page.drawRectangle({
      x: 40,
      y: 800,
      width: 515,
      height: 4,
      color: PDFLib.rgb(0.06, 0.25, 0.55)
    });

    page.drawText('OFFICIAL MEMORANDUM / BAN SAN DAB SCHOOL', {
      x: 40,
      y: 770,
      size: 15,
      font,
      color: PDFLib.rgb(0.06, 0.2, 0.4)
    });

    page.drawText('Inbound Government Document Sample', {
      x: 40,
      y: 748,
      size: 11,
      font: regularFont,
      color: PDFLib.rgb(0.3, 0.35, 0.4)
    });

    // Content lines simulation
    let curY = 700;
    for (let i = 0; i < 9; i++) {
      page.drawLine({
        start: { x: 40, y: curY },
        end: { x: 555, y: curY },
        thickness: 0.8,
        color: PDFLib.rgb(0.85, 0.88, 0.92)
      });
      curY -= 26;
    }

    // Midpage indicator
    page.drawLine({
      start: { x: 40, y: 420 },
      end: { x: 555, y: 420 },
      thickness: 0.5,
      dashArray: [4, 4],
      color: PDFLib.rgb(0.7, 0.75, 0.8)
    });

    page.drawText('--- Mid Page (Stamp 2 & Stamp 3 below this line) ---', {
      x: 180,
      y: 424,
      size: 8,
      font: regularFont,
      color: PDFLib.rgb(0.6, 0.65, 0.7)
    });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  return {
    renderStamp1Canvas,
    renderStamp2Canvas,
    renderStamp3Canvas,
    calculateStampCoordinatesPdf,
    calculateStampCoordinatesImage,
    stampPdfDocument,
    stampImageDocument,
    createSampleDocumentPdf,
    drawCheckmark
  };
})();
