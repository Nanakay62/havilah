/**
 * @fileoverview excuseDutyPdf.js
 * Client-side Digital Excuse Duty & Medical Certificate PDF generator for Havilah Clinicians.
 *
 * Generates an executive, HR-safe A4 PDF certificate with the Havilah mark, clinic letterhead,
 * patient details, excused period, return-to-duty date, attending clinician credentials,
 * optional Medical & Dental Council (MDC) Registration Number, and unique verification ID.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExcuseDutyPdf = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let cachedLogoDataUrl = null;

  const CERTIFICATE_TYPES = {
    excuse_duty: {
      title: 'MEDICAL EXCUSE DUTY CERTIFICATE',
      badge: 'EXCUSE DUTY (SICK LEAVE)',
      slug: 'Excuse_Duty',
      defaultRemarks: 'Following a confidential clinical consultation, the employee named above has been medically assessed and is advised rest from work duties for the excused period indicated above. They are expected to resume regular duties on the return-to-duty date specified.'
    },
    light_duty: {
      title: 'FIT FOR LIGHT / MODIFIED DUTY CERTIFICATE',
      badge: 'MODIFIED / LIGHT DUTY',
      slug: 'Light_Duty_Certificate',
      defaultRemarks: 'Following a confidential clinical consultation, the employee named above is medically fit to work under temporary modified or light duties for the period indicated above, with reduced physical or high-stress workload as appropriate.'
    },
    fit_to_return: {
      title: 'FIT TO RETURN TO WORK CERTIFICATE',
      badge: 'FIT TO RETURN TO WORK',
      slug: 'Fit_To_Return_Certificate',
      defaultRemarks: 'Following a confidential clinical evaluation, the employee named above has been medically assessed and is certified fit to resume regular workplace duties on the date indicated.'
    },
    attendance: {
      title: 'MEDICAL CONSULTATION ATTENDANCE CERTIFICATE',
      badge: 'CONSULTATION ATTENDANCE',
      slug: 'Medical_Attendance_Certificate',
      defaultRemarks: 'This certifies that the employee named above attended a confidential occupational health consultation with our clinical practice on the consultation date indicated.'
    }
  };

  function getJsPDFClass() {
    return (typeof window !== 'undefined' && ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF)) || null;
  }

  async function loadHavilahLogoDataUrl() {
    if (cachedLogoDataUrl) return cachedLogoDataUrl;
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeoutId = setTimeout(() => resolve(null), 2500);

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 280;
          canvas.height = 215;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          cachedLogoDataUrl = canvas.toDataURL('image/png');
          resolve(cachedLogoDataUrl);
        } catch (err) {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };

      img.src = '/assets/havilah-mark.svg';
    });
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return String(dateStr);
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function calculateExcuseDutySchedule(startDateStr, endDateStr) {
    if (!startDateStr) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '-', startFormatted: '-', endFormatted: '-' };
    }
    const effectiveEnd = endDateStr || startDateStr;
    const sp = String(startDateStr).split('-').map(Number);
    const ep = String(effectiveEnd).split('-').map(Number);
    if (sp.length !== 3 || ep.length !== 3) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '-', startFormatted: '-', endFormatted: '-' };
    }
    const startUtc = Date.UTC(sp[0], sp[1] - 1, sp[2]);
    const endUtc = Date.UTC(ep[0], ep[1] - 1, ep[2]);
    if (isNaN(startUtc) || isNaN(endUtc) || endUtc < startUtc) {
      return { valid: false, days: 0, returnDateIso: '', returnDateFormatted: '-', startFormatted: '-', endFormatted: '-' };
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

  function generateCertificateId(referenceCode) {
    const cleanRef = String(referenceCode || '').replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase() || 'HAVILAH';
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `EXD-${cleanRef}-${rand}`;
  }

  function buildCertificatePayload(input = {}) {
    const typeKey = CERTIFICATE_TYPES[input.certificateType] ? input.certificateType : 'excuse_duty';
    const typeMeta = CERTIFICATE_TYPES[typeKey];
    const todayIso = new Date().toISOString().split('T')[0];

    const consultationDate = input.consultationDate || todayIso;
    const startDate = input.startDate || consultationDate;
    const endDate = input.endDate || startDate;
    const schedule = calculateExcuseDutySchedule(startDate, endDate);

    const hrSafePrivacy = input.hrSafePrivacy !== false;
    const remarks = (input.remarks && String(input.remarks).trim()) || typeMeta.defaultRemarks;
    const certificateId = input.certificateId || generateCertificateId(input.referenceCode);

    const safePatientSlug = String(input.patientName || 'Employee')
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'Employee';

    const fileName = `Havilah_${typeMeta.slug}_${safePatientSlug}_${startDate}.pdf`;

    return {
      typeKey,
      typeMeta,
      certificateId,
      referenceCode: input.referenceCode || '-',
      patientName: (input.patientName || 'Employee').trim(),
      companyName: (input.companyName || 'Organization').trim(),
      departmentName: (input.departmentName || 'General').trim(),
      consultationDate,
      consultationDateFormatted: formatDisplayDate(consultationDate),
      startDate,
      endDate,
      schedule,
      hrSafePrivacy,
      remarks,
      clinicianName: (input.clinicianName || 'Attending Clinician').trim(),
      clinicianSpecialty: (input.clinicianSpecialty || 'Occupational Health Practitioner').trim(),
      mdcNumber: (input.mdcNumber || '').trim(),
      clinicName: (input.clinicName || 'FZ Safety and Health').trim(),
      clinicPhone: (input.clinicPhone || '024 362 9870').trim(),
      issuedDateFormatted: formatDisplayDate(todayIso),
      fileName
    };
  }

  async function renderExcuseDutyDoc(rawInput = {}) {
    const jsPDFClass = getJsPDFClass();
    if (!jsPDFClass) {
      throw new Error('PDF engine (jsPDF) is not loaded. Please refresh the page and try again.');
    }

    const data = buildCertificatePayload(rawInput);
    const logoDataUrl = await loadHavilahLogoDataUrl();

    const pdf = new jsPDFClass({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210 mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297 mm
    const margin = 18;
    const contentWidth = pageWidth - (margin * 2); // 174 mm

    const colors = {
      navy: [15, 23, 42],
      teal: [15, 118, 110],
      tealLight: [240, 253, 250],
      tealBorder: [153, 246, 228],
      slate: [71, 85, 105],
      slateMuted: [100, 116, 139],
      border: [226, 232, 240],
      bgSoft: [248, 250, 252],
      white: [255, 255, 255]
    };

    // Top Teal Accent Bar + Dark Navy Letterhead
    pdf.setFillColor(...colors.teal);
    pdf.rect(0, 0, pageWidth, 4, 'F');
    pdf.setFillColor(...colors.navy);
    pdf.rect(0, 4, pageWidth, 32, 'F');

    let brandX = margin;
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'PNG', margin, 12.5, 17, 13.1);
        brandX = margin + 21;
      } catch (e) {
        brandX = margin;
      }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13.5);
    pdf.setTextColor(...colors.white);
    pdf.text(data.clinicName.toUpperCase(), brandX, 18);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Occupational Health Clinical Practice | Havilah Partner Network', brandX, 24.5);
    pdf.text(`Clinic Contact: ${data.clinicPhone}`, brandX, 30);

    // Right Header Meta
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(45, 212, 191);
    pdf.text('OFFICIAL DIGITAL CERTIFICATE', pageWidth - margin, 17, { align: 'right' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(203, 213, 225);
    pdf.text(`Cert ID: ${data.certificateId}`, pageWidth - margin, 23.5, { align: 'right' });
    pdf.text(`Issued: ${data.issuedDateFormatted}`, pageWidth - margin, 29.5, { align: 'right' });

    let y = 46;

    // Document Title Banner
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(...colors.navy);
    pdf.text(data.typeMeta.title, pageWidth / 2, y, { align: 'center' });

    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    const badgeW = Math.max(48, pdf.getTextWidth(data.typeMeta.badge) + 12);
    pdf.setFillColor(...colors.tealLight);
    pdf.setDrawColor(...colors.teal);
    pdf.setLineWidth(0.35);
    pdf.roundedRect((pageWidth - badgeW) / 2, y, badgeW, 6.5, 3, 3, 'FD');
    pdf.setTextColor(...colors.teal);
    pdf.text(data.typeMeta.badge, pageWidth / 2, y + 4.4, { align: 'center' });

    y += 14;

    // Section 1: Patient & Employer Details Card
    pdf.setFillColor(...colors.bgSoft);
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(margin, y, contentWidth, 34, 2.5, 2.5, 'FD');

    const colL = margin + 6;
    const colR = margin + (contentWidth / 2) + 4;

    const drawField = (label, value, x, fy) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.2);
      pdf.setTextColor(...colors.slateMuted);
      pdf.text(label.toUpperCase(), x, fy);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.8);
      pdf.setTextColor(...colors.navy);
      pdf.text(String(value || '-'), x, fy + 5.2);
    };

    drawField('Employee / Patient Name', data.patientName, colL, y + 7.5);
    drawField('Employer / Organization', data.companyName, colR, y + 7.5);
    drawField('Department', data.departmentName, colL, y + 21.5);
    drawField('Consultation Reference & Date', `${data.referenceCode}  (${data.consultationDateFormatted})`, colR, y + 21.5);

    y += 42;

    // Section 2: Excuse Duty Period Highlight Box (for excuse_duty / light_duty / fit_to_return)
    if (data.typeKey === 'excuse_duty' || data.typeKey === 'light_duty') {
      pdf.setFillColor(...colors.tealLight);
      pdf.setDrawColor(...colors.teal);
      pdf.setLineWidth(0.45);
      pdf.roundedRect(margin, y, contentWidth, 28, 2.5, 2.5, 'FD');

      const boxColW = contentWidth / 4;
      const periodItems = [
        { label: 'FROM DATE', val: data.schedule.startFormatted },
        { label: 'TO DATE (INCLUSIVE)', val: data.schedule.endFormatted },
        { label: 'TOTAL DURATION', val: `${data.schedule.days} Day${data.schedule.days === 1 ? '' : 's'}` },
        { label: 'RETURN TO DUTY', val: data.schedule.returnDateFormatted }
      ];

      periodItems.forEach((p, idx) => {
        const px = margin + (idx * boxColW) + (boxColW / 2);
        if (idx > 0) {
          pdf.setDrawColor(153, 246, 228);
          pdf.setLineWidth(0.3);
          pdf.line(margin + (idx * boxColW), y + 5, margin + (idx * boxColW), y + 23);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.teal);
        pdf.text(p.label, px, y + 9.5, { align: 'center' });

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setTextColor(...colors.navy);
        pdf.text(p.val, px, y + 18.5, { align: 'center' });
      });

      y += 36;
    } else if (data.typeKey === 'fit_to_return') {
      pdf.setFillColor(...colors.tealLight);
      pdf.setDrawColor(...colors.teal);
      pdf.setLineWidth(0.45);
      pdf.roundedRect(margin, y, contentWidth, 22, 2.5, 2.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...colors.teal);
      pdf.text('CERTIFIED FIT TO RESUME DUTY ON', pageWidth / 2, y + 8.5, { align: 'center' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(...colors.navy);
      pdf.text(data.schedule.startFormatted, pageWidth / 2, y + 16.5, { align: 'center' });
      y += 30;
    }

    // Section 3: Medical Certification & Workplace Recommendations
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...colors.navy);
    pdf.text('Clinical Certification & Workplace Recommendation', margin, y);
    y += 4.5;

    const remarksLines = pdf.splitTextToSize(data.remarks, contentWidth - 12);
    const remarksH = Math.max(26, (remarksLines.length * 5.2) + 12);
    pdf.setFillColor(...colors.white);
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(margin, y, contentWidth, remarksH, 2.5, 2.5, 'FD');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.2);
    pdf.setTextColor(30, 41, 59);
    pdf.text(remarksLines, margin + 6, y + 8);

    y += remarksH + 7;

    // HR Privacy Confidentiality Notice
    if (data.hrSafePrivacy) {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...colors.teal);
      pdf.text('MEDICAL PRIVACY COMPLIANCE (GHANA DATA PROTECTION ACT 843 & ISO 45003)', margin + 5, y + 5.8);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.6);
      pdf.setTextColor(...colors.slate);
      pdf.text('Clinical diagnosis and medical notes are intentionally omitted from this certificate to protect patient confidentiality.', margin + 5, y + 11.4);

      y += 23;
    }

    // Section 4: Attending Clinician & Digital Authorization Block
    pdf.setFillColor(...colors.bgSoft);
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(margin, y, contentWidth, 44, 2.5, 2.5, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.teal);
    pdf.text('ATTENDING CLINICIAN AUTHORIZATION', margin + 6, y + 8);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...colors.navy);
    pdf.text(data.clinicianName, margin + 6, y + 16);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...colors.slate);
    pdf.text(data.clinicianSpecialty, margin + 6, y + 21.5);
    pdf.text(data.clinicName, margin + 6, y + 27);

    if (data.mdcNumber) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...colors.navy);
      pdf.text(`Medical & Dental Council (MDC) Reg. No.: ${data.mdcNumber}`, margin + 6, y + 33.5);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.8);
    pdf.setTextColor(...colors.slateMuted);
    pdf.text(`Practice Contact: ${data.clinicPhone}`, margin + 6, y + 39.5);

    // Digital Signature Stamp on Right Side
    const stampX = pageWidth - margin - 58;
    pdf.setFillColor(...colors.white);
    pdf.setDrawColor(...colors.teal);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(stampX, y + 7, 52, 30, 2, 2, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.teal);
    pdf.text('DIGITALLY SIGNED & ISSUED', stampX + 26, y + 13.5, { align: 'center' });

    pdf.setFont('helvetica', 'bolditalic');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...colors.navy);
    const sigLines = pdf.splitTextToSize(data.clinicianName, 46);
    pdf.text(sigLines[0], stampX + 26, y + 22, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.slateMuted);
    pdf.text(`Date: ${data.issuedDateFormatted}`, stampX + 26, y + 29, { align: 'center' });
    pdf.text(`ID: ${data.certificateId}`, stampX + 26, y + 33.5, { align: 'center' });

    // Footer
    const footerY = pageHeight - 18;
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY, pageWidth - margin, footerY);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.slate);
    pdf.text('ISSUED VIA HAVILAH CLINICAL PORTAL  |  EMPLOYER VERIFICATION: CONTACT ISSUING CLINIC WITH CERTIFICATE ID', margin, footerY + 5.5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.slateMuted);
    pdf.text('Page 1 of 1', pageWidth - margin, footerY + 5.5, { align: 'right' });

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
