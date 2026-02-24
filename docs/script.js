/* Devi Technical Services — Bill Generator Logic (refactored, jsPDF-based) */

const { jsPDF } = window.jspdf || {};

const PRODUCTS = [
    { name: "Canon IR-3225 Photocopier & Network Printer Rent", hsn: "", uom: "NOS", rate: 3600 },
    { name: "Printer Cartridge Replacement", hsn: "", uom: "NOS", rate: 2500 },
    { name: "Annual Maintenance Contract (AMC)", hsn: "", uom: "NOS", rate: 12000 },
    { name: "Network Setup & Configuration", hsn: "", uom: "NOS", rate: 5000 },
    { name: "CCTV Camera Installation", hsn: "", uom: "NOS", rate: 4500 },
    { name: "Computer Hardware Repair", hsn: "", uom: "HRS", rate: 800 },
];

const BANKS = [
    { name: "Jaya Mishra", acNo: "677802010011687", bank: "Union Bank", ifsc: "UBIN0567787" },
    { name: "Devi Technical Services", acNo: "920020043613270", bank: "Axis Bank", ifsc: "UTIB0001234" },
];

/* ── State ──────────────────────────────────────────────── */
let itemCounter = 0;
let lastInvoice = null;

/* ── Tab switching ──────────────────────────────────────── */
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const targetSection = document.getElementById('sec-' + tab.dataset.tab);
        if (targetSection) targetSection.classList.add('active');
    });
});

/* ── Bank select toggle ─────────────────────────────────── */
const bankSelect = document.getElementById('f-bank');
if (bankSelect) {
    bankSelect.addEventListener('change', e => {
        const customField = document.getElementById('custom-bank-field');
        if (customField) customField.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
}

/* ── Item rows ──────────────────────────────────────────── */
function buildProductOptions() {
    return '<option value="">— Select preset —</option>' +
        PRODUCTS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('') +
        '<option value="custom">✏️ Type manual product...</option>';
}

function addItemRow(data) {
    itemCounter++;
    const id = itemCounter;
    const tbody = document.getElementById('items-body');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML = `
    <td style="text-align:center;font-weight:700;padding-top:14px;">${id}</td>
    <td>
      <select class="item-select" data-id="${id}">${buildProductOptions()}</select>
      <textarea class="item-desc" data-id="${id}" placeholder="Type product/service name here..." style="margin-top:8px; display:${data && !isPreset(data.description) ? 'block' : 'none'};">${esc(data?.description || '')}</textarea>
    </td>
    <td><input type="text" class="item-hsn" data-id="${id}" value="${esc(data?.hsn || '')}" placeholder="—" /></td>
    <td><input type="text" class="item-uom" data-id="${id}" value="${esc(data?.uom || 'NOS')}" /></td>
    <td><input type="number" class="item-qty" data-id="${id}" value="${data?.qty || 1}" min="1" class="num" /></td>
    <td><input type="number" class="item-rate" data-id="${id}" value="${data?.rate || ''}" min="0" step="0.01" class="num" placeholder="0.00" /></td>
    <td class="row-total" data-id="${id}">0.00</td>
    <td><button class="btn-remove" data-id="${id}">✕</button></td>
  `;
    tbody.appendChild(tr);

    function isPreset(name) { return PRODUCTS.some(p => p.name === name); }

    const sel = tr.querySelector('.item-select');
    const desc = tr.querySelector('.item-desc');

    sel.addEventListener('change', e => {
        if (e.target.value === 'custom') {
            desc.style.display = 'block';
            desc.value = '';
            desc.focus();
        } else if (e.target.value === '') {
            desc.style.display = 'none';
            desc.value = '';
        } else {
            const p = PRODUCTS[parseInt(e.target.value)];
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
    tr.querySelector('.btn-remove').addEventListener('click', () => { tr.remove(); renumberRows(); });

    if (data) calcRowTotal(tr);
}

function calcRowTotal(tr) {
    const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.item-rate')?.value) || 0;
    tr.querySelector('.row-total').textContent = fmt(qty * rate);
}

function renumberRows() {
    const rows = document.querySelectorAll('#items-body tr');
    rows.forEach((tr, i) => {
        const cell = tr.querySelector('td');
        if (cell) cell.textContent = i + 1;
    });
}

const btnAddRow = document.getElementById('btn-add-item');
if (btnAddRow) btnAddRow.addEventListener('click', () => addItemRow(null));

// Initial call
const itemsBody = document.getElementById('items-body');
if (itemsBody && itemsBody.children.length === 0) addItemRow(null);

const invDatePicker = document.getElementById('f-invDate');
if (invDatePicker) invDatePicker.valueAsDate = new Date();

/* ── Actions ───────────────────────────────────────────── */
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

function collectFormData() {
    const inv = {
        invoiceNumber: document.getElementById('f-invNo').value.trim(),
        invoiceDate: document.getElementById('f-invDate').value,
        receiverName: document.getElementById('f-recvName').value.trim(),
        receiverAddr: document.getElementById('f-recvAddr').value.trim(),
        items: [], bankText: ''
    };

    if (!inv.invoiceNumber) { alert('Please enter Bill Number.'); return null; }
    if (!inv.receiverName) { alert('Please enter Party Name.'); return null; }

    document.querySelectorAll('#items-body tr').forEach(tr => {
        const description = tr.querySelector('.item-desc')?.value.trim();
        const hsn = tr.querySelector('.item-hsn')?.value.trim() || '';
        const uom = tr.querySelector('.item-uom')?.value.trim() || 'NOS';
        const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(tr.querySelector('.item-rate')?.value) || 0;
        if (description && qty > 0) inv.items.push({ description, hsn, uom, qty, rate });
    });

    if (inv.items.length === 0) { alert('Please add at least one item.'); return null; }

    const bankSel = document.getElementById('f-bank').value;
    if (bankSel === 'custom') {
        inv.bankText = document.getElementById('f-bankCustom').value.trim() || '—';
    } else {
        const b = BANKS[parseInt(bankSel)];
        inv.bankText = `Bank Detail: ${b.name}\nA/C NO- ${b.acNo} ${b.bank} IFSC CODE –\n${b.ifsc}`;
    }

    return inv;
}

function renderInvoice(inv) {
    const el = document.getElementById('invoice-render');
    lastInvoice = inv;
    const total = inv.items.reduce((s, i) => s + i.qty * i.rate, 0);

    const itemRows = inv.items.map((item, idx) => `
    <tr>
      <td class="c">${idx + 1}.</td>
      <td>${esc(item.description)}</td>
      <td class="c">${esc(item.hsn)}</td>
      <td class="c">${esc(item.uom)}</td>
      <td class="c">${item.qty}</td>
      <td class="r">${fmt(item.rate)}</td>
      <td class="r">${fmt(item.qty * item.rate)}</td>
    </tr>`).join('');

    const emptyRows = Array(Math.max(0, 6 - inv.items.length)).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
    const bankLines = (inv.bankText || '').split('\n').map(l => esc(l)).join('<br>');

    el.innerHTML = `
    <div class="bill-header">
      <div class="bill-company">Devi Technical Services</div>
      <div class="bill-address">A-166 RAJU PARK NEAR DEVALI VILLAGE,<br>KHANPUR SOUTH DELHI, NEW DELHI-110062</div>
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
          <th style="width:6%">Sr No</th>
          <th style="width:40%">Name of Product / Service</th>
          <th style="width:10%">HSN/SAC</th>
          <th style="width:8%">UOM</th>
          <th style="width:8%">Qty</th>
          <th style="width:14%">Rate</th>
          <th style="width:14%">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${emptyRows}
        <tr class="bill-total-row">
          <td colspan="6" style="text-align:right; font-weight:800; border-top:2px solid #000;">Grand Total</td>
          <td style="text-align:right; font-weight:800; border-top:2px solid #000;">${fmt(total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="bill-amount-words">
      <span><strong>Amount in Words:</strong> ${numberToWords(total)} Only</span>
      <div class="total-final">Total: &#8377; ${fmt(total)}</div>
    </div>

    <div class="bill-bank-section">${bankLines}</div>

    <div class="bill-footer">
      <div class="bill-footer-left">(Receiver Name and Sign)</div>
      <div class="bill-footer-right">
        <div class="for-label">For Devi Technical Services</div>
        <img src="Sign.png" alt="Signature">
        <div class="sig-label">(Authorized Signatory)</div>
      </div>
    </div>
  `;
}

/* ── CSV ────────────────────────────────────────────────── */
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    ['dragover', 'dragenter'].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.add('drag-over')));
    ['dragleave', 'drop'].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.remove('drag-over')));
    dropZone.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleCSV(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) handleCSV(e.target.files[0]); });
}

function handleCSV(f) {
    hideError();
    if (!f.name.endsWith('.csv')) { showError('Invalid file type.'); return; }
    Papa.parse(f, {
        skipEmptyLines: true,
        complete(r) {
            try {
                const inv = parseCSV(r.data);
                renderInvoice(inv);
                showSection('preview');
                document.getElementById('info-number').textContent = inv.invoiceNumber;
                document.getElementById('info-customer').textContent = inv.receiverName;
            } catch (e) { showError(e.message); }
        }
    });
}

function parseCSV(rows) {
    const inv = { invoiceNumber: '', invoiceDate: '', receiverName: '', receiverAddr: '', bankText: '', items: [] };
    let inItems = false;
    for (const row of rows) {
        const c0 = (row[0] || '').trim(); if (!c0) continue;
        if (c0.toUpperCase() === 'ITEMS') { inItems = true; continue; }
        if (inItems) {
            if (c0.toLowerCase().startsWith('description')) continue;
            const desc = c0;
            const qty = parseFloat(row[1]) || 0;
            const rate = parseFloat(row[2]) || 0;
            const hsn = (row[3] || '').trim();
            const uom = ((row[4] || '').trim()) || 'NOS';
            if (desc && qty) inv.items.push({ description: desc, qty, rate, hsn, uom });
        } else {
            const k = c0.toLowerCase(), v = (row[1] || '').trim();
            if (k.includes('number')) inv.invoiceNumber = v;
            else if (k.includes('date')) inv.invoiceDate = v;
            else if (k.includes('name')) inv.receiverName = v;
            else if (k.includes('address')) inv.receiverAddr = v;
            else if (k.includes('bank')) inv.bankText = v;
        }
    }
    return inv;
}

/* ── PDF Generation (jsPDF, vector-based) ───────────────── */
const btnDownload = document.getElementById('btn-download');
if (btnDownload) {
    btnDownload.addEventListener('click', () => {
        const inv = lastInvoice || collectFormData();
        if (!inv) return;

        if (!jsPDF) {
            alert('PDF engine failed to load.');
            return;
        }

        const customerName = inv.receiverName || 'Client';
        const invoiceNumber = inv.invoiceNumber || '';
        const safeDateRaw = inv.invoiceDate || new Date().toISOString().split('T')[0];
        const safeDate = safeDateRaw.replace(/[\/\-]/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '');
        const nameParts = customerName.split(/\s+/).filter(p => p.length > 0).slice(0, 2);
        const safeName = nameParts.length > 0 ? nameParts.join('').replace(/[^a-zA-Z0-9]/g, '') : 'Client';
        const fileNamePrefix = invoiceNumber ? `${invoiceNumber}_` : '';
        const fileName = `${fileNamePrefix}${safeName}_Bill_${safeDate}.pdf`;

        showToast('🔄 Generating PDF...');

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const marginX = 12;
        const marginY = 12;
        const frameWidth = pageWidth - marginX * 2;
        const frameHeight = pageHeight - marginY * 2;

        // Outer frame
        doc.setLineWidth(0.6);
        doc.rect(marginX, marginY, frameWidth, frameHeight);

        let cursorY = marginY + 8;

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(198, 40, 40);
        doc.text('DEVI TECHNICAL SERVICES', pageWidth / 2, cursorY, { align: 'center' });

        cursorY += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text('A-166, Raju Park, Near Devali Village, Khanpur, South Delhi, New Delhi-110062', pageWidth / 2, cursorY, { align: 'center' });

        cursorY += 8;
        doc.setLineWidth(0.4);
        doc.line(marginX, cursorY, marginX + frameWidth, cursorY);

        // Bill title
        cursorY += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('BILL', marginX + 3, cursorY);

        cursorY += 4;
        doc.line(marginX, cursorY, marginX + frameWidth, cursorY);

        // Meta + receiver block
        cursorY += 6;
        const metaLeftX = marginX + 3;
        const metaRightX = marginX + frameWidth / 2 + 3;

        doc.setFontSize(10);
        doc.text('Bill No.:', metaLeftX, cursorY);
        doc.setFont('helvetica', 'bold');
        doc.text(inv.invoiceNumber || '-', metaLeftX + 20, cursorY);

        doc.setFont('helvetica', 'normal');
        doc.text('Bill Date:', metaLeftX, cursorY + 6);
        doc.setFont('helvetica', 'bold');
        doc.text(formatDate(inv.invoiceDate) || '-', metaLeftX + 20, cursorY + 6);

        doc.setFont('helvetica', 'bold');
        doc.text('Details of Receiver | Billed to:', metaRightX, cursorY);

        doc.setFont('helvetica', 'normal');
        doc.text('Name:', metaRightX, cursorY + 6);
        doc.text(inv.receiverName || '-', metaRightX + 18, cursorY + 6);

        const addressLines = (inv.receiverAddr || '').split('\n');
        doc.text('Address:', metaRightX, cursorY + 12);
        const addrYStart = cursorY + 12;
        addressLines.forEach((line, i) => {
            doc.text(line || '-', metaRightX + 18, addrYStart + i * 5);
        });

        cursorY = addrYStart + Math.max(1, addressLines.length) * 5 + 4;
        doc.line(marginX, cursorY, marginX + frameWidth, cursorY);

        // Items table via autoTable
        const body = inv.items.map((it, idx) => ([
            String(idx + 1),
            it.description || '',
            it.hsn || '',
            it.uom || 'NOS',
            String(it.qty || 0),
            fmt(it.rate || 0),
            fmt((it.qty || 0) * (it.rate || 0))
        ]));

        const total = inv.items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0);

        const autoTableOptions = {
            startY: cursorY + 4,
            head: [[
                'Sr No', 'Name of Product / Service', 'HSN/SAC',
                'UOM', 'Qty', 'Rate', 'Total'
            ]],
            body,
            styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.2 },
            headStyles: { fillColor: [240, 240, 240], textColor: 0, halign: 'center' },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 70 },
                2: { cellWidth: 18, halign: 'center' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 12, halign: 'center' },
                5: { cellWidth: 20, halign: 'right' },
                6: { cellWidth: 22, halign: 'right' }
            },
            margin: { left: marginX + 1, right: marginX + 1 }
        };

        if (doc.autoTable) {
            doc.autoTable(autoTableOptions);
        } else {
            // Fallback: simple text rows if autotable is unavailable
            let y = cursorY + 10;
            doc.setFontSize(10);
            body.forEach(row => {
                doc.text(row.join(' | '), marginX + 3, y);
                y += 5;
            });
        }

        const finalY = (doc.autoTable && doc.lastAutoTable)
            ? doc.lastAutoTable.finalY || (cursorY + 40)
            : cursorY + 40;

        // Grand total row
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Grand Total:', marginX + frameWidth - 55, finalY + 8);
        doc.text(fmt(total), marginX + frameWidth - 5, finalY + 8, { align: 'right' });

        // Amount in words + total band
        const words = numberToWords(total) || 'Zero';
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Amount in Words: ${words} Only`, marginX + 3, finalY + 18);

        doc.setFont('helvetica', 'bold');
        doc.text(`Total: ₹ ${fmt(total)}`, marginX + frameWidth - 5, finalY + 18, { align: 'right' });

        // Bank details
        let bankY = finalY + 30;
        const bankLines = (inv.bankText || '').split('\n').filter(Boolean);
        if (bankLines.length) {
            doc.setTextColor(198, 40, 40);
            doc.setFontSize(10);
            bankLines.forEach((line, i) => {
                doc.text(line, marginX + 3, bankY + i * 5);
            });
            doc.setTextColor(0, 0, 0);
            bankY += bankLines.length * 5 + 4;
        }

        // Signature area
        const sigTop = pageHeight - marginY - 28;
        doc.setFontSize(10);
        doc.text('For Devi Technical Services', marginX + frameWidth - 3, sigTop, { align: 'right' });
        doc.line(marginX + frameWidth - 40, sigTop + 14, marginX + frameWidth - 3, sigTop + 14);
        doc.setFontSize(8);
        doc.text('(Authorized Signatory)', marginX + frameWidth - 3, sigTop + 20, { align: 'right' });

        doc.save(fileName);
        showToast('✅ Download Started!');
    });
}

const btnBackEdit = document.getElementById('btn-back-edit');
if (btnBackEdit) btnBackEdit.addEventListener('click', () => showSection('form'));

/* ── Auth Logic ────────────────────────────────────────── */
const AUTH_KEY = 'DEVI@2026';

function checkAuth() {
    const gate = document.getElementById('security-gate');
    if (!gate) return;
    if (sessionStorage.getItem('dt_auth') === 'true') {
        gate.style.display = 'none';
        document.body.style.overflow = 'auto';
    } else {
        gate.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

const gateBtn = document.getElementById('gate-btn');
if (gateBtn) {
    gateBtn.addEventListener('click', () => {
        const pass = document.getElementById('gate-pass').value;
        if (pass === AUTH_KEY) {
            sessionStorage.setItem('dt_auth', 'true');
            checkAuth();
        } else {
            const err = document.getElementById('gate-error');
            if (err) err.style.display = 'block';
            const passInput = document.getElementById('gate-pass');
            if (passInput) {
                passInput.value = '';
                passInput.focus();
            }
        }
    });
}

const gatePassInput = document.getElementById('gate-pass');
if (gatePassInput) {
    gatePassInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('gate-btn').click();
    });
}

window.addEventListener('load', checkAuth);

const btnResetForm = document.getElementById('btn-reset-form');
if (btnResetForm) btnResetForm.addEventListener('click', resetForm);

const btnNew2 = document.getElementById('btn-new2');
if (btnNew2) btnNew2.addEventListener('click', () => { resetForm(); showSection('form'); });

function resetForm() {
    const invNo = document.getElementById('f-invNo');
    const invDate = document.getElementById('f-invDate');
    const recvName = document.getElementById('f-recvName');
    const recvAddr = document.getElementById('f-recvAddr');
    const itemsBody = document.getElementById('items-body');

    if (invNo) invNo.value = '';
    if (invDate) invDate.valueAsDate = new Date();
    if (recvName) recvName.value = '';
    if (recvAddr) recvAddr.value = '';
    if (itemsBody) {
        itemsBody.innerHTML = '';
        addItemRow(null);
    }
}

function fmt(n) { return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: '2-digit', year: 'numeric' });
}
function showSection(n) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById('sec-' + n);
    if (section) section.classList.add('active');
    window.scrollTo(0, 0);
}
function showToast(m) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = m;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
}
function showError(m) {
    const e = document.getElementById('error-box');
    if (e) {
        e.style.display = 'block';
        const msg = document.getElementById('error-msg');
        if (msg) msg.textContent = m;
    }
}
function hideError() {
    const e = document.getElementById('error-box');
    if (e) e.style.display = 'none';
}

function numberToWords(num) {
    const n = Math.floor(num); if (n === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function t(n) { return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); }
    function h(n) { return n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + t(n % 100) : '') : t(n); }
    const c = Math.floor(n / 10000000), l = Math.floor((n % 10000000) / 100000), k = Math.floor((n % 100000) / 1000), r = n % 1000;
    let res = '';
    if (c) res += h(c) + ' Crore '; if (l) res += t(l) + ' Lakh '; if (k) res += t(k) + ' Thousand '; if (r) res += h(r);
    return res.trim();
}
