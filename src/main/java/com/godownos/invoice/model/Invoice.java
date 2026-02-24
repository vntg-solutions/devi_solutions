package com.godownos.invoice.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Top-level invoice data object passed into the Thymeleaf template.
 */
public class Invoice {

    private String invoiceNumber;
    private LocalDate invoiceDate;
    private LocalDate dueDate;

    // Customer details
    private String customerName;
    private String customerEmail;
    private String customerAddress;

    // Sender / company details
    private String companyName;
    private String companyAddress;
    private String companyEmail;

    private List<InvoiceItem> items;
    private String notes;

    public Invoice() {}

    // ── Derived ──────────────────────────────────────────────────────────────

    /** Sum of all item totals (subtotal). */
    public BigDecimal getSubtotal() {
        return items == null ? BigDecimal.ZERO
                : items.stream()
                       .map(InvoiceItem::getTotal)
                       .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Tax amount at 18 % GST. */
    public BigDecimal getTax() {
        return getSubtotal().multiply(new BigDecimal("0.18"))
                            .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /** Grand total including tax. */
    public BigDecimal getGrandTotal() {
        return getSubtotal().add(getTax())
                            .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    // ── Getters & Setters ────────────────────────────────────────────────────

    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }

    public LocalDate getInvoiceDate() { return invoiceDate; }
    public void setInvoiceDate(LocalDate invoiceDate) { this.invoiceDate = invoiceDate; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public String getCustomerAddress() { return customerAddress; }
    public void setCustomerAddress(String customerAddress) { this.customerAddress = customerAddress; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getCompanyAddress() { return companyAddress; }
    public void setCompanyAddress(String companyAddress) { this.companyAddress = companyAddress; }

    public String getCompanyEmail() { return companyEmail; }
    public void setCompanyEmail(String companyEmail) { this.companyEmail = companyEmail; }

    public List<InvoiceItem> getItems() { return items; }
    public void setItems(List<InvoiceItem> items) { this.items = items; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
