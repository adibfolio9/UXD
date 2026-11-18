import firebaseConfig from '../../firebase-applet-config.json';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function buildStandaloneLeadFormHtml(targetUid: string): string {
  const safeUid = targetUid.trim();
  const safeUidAttr = escapeHtml(safeUid);
  const configJson = safeJsonForScript({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UXD Vault — Candidate & Lead Intake Form</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #f5f5f7;
        --surface: #ffffff;
        --surface-muted: #fbfbfd;
        --input-bg: #f5f5f7;
        --text: #1d1d1f;
        --muted: #6e6e73;
        --subtle: #86868b;
        --border: rgba(0, 0, 0, 0.08);
        --input-border: rgba(0, 0, 0, 0.12);
        --accent: #0071e3;
        --accent-hover: #0077ed;
        --accent-soft: rgba(0, 113, 227, 0.08);
        --success: #1e7f34;
        --success-bg: rgba(40, 205, 65, 0.12);
        --danger: #d70015;
        --danger-bg: rgba(255, 59, 48, 0.08);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #000000;
          --surface: #1c1c1e;
          --surface-muted: #2c2c2e;
          --input-bg: #2c2c2e;
          --text: #f5f5f7;
          --muted: #a1a1a6;
          --subtle: #8e8e93;
          --border: rgba(255, 255, 255, 0.12);
          --input-border: rgba(255, 255, 255, 0.14);
          --accent: #0a84ff;
          --accent-hover: #2997ff;
          --accent-soft: rgba(10, 132, 255, 0.16);
          --success: #30d158;
          --success-bg: rgba(48, 209, 88, 0.14);
          --danger: #ff453a;
          --danger-bg: rgba(255, 69, 58, 0.12);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      .wrap {
        max-width: 760px;
        margin: 0 auto;
        padding: 28px 18px 56px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 24px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .brand-mark {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #111113;
        color: #f5c84c;
        display: grid;
        place-items: center;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: -0.02em;
        border: 1px solid rgba(245, 200, 76, 0.35);
      }
      .brand-name {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 600;
        font-size: 16px;
        letter-spacing: -0.02em;
      }
      h1 {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 28px;
        line-height: 1.2;
        letter-spacing: -0.025em;
        margin: 0;
      }
      .subtitle {
        margin: 8px 0 0;
        font-size: 14px;
        color: var(--muted);
      }
      .header {
        padding-bottom: 20px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 24px;
      }
      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 22px;
        margin-bottom: 20px;
      }
      .card h2 {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 14px;
        font-weight: 600;
        margin: 0;
      }
      .card-sub {
        font-size: 12px;
        color: var(--subtle);
        margin: 4px 0 16px;
      }
      .grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .grid-5 {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }
      .grid-4 {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      @media (max-width: 640px) {
        .grid-2, .grid-5, .grid-4 { grid-template-columns: 1fr; }
      }
      .field { margin-bottom: 16px; }
      .field:last-child { margin-bottom: 0; }
      label, .field-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .req { color: var(--danger); }
      input[type="text"],
      input[type="email"],
      input[type="tel"],
      textarea {
        width: 100%;
        padding: 9px 14px;
        font-size: 14px;
        font-family: inherit;
        color: var(--text);
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 10px;
        outline: none;
        transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
      }
      input[type="text"], input[type="email"], input[type="tel"] { height: 40px; }
      input.mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
      input:focus, textarea:focus {
        background: var(--surface);
        border-color: var(--accent);
        box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.25);
      }
      .opt-btn {
        height: 40px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: var(--surface-muted);
        color: var(--text);
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 150ms ease;
      }
      .opt-btn.mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
      .opt-btn.active {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent);
      }
      .ai-btn {
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--input-border);
        background: var(--surface-muted);
        color: var(--text);
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        transition: all 150ms ease;
      }
      .ai-btn.active {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .ai-title { font-size: 12px; font-weight: 600; }
      .ai-btn.active .ai-title { color: var(--accent); }
      .ai-hint { font-size: 11px; color: var(--subtle); margin-top: 2px; }
      .check-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: var(--surface-muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        margin-bottom: 0;
        color: var(--text);
      }
      .check-pill input { accent-color: var(--accent); }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .btn-secondary {
        height: 40px;
        padding: 0 16px;
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: var(--surface);
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .btn-primary {
        height: 40px;
        padding: 0 24px;
        border-radius: 10px;
        border: none;
        background: var(--accent);
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .btn-primary:hover { background: var(--accent-hover); }
      .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .alert {
        border-radius: 12px;
        padding: 12px 16px;
        font-size: 13px;
        margin-bottom: 18px;
        display: none;
      }
      .alert.error {
        display: block;
        background: var(--danger-bg);
        color: var(--danger);
        border: 1px solid rgba(255, 59, 48, 0.3);
      }
      .success-card {
        display: none;
        max-width: 520px;
        margin: 60px auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 36px 28px;
        text-align: center;
      }
      .success-icon {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        background: var(--success-bg);
        color: var(--success);
        display: grid;
        place-items: center;
        margin: 0 auto 14px;
        font-size: 22px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div id="form-shell" class="wrap" data-target-uid="${safeUidAttr}">
      <div class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">UV</div>
          <span class="brand-name">UXD Vault</span>
        </div>
      </div>

      <div class="header">
        <h1>Candidate &amp; Lead Intake Form</h1>
        <p class="subtitle">
          Share your contact details, portfolio, resume, AI product work, notice period, and relocation preferences.
        </p>
      </div>

      <div id="form-error" role="alert" class="alert"></div>

      <form id="lead-form">
        <section class="card">
          <h2>01. Candidate Identity &amp; Contact</h2>
          <p class="card-sub">Core contact details and current city.</p>
          <div class="grid-2">
            <div class="field">
              <label for="fullName">Full Name <span class="req">*</span></label>
              <input id="fullName" type="text" required maxlength="200" placeholder="e.g. Ananya Kulkarni" />
            </div>
            <div class="field">
              <label for="email">Email ID <span class="req">*</span></label>
              <input id="email" type="email" required maxlength="254" placeholder="name@domain.com" />
            </div>
            <div class="field">
              <label for="contactNo">Contact No / WhatsApp</label>
              <input id="contactNo" type="tel" maxlength="120" class="mono" placeholder="+91 98204 51290 or +971 50 123 4567" />
            </div>
            <div class="field">
              <label for="currentLocation">Current Location</label>
              <input id="currentLocation" type="text" maxlength="160" placeholder="e.g. Bengaluru, India or Dubai, UAE" />
            </div>
          </div>
        </section>

        <section class="card">
          <h2>02. Portfolio, Resume &amp; AI Product Background</h2>
          <p class="card-sub">Work links, design seniority, and AI product experience.</p>
          <div class="grid-2 field">
            <div>
              <label for="portfolioUrl">Portfolio URL</label>
              <input id="portfolioUrl" type="text" maxlength="2000" placeholder="https://behance.net/... or https://framer.website" />
            </div>
            <div>
              <label for="resumeUrl">Resume Link (Google Drive / Docs / PDF)</label>
              <input id="resumeUrl" type="text" maxlength="2000" placeholder="https://drive.google.com/file/d/... or PDF link" />
            </div>
          </div>

          <div class="field">
            <span class="field-label">Years of Experience</span>
            <div id="exp-group" class="grid-5" role="radiogroup" aria-label="Years of Experience">
              <button type="button" class="opt-btn mono" data-val="0-2 years">0-2 years</button>
              <button type="button" class="opt-btn mono active" data-val="3–5 years">3–5 years</button>
              <button type="button" class="opt-btn mono" data-val="6–8 years">6–8 years</button>
              <button type="button" class="opt-btn mono" data-val="9–10 years">9–10 years</button>
              <button type="button" class="opt-btn mono" data-val="11+ years">11+ years</button>
            </div>
          </div>

          <div class="field">
            <span class="field-label">Have you designed an AI-powered product or feature?</span>
            <div id="ai-group" class="grid-2" role="radiogroup" aria-label="AI product design experience">
              <button type="button" class="ai-btn active" data-val="Yes, launched">
                <div class="ai-title">Yes, launched</div>
                <div class="ai-hint">Shipped AI-powered product or feature in production</div>
              </button>
              <button type="button" class="ai-btn" data-val="Yes, designed but not launched">
                <div class="ai-title">Yes, designed but not launched</div>
                <div class="ai-hint">Completed end-to-end UX/UI design awaiting release</div>
              </button>
              <button type="button" class="ai-btn" data-val="Only prototypes or concepts">
                <div class="ai-title">Only prototypes or concepts</div>
                <div class="ai-hint">Explorations, concepts, or interactive prototypes</div>
              </button>
              <button type="button" class="ai-btn" data-val="No">
                <div class="ai-title">No</div>
                <div class="ai-hint">No AI-specific product work yet</div>
              </button>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>03. Availability, Salary &amp; Relocation</h2>
          <p class="card-sub">Notice period, expected compensation, relocation options, and message.</p>

          <div class="field">
            <span class="field-label">What is your notice period?</span>
            <div id="notice-group" class="grid-5" role="radiogroup" aria-label="Notice period">
              <button type="button" class="opt-btn" data-val="Immediate">Immediate</button>
              <button type="button" class="opt-btn" data-val="15 days">15 days</button>
              <button type="button" class="opt-btn active" data-val="30 days">30 days</button>
              <button type="button" class="opt-btn" data-val="60 days">60 days</button>
              <button type="button" class="opt-btn" data-val="90 days or more">90 days or more</button>
            </div>
          </div>

          <div class="grid-2 field">
            <div>
              <label for="expectedSalary">Expected Salary</label>
              <input id="expectedSalary" type="text" maxlength="160" class="mono" placeholder="e.g. ₹24 LPA or AED 18,000 / mo" />
            </div>
            <div>
              <label for="customRelocation">Other Relocation Location (optional)</label>
              <input id="customRelocation" type="text" maxlength="120" placeholder="e.g. Abu Dhabi, Singapore, London" />
            </div>
          </div>

          <div class="field">
            <span class="field-label">Ready to relocate in</span>
            <div class="grid-4">
              <label class="check-pill"><input type="checkbox" name="reloc" value="Any Indian Cities" /><span>Any Indian Cities</span></label>
              <label class="check-pill"><input type="checkbox" name="reloc" value="Dubai" checked /><span>Dubai</span></label>
              <label class="check-pill"><input type="checkbox" name="reloc" value="Other Gulf Countries" /><span>Other Gulf Countries</span></label>
              <label class="check-pill"><input type="checkbox" name="reloc" value="Remote" /><span>Remote</span></label>
            </div>
          </div>

          <div class="field">
            <label for="message">Any Message / Cover Note</label>
            <textarea id="message" rows="4" maxlength="4000" placeholder="Share highlights of key design systems, AI features, case studies, or notes..."></textarea>
          </div>
        </section>

        <div class="footer">
          <button type="button" id="reset-btn" class="btn-secondary">Clear Form</button>
          <button type="submit" id="submit-btn" class="btn-primary">Submit Lead Details</button>
        </div>
      </form>
    </div>

    <div id="success-shell" class="success-card">
      <div class="success-icon">✓</div>
      <h1>Application Submitted</h1>
      <p class="subtitle">
        Thank you, <strong id="submitted-name"></strong>. Your profile, portfolio, and resume details have been added directly to the hiring pipeline.
      </p>
      <div style="margin-top: 22px;">
        <button type="button" id="another-btn" class="btn-primary">Submit Another Response</button>
      </div>
    </div>

    <script type="module">
      import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
      import { doc, getFirestore, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

      const firebaseConfig = ${configJson};
      const targetUid = document.getElementById('form-shell').dataset.targetUid;
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

      let yearsOfExperience = '3–5 years';
      let designedAiProduct = 'Yes, launched';
      let noticePeriod = '30 days';

      function wireGroup(groupId, onSelect) {
        const group = document.getElementById(groupId);
        group.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-val]');
          if (!btn) return;
          group.querySelectorAll('button[data-val]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          onSelect(btn.dataset.val);
        });
      }

      wireGroup('exp-group', (v) => { yearsOfExperience = v; });
      wireGroup('ai-group', (v) => { designedAiProduct = v; });
      wireGroup('notice-group', (v) => { noticePeriod = v; });

      const form = document.getElementById('lead-form');
      const errBox = document.getElementById('form-error');
      const submitBtn = document.getElementById('submit-btn');
      const formShell = document.getElementById('form-shell');
      const successShell = document.getElementById('success-shell');

      function resetAll() {
        form.reset();
        yearsOfExperience = '3–5 years';
        designedAiProduct = 'Yes, launched';
        noticePeriod = '30 days';
        document.querySelectorAll('#exp-group button').forEach((b) => b.classList.toggle('active', b.dataset.val === yearsOfExperience));
        document.querySelectorAll('#ai-group button').forEach((b) => b.classList.toggle('active', b.dataset.val === designedAiProduct));
        document.querySelectorAll('#notice-group button').forEach((b) => b.classList.toggle('active', b.dataset.val === noticePeriod));
        errBox.className = 'alert';
        errBox.textContent = '';
      }

      document.getElementById('reset-btn').addEventListener('click', resetAll);
      document.getElementById('another-btn').addEventListener('click', () => {
        resetAll();
        successShell.style.display = 'none';
        formShell.style.display = 'block';
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.className = 'alert';
        errBox.textContent = '';

        const fullName = document.getElementById('fullName').value.trim().slice(0, 200);
        if (!fullName) {
          errBox.className = 'alert error';
          errBox.textContent = 'Please enter your Full Name.';
          return;
        }

        const relocs = Array.from(document.querySelectorAll('input[name="reloc"]:checked')).map((el) => el.value);
        const customReloc = document.getElementById('customRelocation').value.trim();
        if (customReloc) relocs.push(customReloc);

        const submissionId = 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
          await setDoc(doc(db, 'users', targetUid, 'leadSubmissions', submissionId), {
            targetUid,
            id: submissionId,
            fullName,
            email: document.getElementById('email').value.trim().slice(0, 254),
            contactNo: document.getElementById('contactNo').value.trim().slice(0, 120),
            portfolioUrl: document.getElementById('portfolioUrl').value.trim().slice(0, 2000),
            currentLocation: document.getElementById('currentLocation').value.trim().slice(0, 160),
            yearsOfExperience: yearsOfExperience.slice(0, 80),
            designedAiProduct: designedAiProduct.slice(0, 500),
            noticePeriod: noticePeriod.slice(0, 120),
            resumeUrl: document.getElementById('resumeUrl').value.trim().slice(0, 2000),
            message: document.getElementById('message').value.trim().slice(0, 4000),
            expectedSalary: document.getElementById('expectedSalary').value.trim().slice(0, 160),
            readyToRelocateIn: relocs.join(', ').slice(0, 240),
            createdAt: serverTimestamp(),
          });
          document.getElementById('submitted-name').textContent = fullName;
          formShell.style.display = 'none';
          successShell.style.display = 'block';
        } catch (err) {
          errBox.className = 'alert error';
          errBox.textContent =
            err && err.code === 'permission-denied'
              ? 'This form link is inactive or no longer accepting submissions.'
              : 'Could not submit the form right now. Please try again.';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Lead Details';
        }
      });
    </script>
  </body>
</html>
`;
}
