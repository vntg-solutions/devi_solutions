/* Devi Technical Services — Bill Generator
   Modular, no-backend, pure JS (jsPDF + PapaParse)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const PRODUCTS = [
    { name: 'Canon IR-3225 Photocopier & Network Printer Rent', hsn: '', uom: 'NOS', rate: 3600 },
    { name: 'Printer Cartridge Replacement', hsn: '', uom: 'NOS', rate: 2500 },
    { name: 'Annual Maintenance Contract (AMC)', hsn: '', uom: 'NOS', rate: 12000 },
    { name: 'Network Setup & Configuration', hsn: '', uom: 'NOS', rate: 5000 },
    { name: 'CCTV Camera Installation', hsn: '', uom: 'NOS', rate: 4500 },
    { name: 'Computer Hardware Repair', hsn: '', uom: 'HRS', rate: 800 },
];

const BANKS = [
    { name: 'Jaya Mishra', acNo: '677802010011687', bank: 'Union Bank', ifsc: 'UBIN0567787' },
    { name: 'Devi Technical Services', acNo: '920020043613270', bank: 'Axis Bank', ifsc: 'UTIB0001234' },
];

const AUTH_KEY = 'DEVI@2026';

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let itemCounter = 0;
let lastInvoice = null;   // last rendered invoice object
let csvInvoice = null;   // parsed CSV invoice (used by Generate Bill button)

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════════ */

/** HTML-escape a string for safe DOM injection */
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format number as Indian locale with 2 decimal places */
function fmt(n) {
    return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a date string (ISO or dd/mm/yyyy) to "DD/MM/YYYY" */
function formatDate(s) {
    if (!s) return '';
    // Already formatted "dd/MM/yyyy" style
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s.trim())) return s.trim();
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Sanitise text for jsPDF (strip characters outside Basic Latin + Latin-1) */
function pdfSafe(str) {
    return String(str ?? '')
        .replace(/[^\x00-\xFF]/g, (c) => {
            const map = { '₹': 'Rs.', '–': '-', '—': '-', '\u2019': "'", '\u2018': "'", '\u201C': '"', '\u201D': '"' };
            return map[c] ?? '';
        });
}

/** Convert a number to Indian words (with paise) */
function numberToWords(num) {
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function twoDigit(n) {
        return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function threeDigit(n) {
        return n >= 100
            ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigit(n % 100) : '')
            : twoDigit(n);
    }

    function convert(n) {
        if (n === 0) return '';
        const crore = Math.floor(n / 10_000_000);
        const lakh = Math.floor((n % 10_000_000) / 100_000);
        const khar = Math.floor((n % 100_000) / 1_000);
        const rem = n % 1_000;
        let res = '';
        if (crore) res += threeDigit(crore) + ' Crore ';
        if (lakh) res += twoDigit(lakh) + ' Lakh ';
        if (khar) res += threeDigit(khar) + ' Thousand ';
        if (rem) res += threeDigit(rem);
        return res.trim();
    }

    if (rupees === 0 && paise === 0) return 'Zero Rupees';
    let result = '';
    if (rupees > 0) result += convert(rupees) + ' Rupees';
    if (paise > 0) result += (result ? ' and ' : '') + twoDigit(paise) + ' Paise';
    return result;
}

/* ═══════════════════════════════════════════════════════════════
   UI STATE HELPERS
═══════════════════════════════════════════════════════════════ */
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById('sec-' + id);
    if (sec) sec.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function showError(msg) {
    const box = document.getElementById('error-box');
    const msgEl = document.getElementById('error-msg');
    if (!box || !msgEl) return;
    msgEl.textContent = msg;
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    const box = document.getElementById('error-box');
    if (box) box.style.display = 'none';
}

function showProgress(msg = 'Generating PDF…') {
    const el = document.getElementById('pdf-progress');
    const msgEl = document.getElementById('progress-msg');
    if (el) el.classList.add('active');
    if (msgEl) msgEl.textContent = msg;
    document.body.style.overflow = 'hidden';
}

function hideProgress() {
    const el = document.getElementById('pdf-progress');
    if (el) el.classList.remove('active');
    document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════
   INLINE FIELD VALIDATION
═══════════════════════════════════════════════════════════════ */
function setFieldError(fieldId, message) {
    // fieldId is the field wrapper id (e.g. "field-invNo") or the input id
    let wrapper = document.getElementById('field-' + fieldId) || document.getElementById(fieldId)?.closest('.field');
    let errEl = document.getElementById('err-' + fieldId);

    if (wrapper) wrapper.classList.add('invalid');
    if (errEl) errEl.textContent = message;
}

function clearFieldError(fieldId) {
    let wrapper = document.getElementById('field-' + fieldId) || document.getElementById(fieldId)?.closest('.field');
    let errEl = document.getElementById('err-' + fieldId);

    if (wrapper) wrapper.classList.remove('invalid');
    if (errEl) errEl.textContent = '';
}

function clearAllErrors() {
    document.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
}

/** Attach real-time error clearing to a field */
function attachClearOnInput(inputId, fieldKey) {
    const el = document.getElementById(inputId);
    if (el) el.addEventListener('input', () => clearFieldError(fieldKey));
}

/* ═══════════════════════════════════════════════════════════════
   NAV TAB SWITCHING
═══════════════════════════════════════════════════════════════ */
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        const target = tab.dataset.tab;
        showSection(target);

        // Reset CSV state when switching back to upload tab
        if (target === 'upload') {
            resetCSVState();
        }
    });
});

/* ═══════════════════════════════════════════════════════════════
   BANK SELECT TOGGLE
═══════════════════════════════════════════════════════════════ */
const bankSelect = document.getElementById('f-bank');
if (bankSelect) {
    bankSelect.addEventListener('change', e => {
        const cf = document.getElementById('custom-bank-field');
        if (cf) cf.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
}

/* ═══════════════════════════════════════════════════════════════
   ITEM ROW MANAGEMENT
═══════════════════════════════════════════════════════════════ */
function buildProductOptions() {
    return '<option value="">— Select preset —</option>' +
        PRODUCTS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('') +
        '<option value="custom">✏️ Type manual product/service…</option>';
}

function isPresetName(name) {
    return PRODUCTS.some(p => p.name === name);
}

function addItemRow(data) {
    itemCounter++;
    const id = itemCounter;
    const tbody = document.getElementById('items-body');
    if (!tbody) return;

    const showTextarea = data && !isPresetName(data.description);

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML = `
      <td style="text-align:center;font-weight:700;padding-top:14px;font-size:13px;">${id}</td>
      <td>
        <select class="item-select" data-id="${id}">${buildProductOptions()}</select>
        <textarea
          class="item-desc"
          data-id="${id}"
          placeholder="Type product/service name…"
          style="margin-top:8px;display:${showTextarea ? 'block' : 'none'};"
          rows="2"
        >${esc(data?.description ?? '')}</textarea>
      </td>
      <td><input type="text"   class="item-hsn"  data-id="${id}" value="${esc(data?.hsn ?? '')}" placeholder="—"></td>
      <td><input type="text"   class="item-uom"  data-id="${id}" value="${esc(data?.uom ?? 'NOS')}"></td>
      <td><input type="number" class="item-qty num" data-id="${id}" value="${data?.qty ?? 1}" min="0.01" step="any"></td>
      <td><input type="number" class="item-rate num" data-id="${id}" value="${data?.rate ?? ''}" min="0" step="0.01" placeholder="0.00"></td>
      <td class="row-total" data-id="${id}">0.00</td>
      <td><button type="button" class="btn-remove" data-id="${id}" title="Remove row">✕</button></td>
    `;
    tbody.appendChild(tr);

    // Preset select logic
    const sel = tr.querySelector('.item-select');
    const desc = tr.querySelector('.item-desc');

    sel.addEventListener('change', e => {
        const v = e.target.value;
        if (v === 'custom') {
            desc.style.display = 'block';
            desc.value = '';
            desc.focus();
        } else if (v === '') {
            desc.style.display = 'none';
            desc.value = '';
        } else {
            const p = PRODUCTS[parseInt(v, 10)];
            desc.style.display = 'none';
            desc.value = p.name;
            tr.querySelector('.item-hsn').value = p.hsn;
            tr.querySelector('.item-uom').value = p.uom;
            tr.querySelector('.item-rate').value = p.rate;
        }
        calcRowTotal(tr);
    });

    tr.querySelector('.item-qty').addEventListener('input', () => calcRowTotal(tr));
    tr.querySelector('.item-rate').addEventListener('input', () => calcRowTotal(tr));

    tr.querySelector('.btn-remove').addEventListener('click', () => {
        tr.remove();
        renumberRows();
        // Clear items error if rows now exist
        if (document.querySelectorAll('#items-body tr').length > 0) {
            clearFieldError('items');
        }
    });

    if (data) calcRowTotal(tr);
}

function calcRowTotal(tr) {
    const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.item-rate')?.value) || 0;
    const tot = tr.querySelector('.row-total');
    if (tot) tot.textContent = fmt(qty * rate);
}

function renumberRows() {
    document.querySelectorAll('#items-body tr').forEach((tr, i) => {
        const cell = tr.querySelector('td');
        if (cell) cell.textContent = i + 1;
    });
}

// Wire up "Add Item" button
const btnAddRow = document.getElementById('btn-add-item');
if (btnAddRow) btnAddRow.addEventListener('click', () => addItemRow(null));

// Initial row + today's date
const itemsBody = document.getElementById('items-body');
if (itemsBody && itemsBody.children.length === 0) addItemRow(null);

const invDatePicker = document.getElementById('f-invDate');
if (invDatePicker) invDatePicker.valueAsDate = new Date();

// Wire up real-time clear on required fields
attachClearOnInput('f-invNo', 'invNo');
attachClearOnInput('f-recvName', 'recvName');

/* ═══════════════════════════════════════════════════════════════
   FORM DATA COLLECTION & VALIDATION
═══════════════════════════════════════════════════════════════ */
function collectFormData() {
    clearAllErrors();
    let hasErrors = false;

    const invNumber = document.getElementById('f-invNo')?.value.trim() ?? '';
    const invDate = document.getElementById('f-invDate')?.value ?? '';
    const recvName = document.getElementById('f-recvName')?.value.trim() ?? '';
    const recvAddr = document.getElementById('f-recvAddr')?.value.trim() ?? '';

    if (!invNumber) {
        setFieldError('invNo', 'Bill Number is required.');
        hasErrors = true;
    }
    if (!recvName) {
        setFieldError('recvName', 'Party Name is required.');
        hasErrors = true;
    }

    // Collect items
    const items = [];
    document.querySelectorAll('#items-body tr').forEach(tr => {
        const description = tr.querySelector('.item-desc')?.value.trim();
        const hsn = (tr.querySelector('.item-hsn')?.value ?? '').trim();
        const uom = (tr.querySelector('.item-uom')?.value ?? '').trim() || 'NOS';
        const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(tr.querySelector('.item-rate')?.value) || 0;
        if (description && qty > 0) items.push({ description, hsn, uom, qty, rate });
    });

    if (items.length === 0) {
        const errEl = document.getElementById('err-items');
        if (errEl) errEl.textContent = 'Please add at least one item with a name and quantity.';
        hasErrors = true;
    }

    if (hasErrors) {
        // Scroll to first error
        const firstErr = document.querySelector('.field.invalid, #err-items:not(:empty)');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return null;
    }

    // Bank text
    let bankText = '';
    const bankSel = document.getElementById('f-bank')?.value ?? '0';
    if (bankSel === 'custom') {
        bankText = document.getElementById('f-bankCustom')?.value.trim() || '—';
    } else {
        const b = BANKS[parseInt(bankSel, 10)];
        bankText = `Bank Detail: ${b.name}\nA/C NO- ${b.acNo} ${b.bank} IFSC CODE -\n${b.ifsc}`;
    }

    return { invoiceNumber: invNumber, invoiceDate: invDate, receiverName: recvName, receiverAddr: recvAddr, items, bankText };
}

/* ═══════════════════════════════════════════════════════════════
   BILL HTML PREVIEW RENDERER
═══════════════════════════════════════════════════════════════ */
function renderInvoice(inv) {
    lastInvoice = inv;
    const el = document.getElementById('invoice-render');
    if (!el) return;

    const total = inv.items.reduce((s, it) => s + (it.qty * it.rate), 0);
    const bankHtml = (inv.bankText || '').split('\n').map(l => esc(l)).join('<br>');

    const itemRows = inv.items.map((item, idx) => `
      <tr>
        <td class="no">${idx + 1}.</td>
        <td class="name">${esc(item.description)}</td>
        <td class="c">${esc(item.hsn)}</td>
        <td class="c">${esc(item.uom)}</td>
        <td class="c">${item.qty}</td>
        <td class="r">${fmt(item.rate)}</td>
        <td class="r">${fmt(item.qty * item.rate)}</td>
      </tr>`).join('');

    // Pad to at least 3 visible rows for visual consistency
    const padCount = Math.max(0, 3 - inv.items.length);
    const padRows = Array(padCount).fill(`<tr>
      <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>`).join('');

    el.innerHTML = `
      <div class="bill-header">
        <div class="bill-company">Devi Technical Services</div>
        <div class="bill-address">
          A-166, Raju Park, Near Devali Village,<br>
          Khanpur, South Delhi, New Delhi - 110062
        </div>
      </div>

      <div class="bill-title">Bill</div>

      <div class="bill-meta-receiver">
        <div class="bill-section-left">
          <div class="bill-meta-row">
            <span class="bill-label-bold">Bill No.</span>
            <span>: <strong>${esc(inv.invoiceNumber)}</strong></span>
          </div>
          <div class="bill-meta-row">
            <span class="bill-label-bold">Bill Date</span>
            <span>: <strong>${formatDate(inv.invoiceDate)}</strong></span>
          </div>
        </div>
        <div class="bill-section-right">
          <div class="bill-receiver-title">Details of Receiver | Billed to:</div>
          <div class="bill-meta-row">
            <span class="bill-label-bold">Name</span>
            <span>: ${esc(inv.receiverName)}</span>
          </div>
          <div class="bill-meta-row">
            <span class="bill-label-bold">Address</span>
            <span>: ${esc(inv.receiverAddr).replace(/\n/g, '<br>')}</span>
          </div>
        </div>
      </div>

      <table class="bill-items">
        <thead>
          <tr>
            <th style="width:5%;text-align:center;white-space:nowrap">NO</th>
            <th style="width:39%;text-align:left">NAME OF PRODUCT / SERVICE</th>
            <th style="width:11%;text-align:center;white-space:nowrap">HSN/SAC</th>
            <th style="width:8%;text-align:center;white-space:nowrap">UOM</th>
            <th style="width:6%;text-align:center;white-space:nowrap">QTY</th>
            <th style="width:15%;text-align:right;white-space:nowrap">RATE</th>
            <th style="width:16%;text-align:right;white-space:nowrap">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${padRows}
          <tr class="bill-grand-row">
            <td colspan="7" class="bill-grand-cell">
              <span class="bill-grand-label">Grand Total</span>
              <span class="bill-grand-amount">&#8377; ${fmt(total)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="bill-amount-words">
        <span class="bill-words-text">Amount in Words: <strong>${numberToWords(total)} Only</strong></span>
        <span class="bill-total-final">Total: &#8377; ${fmt(total)}</span>
      </div>

      <div class="bill-bank-section">${bankHtml}</div>

      <div class="bill-footer">
        <div class="bill-footer-left">(Receiver Name and Sign)</div>
        <div class="bill-footer-right">
          <div class="for-label">For Devi Technical Services</div>
          <img src="Sign.png" alt="Authorized Signature" onerror="this.style.display='none'">
          <div class="sig-label">(Authorized Signatory)</div>
        </div>
      </div>
    `;

    // Apply mobile scale
    applyMobilePreviewScale();
}

function applyMobilePreviewScale() {
    const wrapper = document.querySelector('.preview-scale-wrapper');
    if (!wrapper) return;
    if (window.innerWidth < 769) {
        const scale = (window.innerWidth * 0.9) / 700;
        wrapper.style.setProperty('--preview-scale', scale.toFixed(3));
        // Adjust wrapper height so it doesn't collapse
        wrapper.style.height = `${Math.round(1100 * scale)}px`;
        wrapper.style.width = `${Math.round(700 * scale)}px`;
    } else {
        wrapper.style.removeProperty('--preview-scale');
        wrapper.style.removeProperty('height');
        wrapper.style.removeProperty('width');
    }
}

window.addEventListener('resize', applyMobilePreviewScale);

/* ═══════════════════════════════════════════════════════════════
   PREVIEW BUTTON (FORM TAB)
═══════════════════════════════════════════════════════════════ */
const btnPreview = document.getElementById('btn-preview');
if (btnPreview) {
    btnPreview.addEventListener('click', () => {
        const inv = collectFormData();
        if (!inv) return;
        renderInvoice(inv);
        showSection('preview');
        document.getElementById('info-number').textContent = inv.invoiceNumber;
        document.getElementById('info-customer').textContent = inv.receiverName;
    });
}

/* ═══════════════════════════════════════════════════════════════
   CSV UPLOAD & PARSING
═══════════════════════════════════════════════════════════════ */
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');

if (browseBtn && fileInput) browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragover', 'dragenter'].forEach(ev =>
        dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); }));

    ['dragleave', 'drop'].forEach(ev =>
        dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over')));

    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleCSVFile(f);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleCSVFile(e.target.files[0]);
    });
}

function handleCSVFile(file) {
    hideError();
    resetCSVState(false); // hide old preview but keep drop-zone

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError('Invalid file type. Please upload a .csv file.');
        return;
    }
    if (file.size > 2 * 1024 * 1024) { // 2 MB guard
        showError('File is too large (max 2 MB). Please split your CSV into smaller files.');
        return;
    }

    showToast('📖 Parsing CSV…', 1500);

    Papa.parse(file, {
        skipEmptyLines: 'greedy',
        header: false,
        complete(result) {
            try {
                const { inv, warnings } = parseCSV(result.data);
                csvInvoice = inv;
                renderCSVPreview(inv, warnings);
            } catch (e) {
                showError(e.message || 'Failed to parse CSV. Please check the file format.');
                console.error('CSV parse error:', e);
            }
        },
        error(err) {
            showError('CSV read error: ' + err.message);
        }
    });
}

/**
 * parseCSV — robust multi-format CSV parser.
 * Expected format:
 *   Field,Value rows at top (Invoice Number, Invoice Date, Receiver Name, Receiver Address, Bank Details)
 *   A row with first cell "ITEMS"
 *   Header row (Description, Quantity, Unit Price, HSN/SAC, UOM)
 *   Item data rows
 */
function parseCSV(rows) {
    const inv = {
        invoiceNumber: '',
        invoiceDate: '',
        receiverName: '',
        receiverAddr: '',
        bankText: '',
        items: [],
    };
    const warnings = [];
    let inItems = false;
    let headerPassed = false;

    for (const rawRow of rows) {
        // Trim every cell
        const row = rawRow.map(c => (c ?? '').trim());
        const c0 = row[0].toUpperCase();

        if (!row[0]) continue;

        // Detect ITEMS section marker
        if (c0 === 'ITEMS') { inItems = true; continue; }

        if (inItems) {
            // Skip the header row (first row after ITEMS)
            if (!headerPassed) {
                headerPassed = true;
                // It's a header if first cell looks like "description"
                if (row[0].toLowerCase().includes('desc') || row[0].toLowerCase().includes('name')) continue;
                // else fall through (headerless CSV)
            }

            const desc = row[0];
            const qty = parseFloat(row[1]) || 0;
            const rate = parseFloat(row[2]) || 0;
            const hsn = row[3] ?? '';
            const uom = row[4] || 'NOS';

            if (!desc) continue;

            let status = 'ok';
            if (qty <= 0) {
                warnings.push({ row: desc, issue: 'Quantity is 0 or missing' });
                status = 'error';
            } else if (rate === 0) {
                warnings.push({ row: desc, issue: 'Rate is 0 — total will be ₹0' });
                status = 'warn';
            }

            inv.items.push({ description: desc, qty, rate, hsn, uom, _status: status });

        } else {
            // Key-value meta rows (case-insensitive key matching)
            const key = row[0].toLowerCase();
            const val = row[1] ?? '';

            if (key.includes('number') || key.includes('invoice no') || key.includes('bill no')) inv.invoiceNumber = val;
            else if (key.includes('date')) inv.invoiceDate = val;
            else if (key.includes('receiver name') || key.includes('party') || key.includes('billed to') || key.includes('name')) {
                if (!inv.receiverName) inv.receiverName = val; // only first match
            }
            else if (key.includes('address') || key.includes('addr')) inv.receiverAddr = val;
            else if (key.includes('bank')) inv.bankText = val;
        }
    }

    if (inv.items.length === 0) throw new Error('No valid items found in CSV. Check that your CSV has an "ITEMS" section with at least one row.');
    if (inv.items.length > 50) warnings.push({ row: '', issue: `Large bill: ${inv.items.length} items. PDF may span multiple pages.` });

    return { inv, warnings };
}

/* ═══════════════════════════════════════════════════════════════
   CSV PREVIEW TABLE RENDERER
═══════════════════════════════════════════════════════════════ */
function renderCSVPreview(inv, warnings) {
    const wrap = document.getElementById('csv-preview-wrap');
    if (!wrap) return;

    // Meta grid
    const metaGrid = document.getElementById('csv-meta-grid');
    if (metaGrid) {
        const fields = [
            ['Bill Number', inv.invoiceNumber || '—'],
            ['Bill Date', formatDate(inv.invoiceDate) || '—'],
            ['Party Name', inv.receiverName || '—'],
            ['Address', inv.receiverAddr || '—'],
        ];
        metaGrid.innerHTML = fields.map(([label, val]) => `
          <div class="csv-meta-item">
            <span class="csv-meta-label">${label}</span>
            <span class="csv-meta-value">${esc(val)}</span>
          </div>`).join('');
    }

    // Badge
    const badge = document.getElementById('csv-summary-badge');
    const errCount = warnings.filter(w => w.issue.toLowerCase().includes('quantity')).length;
    const warnCount = warnings.filter(w => w.issue.toLowerCase().includes('rate')).length;
    if (badge) {
        if (errCount > 0) badge.textContent = `⚠ ${inv.items.length} rows, ${errCount} error(s)`;
        else if (warnCount > 0) badge.textContent = `${inv.items.length} rows, ${warnCount} warning(s)`;
        else badge.textContent = `✓ ${inv.items.length} row(s) parsed`;
    }

    // Items table
    const tbody = document.getElementById('csv-items-body');
    if (tbody) {
        const total = inv.items.reduce((s, it) => s + it.qty * it.rate, 0);
        tbody.innerHTML = inv.items.map((it, i) => {
            const statusBadge = it._status === 'error'
                ? '<span class="badge badge-error">🔴 Error</span>'
                : it._status === 'warn'
                    ? '<span class="badge badge-warn">🟡 Rate 0</span>'
                    : '<span class="badge badge-ok">🟢 OK</span>';
            return `<tr>
              <td>${i + 1}</td>
              <td>${esc(it.description)}</td>
              <td class="num">${esc(it.hsn) || '—'}</td>
              <td>${esc(it.uom)}</td>
              <td class="num">${it.qty}</td>
              <td class="num">${fmt(it.rate)}</td>
              <td class="num">${fmt(it.qty * it.rate)}</td>
              <td>${statusBadge}</td>
            </tr>`;
        }).join('') +
            `<tr style="background:#F9FAFB;font-weight:700;">
           <td colspan="6" style="text-align:right;padding-right:12px;">Grand Total</td>
           <td class="num">&#8377; ${fmt(total)}</td>
           <td></td>
         </tr>`;
    }

    // Validation message
    const valMsg = document.getElementById('csv-validation-msg');
    if (valMsg) {
        if (warnings.length === 0) {
            valMsg.textContent = `✓ All ${inv.items.length} items parsed successfully. Click "Generate Bill" to continue.`;
            valMsg.className = 'csv-validation-msg';
        } else {
            const msgs = warnings.map(w => w.row ? `"${w.row}": ${w.issue}` : w.issue).join(' • ');
            valMsg.textContent = `⚠ ${warnings.length} warning(s): ${msgs}`;
            valMsg.className = 'csv-validation-msg ' + (errCount > 0 ? 'has-errors' : 'has-warnings');
        }
    }

    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCSVState(clearDropzone = true) {
    const wrap = document.getElementById('csv-preview-wrap');
    if (wrap) wrap.style.display = 'none';
    csvInvoice = null;
    if (clearDropzone && fileInput) fileInput.value = '';
    hideError();
}

// CSV action buttons
const btnCsvGenerate = document.getElementById('btn-csv-generate');
if (btnCsvGenerate) {
    btnCsvGenerate.addEventListener('click', () => {
        if (!csvInvoice) { showError('No CSV data loaded. Please upload a CSV file first.'); return; }
        renderInvoice(csvInvoice);
        showSection('preview');
        document.getElementById('info-number').textContent = csvInvoice.invoiceNumber || 'CSV';
        document.getElementById('info-customer').textContent = csvInvoice.receiverName || 'Client';
    });
}

const btnCsvReupload = document.getElementById('btn-csv-reupload');
if (btnCsvReupload) {
    btnCsvReupload.addEventListener('click', () => {
        resetCSVState(true);
        showToast('Ready for new upload.');
    });
}

/* ═══════════════════════════════════════════════════════════════
   PDF GENERATION — jsPDF (vector-quality)
═══════════════════════════════════════════════════════════════ */
const btnDownload = document.getElementById('btn-download');
if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        const inv = lastInvoice;
        if (!inv) { showToast('⚠ No bill to download. Please generate a preview first.'); return; }

        const PDFLib = (window.jspdf?.jsPDF) ?? window.jsPDF ?? null;
        if (!PDFLib) {
            alert('PDF engine (jsPDF) failed to load. Please check your internet connection and refresh.');
            return;
        }

        // Build filename
        const safeDate = (inv.invoiceDate || new Date().toISOString().split('T')[0]).replace(/[\/\-]/g, '').slice(0, 8);
        const safeName = (inv.receiverName || 'Client').split(/\s+/).slice(0, 2).join('').replace(/[^a-zA-Z0-9]/g, '') || 'Client';
        const fileName = `${inv.invoiceNumber ? inv.invoiceNumber + '_' : ''}${safeName}_Bill_${safeDate}.pdf`;

        showProgress('Generating PDF…');
        btnDownload.disabled = true;

        // Small delay to let browser render the progress overlay
        await new Promise(r => setTimeout(r, 60));

        try {
            await generatePDF(inv, PDFLib, fileName);
            showToast('✅ PDF downloaded!');
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Failed to generate PDF: ' + (err.message || err));
        } finally {
            hideProgress();
            btnDownload.disabled = false;
        }
    });
}

/**
 * generatePDF — matches reference layout exactly.
 * Double-line header border, ALL CAPS address, BILL with lines above+below,
 * underlined "Details of Receiver" heading, fixed colon column, wide NO column.
 */
async function generatePDF(inv, PDFLib, fileName) {
    const doc = new PDFLib({ orientation: 'p', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });

    const PW   = doc.internal.pageSize.getWidth();
    const PH   = doc.internal.pageSize.getHeight();
    const MX   = 12;
    const FW   = PW - MX * 2;
    const FONT = 'times';

    const setFont    = (style, size) => { doc.setFont(FONT, style); doc.setFontSize(size); };
    const setColor   = (r, g, b)     => doc.setTextColor(r, g, b);
    const resetColor = ()            => setColor(0, 0, 0);
    const hLine      = (y, lw = 0.4) => { doc.setLineWidth(lw); doc.line(MX, y, MX + FW, y); };
    const vLine      = (x, y1, y2, lw = 0.4) => { doc.setLineWidth(lw); doc.line(x, y1, x, y2); };
    const safeText   = (s) => pdfSafe(s);

    let Y = MX + 8;

    // ── HEADER ──────────────────────────────────────────────────
    setFont('bold', 24);
    setColor(198, 40, 40);
    doc.text('DEVI TECHNICAL SERVICES', PW / 2, Y, { align: 'center' });
    Y += 10;

    // Address ALL CAPS, two lines
    setFont('normal', 9);
    resetColor();
    doc.text('A-166, RAJU PARK, NEAR DEVALI VILLAGE,', PW / 2, Y, { align: 'center' });
    Y += 5;
    doc.text('KHANPUR, SOUTH DELHI, NEW DELHI - 110062', PW / 2, Y, { align: 'center' });
    Y += 7;

    // Single line below header
    hLine(Y, 0.5);
    Y += 6;

    // ── BILL TITLE ───────────────────────────────────────────────
    hLine(Y, 0.5);          // line ABOVE
    Y += 6;
    setFont('bold', 14);
    doc.text('BILL', PW / 2, Y, { align: 'center' });
    Y += 5;
    hLine(Y, 0.5);          // line BELOW
    Y += 6;

    // ── META + RECEIVER ──────────────────────────────────────────
    const metaStartY = Y;
    const LX  = MX + 5;
    const COL = LX + 22;          // colon position (left side)
    const MID = MX + FW / 2;      // vertical divider X
    const RX  = MID + 6;          // right column label X
    const RVX = RX + 22;          // right column value X

    // Left: Bill No.
    setFont('bold', 10.5);
    doc.text('Bill No.', LX, Y);
    setFont('normal', 10.5);
    doc.text(': ' + safeText(inv.invoiceNumber || '-'), COL, Y);
    Y += 8;

    // Left: Bill Date
    setFont('bold', 10.5);
    doc.text('Bill Date', LX, Y);
    setFont('normal', 10.5);
    doc.text(': ' + (formatDate(inv.invoiceDate) || '-'), COL, Y);

    // Right column (anchored at metaStartY)
    let RY = metaStartY;
    setFont('bold', 10.5);
    const hdText = 'Details of Receiver | Billed to:';
    doc.text(hdText, RX, RY);
    doc.setLineWidth(0.3);
    doc.line(RX, RY + 1.2, RX + doc.getTextWidth(hdText), RY + 1.2);
    RY += 9;

    setFont('bold', 10.5);
    doc.text('Name', RX, RY);
    setFont('normal', 10.5);
    const nmLines = doc.splitTextToSize(safeText(inv.receiverName || '-'), FW / 2 - 34);
    doc.text(nmLines, RVX, RY);
    RY += Math.max(1, nmLines.length) * 6 + 3;

    setFont('bold', 10.5);
    doc.text('Address', RX, RY);
    setFont('normal', 10.5);
    const addrStr  = safeText((inv.receiverAddr || '').replace(/\n/g, ', '));
    const adLines  = doc.splitTextToSize(addrStr, FW / 2 - 34);
    doc.text(adLines, RVX, RY);
    RY += Math.max(1, adLines.length) * 6 + 3;

    Y = Math.max(Y + 10, RY + 4);
    vLine(MID, metaStartY - 5, Y);
    hLine(Y, 0.5);
    Y += 2;

    // ── ITEMS TABLE ──────────────────────────────────────────────
    const total = inv.items.reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);

    const tableBody = inv.items.map((it, i) => [
        (i + 1) + '.',
        safeText(it.description || ''),
        safeText(it.hsn || ''),
        safeText(it.uom || 'NOS'),
        String(it.qty ?? 0),
        fmt(it.rate ?? 0),
        fmt((it.qty ?? 0) * (it.rate ?? 0)),
    ]);

    // Padding rows (keep at least 2)
    tableBody.push(['', '', '', '', '', '', '']);
    tableBody.push(['', '', '', '', '', '', '']);

    // Column alignment: NO=left, NAME=left, HSN/SAC=center, UOM=center, QTY=center, RATE=right, TOTAL=right
    const COL_ALIGN = { 0: 'left', 1: 'left', 2: 'center', 3: 'center', 4: 'center', 5: 'right', 6: 'right' };

    doc.autoTable({
        startY: Y,
        head: [['NO', 'NAME OF PRODUCT / SERVICE', 'HSN/SAC', 'UOM', 'QTY', 'RATE', 'TOTAL']],
        body: tableBody,
        styles:     { font: FONT, fontSize: 10, cellPadding: { top: 5, right: 4, bottom: 5, left: 4 }, lineWidth: 0.3, textColor: [0, 0, 0], overflow: 'linebreak' },
        headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold', lineWidth: 0.4, fontSize: 10 },
        columnStyles: {
            0: { cellWidth: 22 },   // NO
            1: { cellWidth: 62 },   // NAME OF PRODUCT / SERVICE
            2: { cellWidth: 20 },   // HSN/SAC
            3: { cellWidth: 16 },   // UOM
            4: { cellWidth: 14 },   // QTY
            5: { cellWidth: 26 },   // RATE
            6: { cellWidth: 26 },   // TOTAL
        },
        didParseCell(data) {
            const align = COL_ALIGN[data.column.index];
            if (align) data.cell.styles.halign = align;
        },
        margin: { left: MX, right: MX },
        theme: 'grid',
    });

    Y = (doc.lastAutoTable?.finalY ?? Y + 40) + 1;

    // ── GRAND TOTAL ROW ──────────────────────────────────────────
    hLine(Y, 0.6);
    Y += 7;
    setFont('bold', 11);
    doc.text('Grand Total', MX + 4, Y);
    doc.text('Rs. ' + fmt(total), MX + FW - 4, Y, { align: 'right' });
    Y += 5;
    hLine(Y, 0.6);
    Y += 7;

    // ── AMOUNT IN WORDS ──────────────────────────────────────────
    setFont('normal', 9.5);
    const wordsStr  = 'Amount in Words: ' + safeText(numberToWords(total)) + ' Only';
    const wordsLns  = doc.splitTextToSize(wordsStr, FW - 55);
    doc.text(wordsLns, MX + 4, Y);
    setFont('bold', 11);
    doc.text('Total: Rs. ' + fmt(total), MX + FW - 4, Y, { align: 'right' });
    Y += Math.max(1, wordsLns.length) * 5 + 3;
    hLine(Y, 0.5);
    Y += 7;

    // ── BANK DETAILS ─────────────────────────────────────────────
    const bankLines = (inv.bankText || '').split('\n').filter(Boolean);
    setColor(198, 40, 40);
    setFont('bold', 10.5);
    bankLines.forEach(line => {
        const wrapped = doc.splitTextToSize(safeText(line), FW - 8);
        doc.text(wrapped, PW / 2, Y, { align: 'center' });
        Y += wrapped.length * 5.5 + 1;
    });
    resetColor();
    Y += 4;

    // ── SIGNATURE SECTION ────────────────────────────────────────
    const SIG_H = 32;
    if (Y + SIG_H > PH - MX) { doc.addPage(); Y = MX + 6; }

    hLine(Y, 0.4);
    const sigTop = Y;
    vLine(MID, sigTop, sigTop + SIG_H, 0.4);

    setFont('normal', 9);
    doc.text('(Receiver Name and Sign)', MX + 4, sigTop + SIG_H - 4);

    const RHX = MX + FW * 0.75;
    setFont('bold', 10.5);
    doc.text('For Devi Technical Services', RHX, sigTop + 7, { align: 'center' });

    try {
        const sigImg = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload  = () => resolve(img);
            img.onerror = reject;
            img.src     = 'Sign.png';
        });
        doc.addImage(sigImg, 'PNG', RHX - 18, sigTop + 9, 36, 14);
    } catch { /* signature image not found — skip */ }

    doc.setLineWidth(0.35);
    doc.line(RHX - 22, sigTop + 25, RHX + 22, sigTop + 25);
    setFont('normal', 8.5);
    doc.text('(Authorized Signatory)', RHX, sigTop + 30, { align: 'center' });

    // ── OUTER BORDER ─────────────────────────────────────────────
    const contentBottom = sigTop + SIG_H;
    doc.setLineWidth(0.6);
    doc.rect(MX, MX, FW, contentBottom - MX);

    doc.save(fileName);
}

/* ═══════════════════════════════════════════════════════════════
   BACK & RESET NAVIGATION
═══════════════════════════════════════════════════════════════ */
const btnBackEdit = document.getElementById('btn-back-edit');
if (btnBackEdit) {
    btnBackEdit.addEventListener('click', () => {
        // Determine which tab was active before preview
        const uploadTab = document.querySelector('.nav-tab[data-tab="upload"]');
        const formTab = document.querySelector('.nav-tab[data-tab="form"]');
        if (csvInvoice) {
            // Came from CSV
            document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            uploadTab?.classList.add('active');
            uploadTab?.setAttribute('aria-selected', 'true');
            showSection('upload');
        } else {
            document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            formTab?.classList.add('active');
            formTab?.setAttribute('aria-selected', 'true');
            showSection('form');
        }
    });
}

function resetForm() {
    clearAllErrors();
    const f = id => document.getElementById(id);
    if (f('f-invNo')) f('f-invNo').value = '';
    if (f('f-invDate')) f('f-invDate').valueAsDate = new Date();
    if (f('f-recvName')) f('f-recvName').value = '';
    if (f('f-recvAddr')) f('f-recvAddr').value = '';
    itemCounter = 0;
    if (f('items-body')) { f('items-body').innerHTML = ''; addItemRow(null); }
    lastInvoice = null;
}

const btnResetForm = document.getElementById('btn-reset-form');
if (btnResetForm) btnResetForm.addEventListener('click', resetForm);

const btnNew2 = document.getElementById('btn-new2');
if (btnNew2) {
    btnNew2.addEventListener('click', () => {
        resetForm();
        resetCSVState(true);
        document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        const formTab = document.querySelector('.nav-tab[data-tab="form"]');
        formTab?.classList.add('active');
        formTab?.setAttribute('aria-selected', 'true');
        showSection('form');
    });
}

/* ═══════════════════════════════════════════════════════════════
   SECURITY GATE
═══════════════════════════════════════════════════════════════ */
function checkAuth() {
    const gate = document.getElementById('security-gate');
    if (!gate) return;
    if (sessionStorage.getItem('dt_auth') === 'true') {
        gate.style.display = 'none';
        document.body.style.overflow = '';
    } else {
        gate.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

const gateBtn = document.getElementById('gate-btn');
if (gateBtn) {
    gateBtn.addEventListener('click', () => {
        const pass = document.getElementById('gate-pass')?.value ?? '';
        const errEl = document.getElementById('gate-error');
        if (pass === AUTH_KEY) {
            sessionStorage.setItem('dt_auth', 'true');
            const gate = document.getElementById('security-gate');
            if (gate) {
                gate.style.transition = 'opacity .3s';
                gate.style.opacity = '0';
                setTimeout(() => { gate.style.display = 'none'; gate.style.opacity = ''; }, 320);
            }
            document.body.style.overflow = '';
        } else {
            if (errEl) errEl.style.display = 'block';
            const passEl = document.getElementById('gate-pass');
            if (passEl) { passEl.value = ''; passEl.focus(); }
        }
    });
}

const gatePassEl = document.getElementById('gate-pass');
if (gatePassEl) {
    gatePassEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('gate-btn')?.click();
    });
    gatePassEl.addEventListener('input', () => {
        const errEl = document.getElementById('gate-error');
        if (errEl) errEl.style.display = 'none';
    });
}

window.addEventListener('load', checkAuth);
