package com.godownos.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.godownos.invoice.model.Invoice;
import com.godownos.invoice.model.InvoiceItem;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;
import org.thymeleaf.templateresolver.FileTemplateResolver;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * GodownOS Invoice Generator — CLI tool.
 *
 * <h2>Usage</h2>
 * 
 * <pre>
 *   java -jar invoice-generator.jar [OPTIONS]
 *
 *   Options:
 *     --data      &lt;path&gt;   Path to a JSON invoice data file  (default: built-in demo data)
 *     --template  &lt;path&gt;   Path to a custom HTML template    (default: templates/invoice.html
 *                          beside the JAR, or the bundled classpath template)
 *     --output    &lt;path&gt;   Output PDF file path              (default: invoice.pdf)
 * </pre>
 *
 * <h2>Template resolution order</h2>
 * <ol>
 * <li>Explicit {@code --template} CLI argument</li>
 * <li>External file: {@code ./templates/invoice.html} beside the working
 * directory</li>
 * <li>Bundled classpath template inside the JAR (fallback)</li>
 * </ol>
 *
 * <h2>Data resolution order</h2>
 * <ol>
 * <li>Explicit {@code --data} CLI argument pointing to a JSON file</li>
 * <li>Built-in demo data (useful for quick testing)</li>
 * </ol>
 */
public class InvoiceGenerator {

    private static final String DEFAULT_OUTPUT_PDF = "invoice.pdf";
    private static final String DEFAULT_TEMPLATE_DIR = "templates";
    private static final String TEMPLATE_FILENAME = "invoice.html";
    private static final String TEMPLATE_NAME = "invoice"; // classpath logical name

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    // ──────────────────────────────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {

        System.out.println("=================================================");
        System.out.println("  GodownOS Invoice Generator");
        System.out.println("=================================================");

        String dataPath = parseArg(args, "--data", null);
        String templatePath = parseArg(args, "--template", null);
        String outputPath = parseArg(args, "--output", DEFAULT_OUTPUT_PDF);

        // 1. Load invoice data (from JSON file or built-in demo)
        Invoice invoice = loadInvoice(dataPath);
        System.out.println("[1/3] Invoice data loaded    → " + invoice.getInvoiceNumber()
                + (dataPath != null ? "  [" + dataPath + "]" : "  [demo data]"));

        // 2. Process Thymeleaf template
        String processedHtml = processTemplate(invoice, templatePath);
        System.out.println("[2/3] Template processed     → done");

        // 3. Convert to PDF
        generatePdf(processedHtml, outputPath);
        System.out.println("[3/3] PDF exported           → " + new File(outputPath).getAbsolutePath());
        System.out.println("=================================================");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1 – Load Invoice Data
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Loads invoice data from a JSON file, or returns built-in demo data if
     * no path is provided.
     */
    private static Invoice loadInvoice(String dataPath) throws IOException {
        if (dataPath != null) {
            File file = new File(dataPath);
            if (!file.exists()) {
                throw new IllegalArgumentException("Data file not found: " + file.getAbsolutePath());
            }
            return MAPPER.readValue(file, Invoice.class);
        }
        return buildDemoInvoice();
    }

    /** Built-in demo invoice — used when no --data argument is given. */
    private static Invoice buildDemoInvoice() {
        Invoice invoice = new Invoice();
        invoice.setInvoiceNumber("INV-2026-0042");
        invoice.setInvoiceDate(LocalDate.of(2026, 2, 24));
        invoice.setDueDate(LocalDate.of(2026, 3, 10));
        invoice.setCompanyName("GodownOS Technologies");
        invoice.setCompanyAddress("12B Industrial Estate, Andheri East, Mumbai – 400 093, India");
        invoice.setCompanyEmail("billing@godownos.io");
        invoice.setCustomerName("Rajesh Warehouse Solutions Pvt. Ltd.");
        invoice.setCustomerEmail("accounts@rajeshwh.com");
        invoice.setCustomerAddress("Plot 47, MIDC Bhosari, Pune – 411 026, Maharashtra");
        invoice.setItems(List.of(
                new InvoiceItem("Pallet Storage – Zone A (per pallet/month)", 20, new BigDecimal("850.00")),
                new InvoiceItem("Cold-Chain Storage – Zone C (per sqft/month)", 5, new BigDecimal("1200.00")),
                new InvoiceItem("Inward Handling & Labelling Service", 3, new BigDecimal("2500.00")),
                new InvoiceItem("GodownOS SaaS Licence – Business Plan", 1, new BigDecimal("4999.00"))));
        invoice.setNotes(
                "Payment is due within 15 days. Transfer to HDFC Bank A/C 012345678912, IFSC: HDFC0001234. "
                        + "Thank you for choosing GodownOS.");
        return invoice;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2 – Thymeleaf Template Processing
    // ──────────────────────────────────────────────────────────────────────────

    private static String processTemplate(Invoice invoice, String templatePath) {
        TemplateEngine engine = new TemplateEngine();
        boolean useClasspath;

        if (templatePath != null) {
            // ── Explicit file path from CLI ───────────────────────────────────
            File f = new File(templatePath);
            if (!f.exists()) {
                throw new IllegalArgumentException("Template not found: " + f.getAbsolutePath());
            }
            engine.setTemplateResolver(fileResolverFor(f.getParent(), f.getName()));
            System.out.println("         Template source   → " + f.getAbsolutePath());
            useClasspath = false;

        } else {
            // ── Auto-discover external templates/ folder ──────────────────────
            File externalTemplate = Paths.get(DEFAULT_TEMPLATE_DIR, TEMPLATE_FILENAME).toFile();
            if (externalTemplate.exists()) {
                engine.setTemplateResolver(
                        fileResolverFor(externalTemplate.getParent(), TEMPLATE_FILENAME));
                System.out.println("         Template source   → "
                        + externalTemplate.getAbsolutePath() + "  [external — editable]");
                useClasspath = false;
            } else {
                // ── Bundled fallback ──────────────────────────────────────────
                engine.setTemplateResolver(classpathResolver());
                System.out.println("         Template source   → classpath:/templates/invoice.html  [bundled]");
                useClasspath = true;
            }
        }

        Context context = new Context(Locale.ENGLISH);
        context.setVariable("invoice", invoice);

        // File resolver needs the actual filename; classpath resolver uses the logical
        // name
        return engine.process(useClasspath ? TEMPLATE_NAME : TEMPLATE_FILENAME, context);
    }

    private static FileTemplateResolver fileResolverFor(String directory, String filename) {
        FileTemplateResolver resolver = new FileTemplateResolver();
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setPrefix(directory + File.separator);
        resolver.setSuffix("");
        resolver.setCharacterEncoding("UTF-8");
        resolver.setCacheable(false);
        return resolver;
    }

    private static ClassLoaderTemplateResolver classpathResolver() {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setPrefix("/templates/");
        resolver.setSuffix(".html");
        resolver.setCharacterEncoding("UTF-8");
        resolver.setCacheable(false);
        return resolver;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Step 3 – PDF Rendering
    // ──────────────────────────────────────────────────────────────────────────

    private static void generatePdf(String html, String outputPath) throws IOException {
        File out = new File(outputPath);
        if (out.getParentFile() != null) {
            out.getParentFile().mkdirs();
        }
        try (OutputStream os = new FileOutputStream(out)) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, null);
            builder.toStream(os);
            builder.run();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CLI helpers
    // ──────────────────────────────────────────────────────────────────────────

    private static String parseArg(String[] args, String key, String defaultValue) {
        for (int i = 0; i < args.length - 1; i++) {
            if (key.equalsIgnoreCase(args[i])) {
                return args[i + 1];
            }
        }
        return defaultValue;
    }
}
