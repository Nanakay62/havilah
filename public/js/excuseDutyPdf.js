/**
 * @fileoverview excuseDutyPdf.js
 * Client-side formal Medical Excuse Duty & Occupational Health Certificate PDF generator.
 *
 * Designed as an authentic occupational health practice document for employers/HR:
 * - Slim clinical letterhead reading clinic name, practice registration/license number,
 *   address, and phone strictly from clinic profile/config (never hardcoded or invented).
 * - Clean two-column key-value block for patient, employer, department, consultation ref,
 *   and excused/return-to-duty dates.
 * - Formal certification paragraph in Source Serif 4; diagnosis omitted with one privacy-basis line.
 * - Signature block: renders clinician signature image ONLY when approved in the system;
 *   otherwise renders a clean labeled signature line, paired with an official clinic stamp area.
 * - Vector QR code + short verification URL resolving to the server-side verification endpoint.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./pdf/pdfConfig', './pdf/pdfFonts', './pdf/pdfComponents'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./pdf/pdfConfig'),
      require('./pdf/pdfFonts'),
      require('./pdf/pdfComponents')
    );
  } else {
    root.ExcuseDutyPdf = factory(
      root.HavilahPdfConfig,
      root.HavilahPdfFonts,
      root.HavilahPdfComponents
    );
  }
}(typeof self !== 'undefined' ? self : this, function (Config, Fonts, Components) {
  'use strict';

  const { PAGE, COLORS, TYPE, COPY, gridCol, r, resolveClinicProfile } = Config;

  const CERTIFICATE_TYPES = {
    excuse_duty: {
      title: 'Medical Excuse Duty Certificate',
      shortLabel: 'Excuse duty (sick leave)',
      slug: 'Excuse_Duty',
      defaultRemarks: 'Following a confidential clinical consultation, the employee named above has been medically assessed and is advised rest from work duties for the excused period indicated above. They are expected to resume regular duties on the return-to-duty date specified.'
    },
    light_duty: {
      title: 'Fit for Light / Modified Duty Certificate',
      shortLabel: 'Modified / light duty',
      slug: 'Light_Duty_Certificate',
      defaultRemarks: 'Following a confidential clinical consultation, the employee named above is medically fit to work under temporary modified or light duties for the period indicated above, with reduced physical or high-stress workload as appropriate.'
    },
    fit_to_return: {
      title: 'Fit to Return to Work Certificate',
      shortLabel: 'Fit to return to work',
      slug: 'Fit_To_Return_Certificate',
      defaultRemarks: 'Following a confidential clinical evaluation, the employee named above has been medically assessed and is certified fit to resume regular workplace duties on the date indicated.'
    },
    attendance: {
      title: 'Medical Consultation Attendance Certificate',
      shortLabel: 'Consultation attendance',
      slug: 'Medical_Attendance_Certificate',
      defaultRemarks: 'This certifies that the employee named above attended a confidential occupational health consultation with our clinical practice on the consultation date indicated.'
    }
  };

  function getJsPDFClass() {
    return (typeof window !== 'undefined' && ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF))
      || (typeof global !== 'undefined' && global.window && global.window.jspdf && global.window.jspdf.jsPDF)
      || null;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '—';
    const raw = String(dateStr).trim();
    // Accept ISO date or full ISO timestamp
    const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
    const parts = datePart.split('-');
    if (parts.length !== 3) return raw;
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function formatIssueTimestamp(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return formatDisplayDate(new Date().toISOString());
    const datePart = d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
    const timePart = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    });
    return `${datePart}, ${timePart} UTC`;
  }

  function calculateExcuseDutySchedule(startDateStr, endDateStr) {
    if (!startDateStr) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '—', startFormatted: '—', endFormatted: '—' };
    }
    const effectiveEnd = endDateStr || startDateStr;
    const sp = String(startDateStr).split('-').map(Number);
    const ep = String(effectiveEnd).split('-').map(Number);
    if (sp.length !== 3 || ep.length !== 3) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '—', startFormatted: '—', endFormatted: '—' };
    }
    const startUtc = Date.UTC(sp[0], sp[1] - 1, sp[2]);
    const endUtc = Date.UTC(ep[0], ep[1] - 1, ep[2]);
    if (isNaN(startUtc) || isNaN(endUtc) || endUtc < startUtc) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '—', startFormatted: '—', endFormatted: '—' };
    }
    const days = Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
    const returnDate = new Date(endUtc + 24 * 60 * 60 * 1000);
    const ry = returnDate.getUTCFullYear();
    const rm = String(returnDate.getUTCMonth() + 1).padStart(2, '0');
    const rd = String(returnDate.getUTCDate()).padStart(2, '0');
    const returnDateIso = `${ry}-${rm}-${rd}`;

    return {
      valid: true,
      days,
      startFormatted: formatDisplayDate(startDateStr),
      endFormatted: formatDisplayDate(effectiveEnd),
      returnDateIso,
      returnDateFormatted: formatDisplayDate(returnDateIso)
    };
  }

  function buildCertificatePayload(input = {}) {
    const typeKey = CERTIFICATE_TYPES[input.certificateType] ? input.certificateType : 'excuse_duty';
    const typeMeta = CERTIFICATE_TYPES[typeKey];
    const nowIso = new Date().toISOString();
    const todayIso = nowIso.split('T')[0];

    const consultationDate = input.consultationDate || todayIso;
    const startDate = input.startDate || consultationDate;
    const endDate = (typeKey === 'excuse_duty' || typeKey === 'light_duty')
      ? (input.endDate || startDate)
      : startDate;
    const schedule = calculateExcuseDutySchedule(startDate, endDate);

    const isDraftPreview = Boolean(input.isDraftPreview || !input.certificateId);
    const certificateId = input.certificateId ? String(input.certificateId).trim() : 'DRAFT-PREVIEW';
    const issuedAt = input.issuedAt || nowIso;

    // Resolve verification URL cleanly (only for issued certificates)
    let verifyUrl = input.verifyUrl ? String(input.verifyUrl).trim() : '';
    if (!verifyUrl && !isDraftPreview && typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
      verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(certificateId)}`;
    }
    const shortVerifyDisplay = verifyUrl.replace(/^https?:\/\//i, '');

    // Read clinic profile strictly from input — never invent fake license/address/phone
    const clinic = resolveClinicProfile({
      clinicName: input.clinicName || input.organization,
      practiceRegistrationNumber: input.practiceRegistrationNumber || input.licenseNumber,
      address: input.clinicAddress || input.address,
      phone: input.clinicPhone || input.phone,
      email: input.clinicEmail || input.email,
      clinicianName: input.clinicianName,
      clinicianSpecialty: input.clinicianSpecialty,
      mdcNumber: input.mdcNumber,
      signatureDataUrl: input.signatureDataUrl,
      signatureApproved: input.signatureApproved,
      stampDataUrl: input.stampDataUrl,
      stampApproved: input.stampApproved,
      clinicLogoDataUrl: input.clinicLogoDataUrl,
      clinicWatermarkDataUrl: input.clinicWatermarkDataUrl
    });

    const remarks = (input.remarks && String(input.remarks).trim()) || typeMeta.defaultRemarks;

    const safePatientSlug = String(input.patientName || 'Employee')
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'Employee';

    const fileName = `${isDraftPreview ? 'DRAFT_' : ''}Havilah_${typeMeta.slug}_${safePatientSlug}_${startDate}.pdf`;

    return {
      typeKey,
      typeMeta,
      isDraftPreview,
      certificateId,
      issuedAt,
      issuedTimestampFormatted: formatIssueTimestamp(issuedAt),
      issuedDateFormatted: formatDisplayDate(issuedAt),
      verifyUrl,
      shortVerifyDisplay,
      referenceCode: (input.referenceCode && String(input.referenceCode).trim()) || '—',
      patientName: (input.patientName && String(input.patientName).trim()) || '—',
      companyName: (input.companyName && String(input.companyName).trim()) || '—',
      departmentName: (input.departmentName && String(input.departmentName).trim()) || '—',
      consultationDate,
      consultationDateFormatted: formatDisplayDate(consultationDate),
      startDate,
      endDate,
      schedule,
      remarks,
      clinic,
      fileName
    };
  }

  async function renderExcuseDutyDoc(rawInput = {}) {
    const jsPDFClass = getJsPDFClass();
    if (!jsPDFClass) {
      throw new Error('PDF engine (jsPDF) is not loaded. Please refresh the page and try again.');
    }

    const data = buildCertificatePayload(rawInput);

    const pdf = new jsPDFClass({
      orientation: PAGE.orientation,
      unit: 'mm',
      format: PAGE.format,
      compress: true
    });

    // Accessible PDF document metadata
    pdf.setProperties({
      title: `${data.typeMeta.title} — ${data.certificateId}`,
      subject: 'Occupational Health Medical Certificate',
      author: data.clinic.clinicName || COPY.brandName,
      creator: 'Havilah Clinical Portal'
    });

    const [fonts, clinicLogoImg, fallbackLogoImg, watermarkImg, signatureImg, stampImg] = await Promise.all([
      Fonts.registerFonts(pdf, { includeSerif: true }),
      data.clinic.clinicLogoDataUrl
        ? Components.loadImageAsDataUrl(data.clinic.clinicLogoDataUrl)
        : Promise.resolve(null),
      Components.loadHavilahLogoDataUrl(),
      data.clinic.clinicWatermarkDataUrl
        ? Components.loadImageAsDataUrl(data.clinic.clinicWatermarkDataUrl)
        : Promise.resolve(null),
      data.clinic.signatureApproved
        ? Components.loadImageAsDataUrl(data.clinic.signatureDataUrl)
        : Promise.resolve(null),
      data.clinic.stampApproved
        ? Components.loadImageAsDataUrl(data.clinic.stampDataUrl)
        : Promise.resolve(null)
    ]);

    const logoDataUrl = clinicLogoImg || fallbackLogoImg;
    const m = PAGE.margin;
    const rightX = PAGE.width - m;

    // -------------------------------------------------------------------------
    // 0. OPTIONAL MONOCHROME CENTER WATERMARK (rendered first, strictly behind text)
    // -------------------------------------------------------------------------
    if (watermarkImg) {
      try {
        let wmW = 62;
        let wmH = 71;
        if (typeof pdf.getImageProperties === 'function') {
          const props = pdf.getImageProperties(watermarkImg);
          if (props && props.width > 0 && props.height > 0) {
            const scale = Math.min(70 / props.width, 72 / props.height);
            wmW = props.width * scale;
            wmH = props.height * scale;
          }
        }
        const wmX = (PAGE.width - wmW) / 2;
        const wmY = 108; // Centered behind the certification body
        pdf.addImage(watermarkImg, 'PNG', wmX, wmY, wmW, wmH, undefined, 'FAST');
      } catch (e) {
        // Non-blocking: omit watermark if image fails
      }
    }

    // -------------------------------------------------------------------------
    // 1. SLIM CLINICAL LETTERHEAD (read from clinic profile, omit unset fields)
    // -------------------------------------------------------------------------
    const brandMetaLines = [];
    if (data.clinic.practiceRegistrationNumber) {
      brandMetaLines.push(`Practice Reg. No.: ${data.clinic.practiceRegistrationNumber}`);
    }
    const contactLineParts = [];
    if (data.clinic.address) contactLineParts.push(data.clinic.address);
    if (data.clinic.phone) contactLineParts.push(`Tel: ${data.clinic.phone}`);
    if (contactLineParts.length) {
      brandMetaLines.push(contactLineParts.join('  ·  '));
    }

    let y = Components.drawHeader(pdf, fonts, {
      logoDataUrl,
      logoMaxWidth: 13.5,
      logoMaxHeight: 14.5,
      brandTitle: data.clinic.clinicName || COPY.brandName,
      brandSubtitle: 'Occupational Health Clinical Practice',
      brandMetaLines,
      documentTitle: data.isDraftPreview ? 'Draft preview (unissued)' : 'Medical certificate',
      referenceText: `Certificate ID: ${data.certificateId}`,
      dateText: `Issued: ${data.issuedTimestampFormatted}`
    });

    y += r(3);

    // -------------------------------------------------------------------------
    // 2. DOCUMENT TITLE (Sentence case, 20 pt, restrained — no badges/boxes)
    // -------------------------------------------------------------------------
    pdf.setFont(fonts.sans, 'bold');
    pdf.setFontSize(TYPE.hero);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(data.typeMeta.title, m, y);
    y += r(3.8);

    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.accent);
    pdf.text(data.typeMeta.shortLabel.toUpperCase(), m, y);
    y += r(5);

    // -------------------------------------------------------------------------
    // 3. TWO-COLUMN KEY-VALUE FIELDS (no card border spam, crisp 0.5pt rules)
    // -------------------------------------------------------------------------
    const colLeft = gridCol(1, 6);
    const colRight = gridCol(7, 6);

    const kvRows = [
      [
        { label: 'Patient / employee name', value: data.patientName },
        { label: 'Employer / organization', value: data.companyName }
      ],
      [
        { label: 'Department', value: data.departmentName },
        { label: 'Consultation reference', value: `${data.referenceCode}  (${data.consultationDateFormatted})` }
      ]
    ];

    if (data.typeKey === 'excuse_duty' || data.typeKey === 'light_duty') {
      kvRows.push([
        { label: 'Excused from', value: data.schedule.startFormatted },
        { label: 'Excused to (inclusive)', value: data.schedule.endFormatted }
      ]);
      kvRows.push([
        { label: 'Total duration', value: `${data.schedule.days} day${data.schedule.days === 1 ? '' : 's'}` },
        { label: 'Return-to-duty date', value: data.schedule.returnDateFormatted, emphasize: true }
      ]);
    } else if (data.typeKey === 'fit_to_return') {
      kvRows.push([
        { label: 'Certified fit to resume duty', value: data.schedule.startFormatted, emphasize: true },
        { label: 'Assessment date', value: data.consultationDateFormatted }
      ]);
    } else {
      kvRows.push([
        { label: 'Consultation attendance date', value: data.schedule.startFormatted, emphasize: true },
        { label: 'Certificate status', value: 'Attendance confirmed' }
      ]);
    }

    Components.drawRule(pdf, y, COLORS.ink);
    y += r(3.5);

    kvRows.forEach((pair, idx) => {
      const [leftItem, rightItem] = pair;

      const drawCell = (item, col) => {
        pdf.setFont(fonts.sans, fonts.semiboldStyle);
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(item.label.toUpperCase(), col.x, y);

        pdf.setFont(fonts.sans, item.emphasize ? 'bold' : fonts.semiboldStyle);
        pdf.setFontSize(TYPE.body);
        pdf.setTextColor(...(item.emphasize ? COLORS.accent : COLORS.ink));
        const valLines = pdf.splitTextToSize(String(item.value || '—'), col.width);
        pdf.text(valLines, col.x, y + 4.4);
        return valLines.length;
      };

      const lLines = drawCell(leftItem, colLeft);
      const rLines = drawCell(rightItem, colRight);
      const maxLines = Math.max(lLines, rLines, 1);

      y += 4.4 + (maxLines * 4.2) + r(1.5);
      Components.drawRule(pdf, y, idx === kvRows.length - 1 ? COLORS.ink : COLORS.rule);
      y += r(3.5);
    });

    y += r(3);

    // -------------------------------------------------------------------------
    // 4. FORMAL CERTIFICATION PARAGRAPH (Source Serif 4) + SINGLE PRIVACY LINE
    // -------------------------------------------------------------------------
    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    pdf.text('CLINICAL CERTIFICATION', m, y);
    y += r(4);

    // Formal serif salutation & certification body
    pdf.setFont(fonts.serif, 'normal');
    pdf.setFontSize(TYPE.subheading);
    pdf.setTextColor(...COLORS.ink);
    const certLines = pdf.splitTextToSize(data.remarks, PAGE.contentWidth);
    pdf.text(certLines, m, y, { lineHeightFactor: 1.55 });
    y += (certLines.length * 5.8) + r(4.5);

    // Single calm privacy-basis line (diagnosis omitted) — stated ONCE in the entire document
    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    const privacyLines = pdf.splitTextToSize(COPY.certificatePrivacyBasis, PAGE.contentWidth);
    pdf.text(privacyLines, m, y);
    y += (privacyLines.length * 3.8) + r(6);

    // -------------------------------------------------------------------------
    // 5. SIGNATURE BLOCK + CLINIC STAMP AREA
    // -------------------------------------------------------------------------
    // Anchor signature & verification nicely in the lower half without crowding
    const sigSectionY = Math.max(y, 174);
    Components.drawRule(pdf, sigSectionY, COLORS.rule);

    const sigCol = gridCol(1, 7);
    const stampCol = gridCol(8, 5);
    let sy = sigSectionY + r(5);

    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    pdf.text('ATTENDING CLINICIAN', sigCol.x, sy);
    pdf.text('OFFICIAL CLINIC STAMP', stampCol.x, sy);

    sy += r(4);

    // Helper to fit an image inside a box while preserving exact native aspect ratio
    const fitImageInBox = (imgDataUrl, maxW, maxH) => {
      try {
        const props = pdf.getImageProperties(imgDataUrl);
        if (props && props.width > 0 && props.height > 0) {
          const scale = Math.min(maxW / props.width, maxH / props.height);
          return { w: props.width * scale, h: props.height * scale };
        }
      } catch (e) {
        // Fallback below
      }
      return { w: maxW, h: maxH };
    };

    const getImgFormat = (imgDataUrl) => (/^data:image\/jpe?g/i.test(imgDataUrl) ? 'JPEG' : 'PNG');

    // Left: Signature image ONLY if clinician uploaded & approved one; otherwise blank signature line
    const sigBoxH = 16;
    if (signatureImg) {
      try {
        const fitted = fitImageInBox(signatureImg, 62, 13.5);
        const drawY = sy + sigBoxH - fitted.h - 1.5;
        pdf.addImage(signatureImg, getImgFormat(signatureImg), sigCol.x, drawY, fitted.w, fitted.h, undefined, 'FAST');
      } catch (e) {
        // Fallback to clean unsigned line if image fails
      }
    }

    const sigLineY = sy + sigBoxH;
    pdf.setDrawColor(...COLORS.ink);
    pdf.setLineWidth(PAGE.ruleWidth);
    pdf.line(sigCol.x, sigLineY, sigCol.x + 68, sigLineY);

    let credY = sigLineY + 4.5;
    if (!signatureImg) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text('Clinician signature', sigCol.x, credY);
      credY += 4.5;
    }

    if (data.clinic.clinicianName) {
      pdf.setFont(fonts.sans, 'bold');
      pdf.setFontSize(TYPE.subheading);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(data.clinic.clinicianName, sigCol.x, credY);
      credY += 4.5;
    }

    if (data.clinic.clinicianSpecialty) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(data.clinic.clinicianSpecialty, sigCol.x, credY);
      credY += 4.2;
    }

    if (data.clinic.mdcNumber) {
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(`MDC Registration No.: ${data.clinic.mdcNumber}`, sigCol.x, credY);
      credY += 4.0;
    }

    if (data.clinic.clinicName) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(data.clinic.clinicName, sigCol.x, credY);
      credY += 4.0;
    }

    // Right: Official Clinic Stamp Area
    const stampH = 34;
    if (stampImg) {
      // Render approved transparent clinic stamp image centered cleanly without paper background
      try {
        const fitted = fitImageInBox(stampImg, stampCol.width - 4, stampH - 4);
        const drawX = stampCol.x + ((stampCol.width - fitted.w) / 2);
        const drawY = sy + ((stampH - fitted.h) / 2) - 1;
        pdf.addImage(stampImg, getImgFormat(stampImg), drawX, drawY, fitted.w, fitted.h, undefined, 'FAST');
      } catch (e) {
        // Fallback to dotted placeholder if image fails
      }
    } else {
      pdf.setDrawColor(...COLORS.rule);
      pdf.setLineWidth(PAGE.ruleWidth);
      if (typeof pdf.setLineDashPattern === 'function') {
        pdf.setLineDashPattern([1.5, 1.5], 0);
      }
      pdf.rect(stampCol.x, sy, stampCol.width, stampH, 'S');
      if (typeof pdf.setLineDashPattern === 'function') {
        pdf.setLineDashPattern([], 0);
      }

      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      const stampCenterX = stampCol.x + (stampCol.width / 2);
      pdf.text('Practice stamp / seal', stampCenterX, sy + (stampH / 2) - 1, { align: 'center' });
      if (data.clinic.clinicName) {
        pdf.text(data.clinic.clinicName, stampCenterX, sy + (stampH / 2) + 3.5, { align: 'center' });
      }
    }

    // -------------------------------------------------------------------------
    // 6. VERIFICATION PANEL (THE ONE SUBTLE PANEL ON THIS PAGE — QR + URL)
    // -------------------------------------------------------------------------
    const verifyPanelH = 26;
    const verifyY = Math.max(credY + r(4), sy + stampH + r(6), PAGE.height - m - 14 - verifyPanelH);

    pdf.setFillColor(...COLORS.panelBg);
    pdf.rect(m, verifyY, PAGE.contentWidth, verifyPanelH, 'F');
    pdf.setFillColor(...COLORS.accent);
    pdf.rect(m, verifyY, 1.2, verifyPanelH, 'F');

    const qrSize = 20;
    const qrX = m + 5;
    const qrY = verifyY + 3;
    const qrDrawn = !data.isDraftPreview && data.verifyUrl
      ? Components.drawQrCode(pdf, data.verifyUrl, qrX, qrY, qrSize)
      : false;

    const vTextX = qrDrawn ? (qrX + qrSize + 6) : (m + 6);
    const vTextW = PAGE.width - m - vTextX - 4;

    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.accent);
    pdf.text(
      data.isDraftPreview ? 'DRAFT PREVIEW — NOT YET VERIFIABLE' : 'EMPLOYER VERIFICATION',
      vTextX,
      verifyY + 7
    );

    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.ink);
    if (data.isDraftPreview) {
      const draftNote = pdf.splitTextToSize(
        'Issue this certificate from the clinician portal to generate a registered verification ID and scannable QR code.',
        vTextW
      );
      pdf.text(draftNote, vTextX, verifyY + 11.8);
    } else {
      const verifyNote = pdf.splitTextToSize(
        'Scan the QR code or visit the verification URL below to confirm validity, issue date, and issuing clinic. No medical details are disclosed.',
        vTextW
      );
      pdf.text(verifyNote, vTextX, verifyY + 11.5);

      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.accent);
      const urlLine = data.shortVerifyDisplay || data.verifyUrl || `Certificate ID: ${data.certificateId}`;
      pdf.text(urlLine, vTextX, verifyY + 21.8);
    }

    // -------------------------------------------------------------------------
    // 7. FOOTER (Reference ID + Page 1 of 1; no duplicate privacy sentence)
    // -------------------------------------------------------------------------
    Components.drawFooter(pdf, fonts, {
      leftText: `Certificate ID: ${data.certificateId}  ·  Issued ${data.issuedTimestampFormatted}`,
      pageNumber: 1,
      totalPages: 1,
      includePrivacyLine: false
    });

    return { pdf, data };
  }

  async function buildExcuseDutyPdf(rawInput = {}) {
    const { pdf, data } = await renderExcuseDutyDoc(rawInput);
    const dataUri = pdf.output('datauristring');
    const base64Part = dataUri.split(',')[1] || '';
    const blobSize = Math.round((base64Part.length * 3) / 4);

    return {
      dataUri,
      blobSize,
      fileName: data.fileName,
      certificateId: data.certificateId,
      data
    };
  }

  async function downloadExcuseDutyPdf(rawInput = {}) {
    const { pdf, data } = await renderExcuseDutyDoc(rawInput);
    pdf.save(data.fileName);
    return {
      fileName: data.fileName,
      certificateId: data.certificateId,
      data
    };
  }

  return {
    CERTIFICATE_TYPES,
    calculateExcuseDutySchedule,
    buildCertificatePayload,
    buildExcuseDutyPdf,
    downloadExcuseDutyPdf
  };
}));
