# GodownOS Invoice Generator — Web App

> Upload a CSV → Get a PDF. No sign-up. No server. Your data never leaves your browser.

## Live Demo
👉 **[Open Invoice Generator](#)** ← replace with your Netlify / GitHub Pages URL

---

## Deploying

### Option A — Netlify (recommended, takes 2 minutes)
1. Go to [netlify.com](https://netlify.com) and sign in
2. Click **Add new site → Deploy manually**
3. Drag and drop the **`web/`** folder onto the page
4. Done — Netlify gives you a live URL instantly

### Option B — GitHub Pages
1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Set Source to **Deploy from a branch**, choose `main`, folder `/web`
4. Save — your site is live at `https://your-username.github.io/invoice-generator`

---

## How Users Use It

1. Open the link
2. Download the **Sample CSV**, fill it in with their invoice details
3. Drag & drop (or click to upload) their CSV
4. Click **Download PDF** — invoice downloads instantly
5. All data is cleared automatically

---

## CSV Format

| Field | What to fill in |
|---|---|
| `Invoice Number` | e.g. `INV-2026-001` |
| `Invoice Date` | `YYYY-MM-DD` format |
| `Due Date` | `YYYY-MM-DD` format |
| `Company Name/Address/Email` | Your business details |
| `Customer Name/Email/Address` | Your client's details |
| `Notes` | Payment instructions |
| Items (after `ITEMS` row) | `Description, Quantity, Unit Price` per row |

> GST (18%) and Grand Total are calculated automatically.
