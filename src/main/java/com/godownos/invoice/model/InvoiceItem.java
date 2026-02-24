package com.godownos.invoice.model;

import java.math.BigDecimal;

/**
 * Represents a single line item on an invoice.
 */
public class InvoiceItem {

    private String description;
    private int quantity;
    private BigDecimal unitPrice;

    public InvoiceItem() {}

    public InvoiceItem(String description, int quantity, BigDecimal unitPrice) {
        this.description = description;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
    }

    // ── Derived ──────────────────────────────────────────────────────────────

    /** Returns quantity × unitPrice. */
    public BigDecimal getTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }

    // ── Getters & Setters ────────────────────────────────────────────────────

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }
}
