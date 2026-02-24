# GodownOS Invoice Generator

A two-part project for generating PDF invoices.

## Web App (for end-users)
The `web/` folder contains a **static, client-side web app** that non-technical users interact with:

- User uploads a CSV file with their invoice data
- Invoice is rendered and previewed instantly in the browser
- One-click PDF download — no data is stored or sent to any server
- Deploy to **Netlify** or **GitHub Pages** (no backend needed)

� See [`web/README.md`](web/README.md) for deploy instructions.

---

## Java CLI Tool (for developers)
The Maven project in `src/` is the original backend tool used to generate PDFs programmatically:

```powershell
# Build
mvn package -q

# Run with a JSON data file
java -jar target\invoice-generator-1.0-SNAPSHOT.jar --data data\invoice.json --output invoice.pdf
```

- Template: `templates/invoice.html` (edit without recompiling)
- Data files: `data/*.json`
- Tech: Java 17, Thymeleaf, OpenHTMLToPDF
