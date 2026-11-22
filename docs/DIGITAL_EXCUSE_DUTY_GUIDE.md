# Digital Excuse Duty & Verification User Guide

## 1. Overview: What Digital Excuse Duty Does

The Havilah Digital Excuse Duty system lets licensed clinicians issue official, privacy-safe, tamper-evident medical certificates directly from a patient's referral workspace. Every certificate receives:

1. **A unique verifiable Certificate ID** (`HVL-XXXX-XXXX-XXXX`) checked with an HMAC-SHA256 cryptographic signature.
2. **A scannable QR code and verification web link** (`/verify/HVL-XXXX-XXXX-XXXX`) that allows employers and HR teams to confirm authenticity in seconds without phone calls.
3. **A SHA-256 PDF file seal** that detects if a single date, word, or digit in the downloaded PDF file was changed after the doctor issued it.
4. **Confidentiality protection by default**, omitting sensitive medical diagnoses in line with the Ghana Data Protection Act, 2012 (Act 843) and ISO 45003.

---

## 2. One-Time Clinic & Clinician Setup (Before Issuing Certificates)

Before issuing official certificates under Ghanaian regulatory requirements, complete these steps once in the **Medical Assessor Portal** (`clinical-portal.html`):

1. **Open Clinic settings** from the top navigation bar.
2. **Enter your Clinic or organization name** (for example, `FZ Safety and Health Centre`).
3. **Enter your HeFRA / practice registration no.** (Health Facilities Regulatory Agency facility registration or licence number under Act 829). Certificates cannot be issued without this number.
4. **Enter your Clinician MDC registration no.** (Medical and Dental Council registration or annual retention number under Act 857).
5. **Enter licence expiry dates (optional but recommended):** Set your **HeFRA licence expiry** and **MDC annual retention expiry** so the portal warns you automatically when renewals are due.
6. **Upload and approve your Clinician signature:** Upload a clean PNG or JPEG image (under 250 KB) and tick **Approve this signature image for clinician-issued medical certificates**.
7. **Upload and approve your Official clinic stamp:** Upload a clean PNG or JPEG stamp image (under 250 KB) and tick **Approve this clinic stamp for clinician-issued medical certificates**.
8. **Enable Two-Factor Authentication (2FA):** In the same **Clinic settings** window, click **Configure 2FA**, scan or copy the setup key into your authenticator app, and save your backup recovery codes. 2FA strengthens practitioner non-repudiation under the Electronic Transactions Act, 2008 (Act 772).
9. **Save settings.**

**For Clinic Administrators adding Staff Doctors:**
Open **Clinic staff** in the top bar, select **Add clinician**, enter the doctor's full name (with title), login email, specialty, **MDC registration no.**, and role, then save. Each staff doctor can sign in and approve their own personal signature inside **Clinic settings**.

---

## 3. Clinician Guide: Issuing a Digital Excuse Duty Certificate

Follow these steps inside the Medical Assessor Portal after examining the patient:

1. **Open the referral case:** Click **Open** on the patient's row in the **Referrals** queue.
2. **Switch to the certificate tab:** In the left pane of the case window, select **Certificates & documents**.
3. **Choose Certificate type:**
   - **Excuse Duty (Sick Leave):** Excuses the employee from work for a specific inclusive date range (`From date` to `To date`) and automatically calculates total leave days and the next **Return-to-duty date**.
   - **Fit for Light / Modified Duty:** Approves temporary modified work duties across an inclusive date range.
   - **Fit to Return to Work:** Clears an employee to resume regular duties on the specified date.
   - **Consultation Attendance Note:** Confirms the employee attended a medical consultation on the specified date.
4. **Confirm clinician & consultation details:**
   - **MDC reg. number *:** Pre-filled from your profile; verify it is accurate.
   - **Date of examination *:** Date you actually conducted the clinical assessment.
   - **Consultation modality *:** Select **In-person clinical examination** or **Telehealth / virtual consultation**.
   - **From date * / To date (inclusive) *:** If `From date` is earlier than the `Date of examination`, the portal displays a **Backdated leave notice** reminding you to document clinical justification in your case notes in accordance with MDC Ghana guidelines.
   - **Employee / staff ID (optional):** Helps HR match attendance records; printed on the PDF only and never exposed on the public QR verification page.
5. **Review remarks and HR-safe privacy mode:**
   - **HR-safe privacy mode** is checked by default so confidential medical diagnoses are omitted.
   - Only uncheck it if the patient explicitly consents to specific clinical disclosure under the Data Protection Act, 2012 (Act 843).
6. **Confirm clinician attestation:** Read and tick the mandatory checkbox: *"I certify that I personally examined this patient and authorize my MDC credentials, signature, and clinic stamp on this electronic certificate under Ghana Act 857 and Act 772."*
7. **Preview or Issue:**
   - Click **Preview PDF** at any time to download an unissued `DRAFT` copy (`DRAFT PREVIEW - NOT YET VERIFIABLE`) for visual checking. Drafts are not registered and do not have a scannable verification QR code.
   - Click **Issue & send to employee** when ready. Behind the scenes, the platform registers the authoritative record on the server, builds the A4 PDF with QR code, computes the exact **SHA-256** digest of the PDF file, seals that digest onto the server record, attaches the PDF to the case, and sends a confirmation message in the patient chat thread.

---

## 4. Clinician Guide: Revoking & Re-Issuing a Certificate

If you notice an error (such as a typo in dates) after issuing a certificate, do **not** simply delete the PDF attachment. Always revoke the wrong certificate first so employers cannot validate an outdated PDF:

1. Open the referral case and go to **Certificates & documents**.
2. Under **Registered digital certificates**, find the Certificate ID (`HVL-XXXX-XXXX-XXXX`).
3. Click **Revoke**.
4. Enter a clear **Reason for revocation** (minimum 5 characters, for example: *"Incorrect return-to-duty date entered; superseded by revised certificate."*).
5. Click **Revoke certificate**.
6. Anyone scanning that certificate's QR code immediately sees **Certificate revoked** with the revocation date. You can then issue a corrected certificate right away.

Every issuance, SHA-256 seal, and revocation is recorded permanently in the hash-chained **AuditLog** (`CERTIFICATE_ISSUED`, `CERTIFICATE_SEALED`, `CERTIFICATE_REVOKED`).

---

## 5. Employee Guide: Opening, Downloading & Sharing Your Certificate

1. Open your Havilah dashboard (`dashboard.html`) and go to your referral / consultation tracking view.
2. When your doctor issues a certificate, it appears automatically under **Clinical Documents** (and a message appears in your consultation chat).
3. You have two buttons next to the PDF:
   - **Open PDF:** Opens the PDF directly in a new browser tab for instant viewing.
   - **Download:** Saves the official `.pdf` file cleanly to your device (`Havilah_Excuse_Duty_<Name>_<Date>.pdf`).
4. Send the **unmodified downloaded `.pdf` file** to your employer or HR team (do not edit, resave in another PDF tool, re-print to PDF, or take a screenshot if HR will run the SHA-256 tamper check).

---

## 6. Employer / HR Guide: Verifying Authenticity & Checking for Tampering

Employers and HR officers can verify any Havilah Excuse Duty certificate in under 15 seconds without calling the hospital or seeing private medical details:

### Part A: Instant QR / ID Check
1. **Scan the QR code** printed in the verification box at the bottom of the PDF (or visit `/verify` on the Havilah portal and type the `HVL-XXXX-XXXX-XXXX` Certificate ID).
2. Confirm the status banner shows green **Valid certificate**.
   - If the banner is red (**Certificate revoked** or **Certificate not verified**), do **not** accept the document and contact the issuing clinic if clarification is needed.
3. Cross-check the displayed details against your PDF:
   - **Certificate ID**
   - **Certificate type** and **Certified duration** (number of days, if applicable)
   - **Consultation modality** (In-person or Telehealth)
   - **Issuing clinic** and **HeFRA / Practice Reg. No.**
   - **Attending clinician** and **MDC Reg. No.**
   - **Issue date (UTC)**

### Part B: 10-Second PDF File Tamper Check (SHA-256)
Because QR codes prove a certificate ID exists, **Step B** proves the PDF file itself was not edited after issuance (for example, changing "1 day" to "5 days" in a PDF editor):

1. On the same `/verify` page, scroll to **Verify PDF file authenticity (SHA-256 tamper check)**.
2. Click or drop the employee's `.pdf` file into the verification box.
   - **Privacy note:** Your PDF stays completely on your computer. Your browser calculates the SHA-256 fingerprint locally and sends only that fingerprint string to verify.
3. Check the result:
   - Green **Authentic unedited PDF:** The file is 100% identical byte for byte to what the doctor issued.
   - Red **Warning: File mismatch detected:** Either the wrong PDF was selected, a PDF editor altered the file, or the employee re-exported/re-compressed the PDF (ask the employee to resend the original downloaded `.pdf` file from Havilah).

---

## 7. Ghana Regulatory Compliance Reference

| Framework / Act | Requirement Covered by Havilah Technical Controls |
| --- | --- |
| **Health Professions Regulatory Bodies Act, 2013 (Act 857) & Medical and Dental Council (MDC) Ghana** | Mandatory clinician **MDC registration number** on server validation and PDF; documented **Date of examination**, **Consultation modality**, **Backdated leave warning**, personal **Clinician attestation** prior to issuance, approved **Clinician signature**, and optional **MDC annual retention expiry** alerts. |
| **Health Institutions and Facilities Act, 2011 (Act 829) / HeFRA** | Mandatory **HeFRA / practice registration no.** configured in Clinic settings before official issuance, printed directly on the clinic letterhead and public verification record, with **HeFRA licence expiry** tracking and **Official clinic stamp** support. |
| **Electronic Transactions Act, 2008 (Act 772) Sections 6, 7, 10, 11 & 12** | **Tamper-evident electronic integrity:** Server-side HMAC-SHA256 signature binding all authoritative certificate fields (`schemaVersion: 2`), immutable **SHA-256 PDF seal** (`pdfSha256`) checked in constant time, **2FA status tracking** and authenticated session identity, revocation lifecycle, and append-only SHA-256 hash-chained **AuditLog**. |
| **Data Protection Act, 2012 (Act 843)** | **Medical confidentiality by default:** HR-safe privacy mode omits diagnoses on certificates; explicit consent warning when privacy omission is unchecked; public `/verify` API exposes zero patient names, staff IDs, diagnoses, or dates of leave. |
| **Labour Act, 2003 (Act 651)** | Clear statement of **Certified fitness / excused period**, **Total duration (days)**, **Return-to-duty date**, and **Consultation attendance** formatted for statutory sick-leave administration. |

### Deployment Note for System Administrators
In production, set a dedicated, high-entropy environment variable **`CERTIFICATE_SIGNING_SECRET`** (separate from `JWT_SECRET`) on the backend server so certificate HMAC keys remain independent of session JWT key rotations. Never rotate `CERTIFICATE_SIGNING_SECRET` without keeping verification compatibility for previously issued certificates.

---

## 8. Troubleshooting FAQ

- **Previously I clicked Download and got "We can't open this file" in Microsoft Edge. Is this fixed?**
  - **Yes.** The PDF engine previously emitted an extra `;filename=generated.pdf;` parameter inside its data URI, which caused the portal security sanitizer to block the link (`href="#"`) and download an HTML file renamed as `.pdf`. Now the generator outputs clean `data:application/pdf;base64,...` bytes, downloads/opens via reliable browser `Blob` URLs, and the sanitizers automatically repair legacy saved certificates as well.
- **Why does "Issue & send to employee" say HeFRA or MDC number is required?**
  - To ensure every certificate meets Ghanaian statutory scrutiny, both the clinic's **HeFRA / practice registration no.** (in **Clinic settings**) and the practitioner's **MDC reg. number** must be filled in before official registration.
- **Can a scanned photo of a printed certificate pass the SHA-256 PDF Tamper Check?**
  - No. Scanning a paper printout creates new image bytes with a different SHA-256 hash. For paper copies, HR should rely on scanning the QR code (Part A) and visually matching the Certificate ID, dates, duration, clinic HeFRA number, and clinician MDC number shown on screen against the printed paper. Only the original electronic PDF downloaded from Havilah matches the SHA-256 seal.
