# Havilah Motion Video Brief (video/brief.md)

## 1. Overview

Havilah is a clinical-grade workplace psychosocial health and wellbeing platform designed for confidential employee check-ins and aggregate risk intelligence. It enables organizations to measure psychological safety and psychosocial hazards across standardized, validated screening instruments while strictly safeguarding individual employee anonymity.

- **The "Before"**: Organizations rely on fragmented, manual spreadsheets, paper forms, or unverified surveys with zero privacy guarantees. Employees fear stigma or negative career repercussions and withhold honest feedback. When clinical care is needed, referral pathways are ad-hoc, uncoordinated, and lack confidentiality.
- **The "After"**: Employees complete private, self-guided check-ins on their own devices with their identities concealed from management. HR leadership receives real-time, aggregated wellbeing distributions and trend indicators only when five or more employees respond in a cohort. When an employee requires clinical guidance, the platform routes a confidential triage referral identified solely by an anonymous reference code directly to a licensed medical assessor for secure text messaging.

---

## 2. Design Tokens (Source: `public/css/tokens.css`)

All colors, typography, spacing, radii, and shadows match `public/css/tokens.css` exactly without approximation.

### Color Palette
- `--bg`: `#F8FAFC` (slate-50 background)
- `--surface`: `#FFFFFF` (pure white surface)
- `--border`: `#E2E8F0` (slate-200 border)
- `--text`: `#0F172A` (slate-900 primary text)
- `--text-muted`: `#475569` (slate-600 secondary text)
- `--text-subtle`: `#64748B` (slate-500 muted text)
- `--brand`: `#0F766E` (teal-700 primary brand)
- `--brand-hover`: `#115E59` (teal-800 hover brand)
- `--brand-subtle`: `#F0FDFA` (teal-50 soft background)
- `--brand-deep`: `#134E4A` (teal-900 contrast banner)
- `--success`: `#15803D` (green-700)
- `--success-bg`: `#F0FDF4` (green-50)
- `--warning`: `#B45309` (amber-700)
- `--warning-bg`: `#FFFBEB` (amber-50)
- `--danger`: `#B91C1C` (red-700)
- `--danger-bg`: `#FEF2F2` (red-50)
- `--info`: `#1D4ED8` (blue-700)
- `--info-bg`: `#EFF6FF` (blue-50)

#### Chart Series Palette
- `--chart-1`: `#0F766E` (Teal)
- `--chart-2`: `#1D4ED8` (Blue)
- `--chart-3`: `#B45309` (Amber)
- `--chart-4`: `#15803D` (Green)
- `--chart-5`: `#64748B` (Slate)

### Typography
- **Font Stack**: `"Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Scale**:
  - `--text-xs`: `12px`
  - `--text-sm`: `13px`
  - `--text-base`: `14px`
  - `--text-md`: `16px`
  - `--text-lg`: `20px`
  - `--text-xl`: `24px`
  - `--text-2xl`: `30px`
- **Weights**:
  - `--weight-regular`: `400`
  - `--weight-medium`: `500`
  - `--weight-semibold`: `600`

### Spacing Scale (4px base)
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-6`: `24px`
- `--space-8`: `32px`
- `--space-12`: `48px`

### Radii Scale
- `--radius-control`: `6px`
- `--radius-card`: `8px`
- `--radius-modal`: `12px`
- `--radius-full`: `9999px`

### Shadows
- `--shadow-card`: `0 1px 2px rgba(16, 24, 40, 0.06)`
- `--shadow-overlay`: `0 12px 24px -4px rgba(16, 24, 40, 0.12), 0 4px 8px -2px rgba(16, 24, 40, 0.06)`

---

## 3. Three Hero Components (Self-Contained HTML & CSS)

These components are designed with Lucide icons (stroke width 1.5), exact design tokens, and strictly fictional sample data.

### Component A: Employee Check-in Card

```html
<!-- Component A: Employee Check-in Card -->
<style>
  .hero-checkin-card {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-6);
    max-width: 480px;
    font-family: var(--font-sans);
    color: var(--text);
  }
  .checkin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }
  .checkin-title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .checkin-step {
    font-size: var(--text-xs);
    color: var(--text-subtle);
  }
  .checkin-progress-track {
    height: 6px;
    background-color: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: var(--space-4);
  }
  .checkin-progress-fill {
    width: 67%;
    height: 100%;
    background-color: var(--brand);
    border-radius: 3px;
  }
  .checkin-question {
    font-size: var(--text-base);
    color: var(--text);
    line-height: 1.5;
    margin-bottom: var(--space-4);
  }
  .checkin-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .checkin-option-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background-color: var(--surface);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .checkin-option-btn.selected {
    border-color: var(--brand);
    background-color: var(--brand-subtle);
    color: var(--brand-deep);
    font-weight: var(--weight-semibold);
  }
  .checkin-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .checkin-privacy-note {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-subtle);
  }
  .checkin-submit-btn {
    height: 36px;
    padding: 0 var(--space-4);
    background-color: var(--brand);
    color: #FFFFFF;
    border: none;
    border-radius: var(--radius-control);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
</style>

<div class="hero-checkin-card">
  <div class="checkin-header">
    <span class="checkin-title">Today's Check-in: PSS-10</span>
    <span class="checkin-step">Step 2 of 3 · 67% complete</span>
  </div>
  <div class="checkin-progress-track">
    <div class="checkin-progress-fill"></div>
  </div>
  <p class="checkin-question">
    "In the last month, how often have you felt confident in handling personal problems?"
  </p>
  <div class="checkin-options-grid">
    <button type="button" class="checkin-option-btn">Never</button>
    <button type="button" class="checkin-option-btn">Rarely</button>
    <button type="button" class="checkin-option-btn selected">Fairly often</button>
    <button type="button" class="checkin-option-btn">Very often</button>
  </div>
  <div class="checkin-footer">
    <div class="checkin-privacy-note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Responses stay anonymous</span>
    </div>
    <button type="button" class="checkin-submit-btn">Continue check-in</button>
  </div>
</div>
```

---

### Component B: Medical Assessor Referral Queue with Chat Panel

```html
<!-- Component B: Medical Assessor Referral Queue with Chat Panel -->
<style>
  .hero-assessor-console {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    display: grid;
    grid-template-columns: 220px 1fr;
    max-width: 720px;
    height: 380px;
    font-family: var(--font-sans);
    overflow: hidden;
  }
  .assessor-queue-pane {
    background-color: var(--bg);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: var(--space-3);
    gap: var(--space-2);
  }
  .queue-pane-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .queue-item {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
  }
  .queue-item.active {
    border-color: var(--brand);
    box-shadow: 0 0 0 1px var(--brand);
  }
  .queue-item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .queue-code {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .badge-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-control);
    font-weight: var(--weight-medium);
  }
  .badge-tag.warning { background-color: var(--warning-bg); color: var(--warning); }
  .badge-tag.info { background-color: var(--info-bg); color: var(--info); }
  .badge-tag.success { background-color: var(--success-bg); color: var(--success); }
  .queue-item-meta {
    font-size: 10px;
    color: var(--text-subtle);
  }

  .assessor-chat-pane {
    display: flex;
    flex-direction: column;
    background-color: var(--surface);
  }
  .chat-header {
    height: 44px;
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--bg);
  }
  .chat-title-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .chat-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--brand);
  }
  .chat-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .chat-messages-container {
    flex: 1;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
  }
  .chat-msg {
    max-width: 85%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    font-size: var(--text-xs);
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .chat-msg.incoming {
    align-self: flex-start;
    background-color: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    border-bottom-left-radius: 2px;
  }
  .chat-msg.outgoing {
    align-self: flex-end;
    background-color: var(--brand-subtle);
    border: 1px solid rgba(15, 118, 110, 0.2);
    color: var(--brand-deep);
    border-bottom-right-radius: 2px;
  }
  .chat-sender {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    opacity: 0.8;
  }
  .chat-time {
    font-size: 9px;
    opacity: 0.6;
    align-self: flex-end;
  }
  .chat-input-bar {
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--border);
    display: flex;
    gap: var(--space-2);
    background-color: var(--bg);
  }
  .chat-input {
    flex: 1;
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background-color: var(--surface);
    font-size: var(--text-xs);
  }
  .chat-send-btn {
    height: 32px;
    padding: 0 var(--space-3);
    background-color: var(--brand);
    color: #FFFFFF;
    border: none;
    border-radius: var(--radius-control);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
</style>

<div class="hero-assessor-console">
  <!-- Left Referral Queue -->
  <div class="assessor-queue-pane">
    <div class="queue-pane-title">
      <span>REFERRAL QUEUE</span>
      <span style="font-size: 10px; font-weight: 500;">3 Active</span>
    </div>
    <div class="queue-item active">
      <div class="queue-item-row">
        <span class="queue-code">REF-8492-K</span>
        <span class="badge-tag warning">Active triage</span>
      </div>
      <span class="queue-item-meta">Referred 18m ago</span>
    </div>
    <div class="queue-item">
      <div class="queue-item-row">
        <span class="queue-code">REF-3104-M</span>
        <span class="badge-tag info">New</span>
      </div>
      <span class="queue-item-meta">Referred 2h ago</span>
    </div>
    <div class="queue-item">
      <div class="queue-item-row">
        <span class="queue-code">REF-7721-P</span>
        <span class="badge-tag success">Follow-up</span>
      </div>
      <span class="queue-item-meta">Referred 1d ago</span>
    </div>
  </div>

  <!-- Right Chat Panel (Text Chat Only) -->
  <div class="assessor-chat-pane">
    <div class="chat-header">
      <div class="chat-title-group">
        <span class="chat-status-dot"></span>
        <span class="chat-title">Case REF-8492-K · Secure Assessor Chat</span>
      </div>
      <span class="badge-tag info">Encrypted</span>
    </div>
    <div class="chat-messages-container">
      <div class="chat-msg incoming">
        <span class="chat-sender">Employee (REF-8492-K)</span>
        <span>Hello Doctor. Work stress has made it hard to sleep this week, and I wanted confidential advice.</span>
        <span class="chat-time">10:14 AM</span>
      </div>
      <div class="chat-msg outgoing">
        <span class="chat-sender">Medical Assessor</span>
        <span>You are in a private space—your employer only sees anonymous group stats. Let's review your check-in together.</span>
        <span class="chat-time">10:17 AM</span>
      </div>
    </div>
    <div class="chat-input-bar">
      <input type="text" class="chat-input" placeholder="Type a confidential clinical reply..." disabled>
      <button type="button" class="chat-send-btn" disabled>Send</button>
    </div>
  </div>
</div>
```

---

### Component C: HR Group Results Dashboard

```html
<!-- Component C: HR Group Results Dashboard -->
<style>
  .hero-hr-dashboard {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-6);
    max-width: 760px;
    font-family: var(--font-sans);
  }
  .hr-dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .hr-dashboard-title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .anonymity-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--brand);
    background-color: var(--brand-subtle);
    padding: 2px 8px;
    border-radius: var(--radius-control);
    font-weight: var(--weight-medium);
  }
  .hr-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }
  .hr-stat-card {
    background-color: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hr-stat-label {
    font-size: var(--text-xs);
    color: var(--text-subtle);
  }
  .hr-stat-val {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .hr-stat-hint {
    font-size: 11px;
    color: var(--text-subtle);
  }
  .hr-chart-section {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: var(--space-4);
  }
  .chart-header {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text);
    margin-bottom: var(--space-3);
    display: flex;
    justify-content: space-between;
  }
  .chart-bars-wrap {
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    height: 120px;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .chart-bar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
    width: 60px;
  }
  .chart-bar-slot {
    flex: 1;
    width: 24px;
    background-color: var(--bg);
    border-radius: 3px 3px 0 0;
    display: flex;
    align-items: flex-end;
  }
  .chart-bar-fill {
    width: 100%;
    border-radius: 3px 3px 0 0;
  }
  .chart-val-lbl {
    font-size: 11px;
    font-weight: var(--weight-semibold);
    color: var(--text);
  }
  .chart-band-lbl {
    font-size: 10px;
    color: var(--text-subtle);
  }
  .anonymity-footer-note {
    font-size: 11px;
    color: var(--text-subtle);
    margin-top: var(--space-3);
    text-align: center;
  }
</style>

<div class="hero-hr-dashboard">
  <div class="hr-dashboard-header">
    <span class="hr-dashboard-title">Havilah · HR Analytics Console</span>
    <span class="anonymity-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span>Group Threshold Active (N &ge; 5)</span>
    </span>
  </div>

  <div class="hr-stat-grid">
    <div class="hr-stat-card">
      <span class="hr-stat-label">Active check-ins</span>
      <span class="hr-stat-val" style="color: var(--brand);">86</span>
      <span class="hr-stat-hint">78% response rate</span>
    </div>
    <div class="hr-stat-card">
      <span class="hr-stat-label">PHQ-9 mean</span>
      <span class="hr-stat-val" style="color: var(--success);">4.1</span>
      <span class="hr-stat-hint">Minimal range (0-4)</span>
    </div>
    <div class="hr-stat-card">
      <span class="hr-stat-label">GAD-7 mean</span>
      <span class="hr-stat-val" style="color: var(--success);">3.8</span>
      <span class="hr-stat-hint">Minimal tension</span>
    </div>
    <div class="hr-stat-card">
      <span class="hr-stat-label">Assessor referrals</span>
      <span class="hr-stat-val">5</span>
      <span class="hr-stat-hint">Anonymous codes</span>
    </div>
  </div>

  <div class="hr-chart-section">
    <div class="chart-header">
      <span>Group Severity Distribution</span>
      <span style="color: var(--text-subtle); font-weight: normal;">Sample organizational cohort</span>
    </div>
    <div class="chart-bars-wrap">
      <div class="chart-bar-group">
        <div class="chart-bar-slot">
          <div class="chart-bar-fill" style="height: 56%; background-color: var(--success);"></div>
        </div>
        <span class="chart-val-lbl">56%</span>
        <span class="chart-band-lbl">Minimal</span>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-slot">
          <div class="chart-bar-fill" style="height: 26%; background-color: var(--text-subtle);"></div>
        </div>
        <span class="chart-val-lbl">26%</span>
        <span class="chart-band-lbl">Mild</span>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-slot">
          <div class="chart-bar-fill" style="height: 13%; background-color: var(--warning);"></div>
        </div>
        <span class="chart-val-lbl">13%</span>
        <span class="chart-band-lbl">Moderate</span>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-slot">
          <div class="chart-bar-fill" style="height: 5%; background-color: var(--danger);"></div>
        </div>
        <span class="chart-val-lbl">5%</span>
        <span class="chart-band-lbl">Elevated</span>
      </div>
    </div>
    <p class="anonymity-footer-note">
      Anonymous by design: HR sees results only for groups of 5 or more. Individual responses remain confidential.
    </p>
  </div>
</div>
```

---

## 4. Truthfulness & Regulatory Rules

To ensure complete credibility, truthfulness, and strict adherence to the project guardrails, the following rules govern all scenes, text overlays, captions, and graphics:

### Prohibited Elements (Must NOT appear anywhere)
1. **Compliance Badges and Certifications**:
   - No `"ISO 45003 Compliant"`, `"ISO 27001"`, `"HIPAA Compliant"`, `"SOC 2 Type II"`, or `"GDPR Ready"`.
   - No `"Certified"` labels or unverified badges.
2. **Fabricated Marketing Numbers & Statistics**:
   - No `"240+ Enterprises served"`.
   - No `"98% survey completion"`, `"38% reduction in burnout"`, `"4.2x faster identification"`, `"91% response rate"`, or `"$2.7M turnover cost avoided"`.
3. **Unsupported / Non-Existent Features**:
   - No video calling, video links, or video consultation UI (text-based secure clinical messaging only).
   - No `"Priority 24/7 Support SLA"` (support during business hours only).
4. **Prohibited Jargon & Wording**:
   - No `"Engine"`, `"Hub"`, `"reverse trial"`, `"Provisioned"`, or decorative exclamation marks.
5. **No Customer Testimonials or Unverified Logos**:
   - Zero invented logos, stock quotes, or customer endorsements.
6. **No Real Data**:
   - No personal names, real email addresses, actual employee counts, or production tenant database entries.

### Permitted Claims & Disclaimers
1. **Regulatory Alignment**:
   - Allowed phrasing: `"Designed with the Ghana Data Protection Act, 2012 (Act 843) in mind."` *(Never "compliant", "certified", or "registered" with DPC until verified).*
2. **Anonymity Guarantee**:
   - `"Anonymous by design: HR sees results only for groups of 5 or more."`
3. **Validated Clinical Instruments**:
   - `"Validated screening tools: PHQ-9, GAD-7, and PSS-10."`
4. **Confidential Medical Assessor Triage**:
   - `"Confidential access to a medical assessor via secure chat."`
5. **Mandatory Sample Data Label**:
   - A visible `"Sample data"` badge is permanently displayed inside the product preview frame across all scenes from timestamp `4.0s` to `25.0s`.
