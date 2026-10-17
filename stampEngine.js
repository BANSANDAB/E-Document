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
    ctx.font = 'bold 50px "Sarabun", "TH Sarabun New", "Kanit", sans-serif';
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
        const maxW = 440 * scaleMultiplier;
        const maxH = 110 * scaleMultiplier;
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
      ctx.fillText(assigneeText, 180, 598);
    }

    // Signature strictly ABOVE dots on "ลงชื่อ...................." (dots at Y=712 -> bottom at Y=704) with scalable sizing anchored on baseline
    if (signatureDataUrl) {
      try {
        const rawSigImg = await loadImage(signatureDataUrl);
        const sigImg = trimSignatureImage(rawSigImg);
        const scaleMultiplier = Math.max(0.4, Math.min(2.5, Number(signatureScale) || 1.0));
        const maxW = 440 * scaleMultiplier;
        const maxH = 110 * scaleMultiplier;
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
   * Embed stamps onto PDF document
   * @param {Object} options
   *   pdfBytes: ArrayBuffer or Uint8Array
   *   stamp1Canvas: HTMLCanvasElement or null
   *   stamp2Canvas: HTMLCanvasElement or null
   *   stamp3Canvas: HTMLCanvasElement or null
   */
  async function stampPdfDocument(options) {
    if (!window.PDFLib) {
      throw new Error('PDF-Lib library is not loaded');
    }

    const { pdfBytes, stamp1Canvas, stamp2Canvas, stamp3Canvas } = options;
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[0]; // First page
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    // Helper to embed canvas
    async function embedCanvasAsPng(canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const pngBase64 = dataUrl.split(',')[1];
      const binaryString = atob(pngBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return await pdfDoc.embedPng(bytes);
    }

    // 1. Stamp 1: Top Right (มุมบนขวา)
    if (stamp1Canvas) {
      const stamp1Image = await embedCanvasAsPng(stamp1Canvas);
      // Desired width on page ~ 190 pt
      const s1Width = Math.min(190, pageWidth * 0.32);
      const s1Height = s1Width * (887 / 1774);
      const margin = 20;

      page.drawImage(stamp1Image, {
        x: pageWidth - s1Width - margin,
        y: pageHeight - s1Height - margin,
        width: s1Width,
        height: s1Height
      });
    }

    // 2. Stamp 2: เสนอ ผอ. (ด้านซ้ายล่าง: ปรับตำแหน่งขึ้นมาอีก + ลดขนาดลงหน่อย)
    if (stamp2Canvas) {
      const stamp2Image = await embedCanvasAsPng(stamp2Canvas);
      // Reduced size: from 0.42 (235pt) down to ~195pt (0.34)
      const s2Width = Math.min(195, pageWidth * 0.34);
      const s2Height = s2Width * (887 / 1774);
      const margin = 20;

      // Position: Move higher up (68pt or 10% of page height from bottom)
      const posY = Math.max(68, pageHeight * 0.10);

      page.drawImage(stamp2Image, {
        x: margin,
        y: posY,
        width: s2Width,
        height: s2Height
      });
    }

    // 3. Stamp 3: ความคิดเห็น ผอ. (ด้านขวาล่าง: ปรับตำแหน่งขึ้นมาอีก + ลดขนาดลงหน่อย)
    if (stamp3Canvas) {
      const stamp3Image = await embedCanvasAsPng(stamp3Canvas);
      // Reduced size: from 0.42 (235pt) down to ~195pt (0.34)
      const s3Width = Math.min(195, pageWidth * 0.34);
      const s3Height = s3Width * (972 / 1619);
      const margin = 20;

      // Position: Move higher up (68pt or 10% of page height from bottom)
      const posY = Math.max(68, pageHeight * 0.10);

      page.drawImage(stamp3Image, {
        x: pageWidth - s3Width - margin,
        y: posY,
        width: s3Width,
        height: s3Height
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return modifiedPdfBytes;
  }

  /**
   * Embed stamps onto Image document
   */
  async function stampImageDocument(options) {
    const { imageSource, stamp1Canvas, stamp2Canvas, stamp3Canvas } = options;
    const baseImg = await loadImage(imageSource);

    const canvas = document.createElement('canvas');
    canvas.width = baseImg.naturalWidth || baseImg.width;
    canvas.height = baseImg.naturalHeight || baseImg.height;
    const ctx = canvas.getContext('2d');

    // Draw document image
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

    const W = canvas.width;
    const H = canvas.height;

    // Stamp 1: Top Right
    if (stamp1Canvas) {
      const s1W = Math.max(340, W * 0.32);
      const s1H = s1W * (887 / 1774);
      const margin = W * 0.03;
      ctx.drawImage(stamp1Canvas, W - s1W - margin, margin, s1W, s1H);
    }

    // Stamp 2: Bottom Left (ปรับตำแหน่งขึ้นมาอีก + ลดขนาดลงหน่อย)
    if (stamp2Canvas) {
      // Reduced size: 0.34
      const s2W = Math.max(330, W * 0.34);
      const s2H = s2W * (887 / 1774);
      const margin = W * 0.03;
      // Y moved higher up from bottom (H * 0.09)
      const y = H - s2H - Math.max(margin * 2.2, H * 0.09);
      ctx.drawImage(stamp2Canvas, margin, y, s2W, s2H);
    }

    // Stamp 3: Bottom Right (ปรับตำแหน่งขึ้นมาอีก + ลดขนาดลงหน่อย)
    if (stamp3Canvas) {
      // Reduced size: 0.34
      const s3W = Math.max(330, W * 0.34);
      const s3H = s3W * (972 / 1619);
      const margin = W * 0.03;
      // Y moved higher up from bottom (H * 0.09)
      const y = H - s3H - Math.max(margin * 2.2, H * 0.09);
      ctx.drawImage(stamp3Canvas, W - s3W - margin, y, s3W, s3H);
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
    stampPdfDocument,
    stampImageDocument,
    createSampleDocumentPdf,
    drawCheckmark
  };
})();
