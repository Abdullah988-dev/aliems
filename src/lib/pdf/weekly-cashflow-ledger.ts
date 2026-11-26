import { GState, jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { WeeklyCashFlowReportData } from "@/types/domain";

// Strict Single-Color Palette: Dark Navy Blue (#0F294A) + White + Subtle Navy-Grey Tints
const NAVY: [number, number, number] = [15, 41, 74];
const WHITE: [number, number, number] = [255, 255, 255];
const TINT_SUBTLE: [number, number, number] = [241, 245, 249];
const TINT_SUMMARY: [number, number, number] = [232, 238, 245];

const PAGE_WIDTH = 210; // A4 portrait width in mm
const PAGE_HEIGHT = 297; // A4 portrait height in mm
const MARGIN_LEFT = 12;
const MARGIN_RIGHT = 12;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 186mm
const HEADER_CONTINUATION_START_Y = 31;

function formatRs(amount: number): string {
  const safe = Number.isFinite(amount)
    ? Math.abs(amount) < 0.005
      ? 0
      : amount
    : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? "-" : ""}Rs. ${formatted}`;
}

function formatTableNum(amount: number): string {
  const safe = Number.isFinite(amount)
    ? Math.abs(amount) < 0.005
      ? 0
      : amount
    : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? "-" : ""}${formatted}`;
}

function formatDisplayDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function clampDescription(text: string, maxChars = 76): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 3).trim()}...`;
}

function drawAeMonogram(doc: jsPDF, x: number, y: number) {
  const size = 13;
  // Crisp outer solid Dark Navy rounded badge
  doc.setFillColor(...NAVY);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, size, size, 2.2, 2.2, "FD");

  // Crisp inner white vector frame
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.35);
  doc.roundedRect(x + 1.1, y + 1.1, size - 2.2, size - 2.2, 1.4, 1.4, "S");

  // Vector AE monogram initials
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("AE", x + size / 2, y + size / 2 + 1.6, {
    align: "center",
  });
}

function drawDiagonalWatermarks(doc: jsPDF) {
  const gStateLow = new GState({ opacity: 0.06 });
  const gStateFull = new GState({ opacity: 1 });

  doc.setGState(gStateLow);
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);

  const positions = [
    { x: PAGE_WIDTH / 2, y: 88 },
    { x: PAGE_WIDTH / 2, y: 162 },
    { x: PAGE_WIDTH / 2, y: 236 },
  ];

  for (const pos of positions) {
    doc.text("ALI ELECTRONIC", pos.x, pos.y, {
      align: "center",
      angle: 35,
    });
  }

  doc.setGState(gStateFull);
}

function drawPageHeader(doc: jsPDF, shopHeaderUpper: string) {
  const topY = 10.5;
  drawAeMonogram(doc, MARGIN_LEFT, topY);

  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(shopHeaderUpper, rightX, topY + 6.2, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("WEEKLY SUPPLIER CASH FLOW", rightX, topY + 11.4, {
    align: "right",
  });

  // Thin Dark Navy horizontal divider line below header
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.45);
  doc.line(MARGIN_LEFT, 26, PAGE_WIDTH - MARGIN_RIGHT, 26);
}

function drawSupplierMetadataBlock(
  doc: jsPDF,
  report: WeeklyCashFlowReportData,
): number {
  const titleY = 33;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text("WEEKLY CASH FLOW LEDGER", PAGE_WIDTH / 2, titleY, {
    align: "center",
  });

  const boxX = MARGIN_LEFT;
  const boxY = 36.5;
  const boxW = CONTENT_WIDTH; // 186mm
  const rowH = 7;
  const boxH = rowH * 3; // 21mm
  const midX = boxX + 106;

  // Outer border & background
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.35);
  doc.rect(boxX, boxY, boxW, boxH, "FD");

  // Subtle navy-grey tint for label cells on left & middle
  doc.setFillColor(...TINT_SUBTLE);
  doc.rect(boxX, boxY, 34, rowH * 3, "F");
  doc.rect(midX, boxY, 30, rowH * 2, "F");

  // Highlighted Opening Balance row value tint
  doc.setFillColor(...TINT_SUMMARY);
  doc.rect(boxX + 34, boxY + rowH * 2, boxW - 34, rowH, "F");

  // Re-stroke borders and internal grid lines cleanly in Dark Navy Blue
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.rect(boxX, boxY, boxW, boxH, "S");
  doc.line(boxX, boxY + rowH, boxX + boxW, boxY + rowH);
  doc.line(boxX, boxY + rowH * 2, boxX + boxW, boxY + rowH * 2);
  doc.line(boxX + 34, boxY, boxX + 34, boxY + boxH);
  doc.line(midX, boxY, midX, boxY + rowH * 2);
  doc.line(midX + 30, boxY, midX + 30, boxY + rowH * 2);

  const supplierDisplay = report.isBlankManual
    ? "____________________________________"
    : report.supplierName.toUpperCase();
  const openingDisplay = report.isBlankManual
    ? "Rs. ______________________"
    : formatRs(report.openingBalance);

  // Text labels & values
  doc.setTextColor(...NAVY);
  doc.setFontSize(8.5);

  // Row 1
  doc.setFont("helvetica", "bold");
  doc.text("SUPPLIER NAME", boxX + 2.5, boxY + 4.8);
  doc.text(supplierDisplay, boxX + 36.5, boxY + 4.8, { maxWidth: 67 });
  doc.text("SHOP NAME", midX + 2.5, boxY + 4.8);
  doc.setFont("helvetica", "normal");
  doc.text(report.shopName, midX + 32.5, boxY + 4.8, { maxWidth: 46 });

  // Row 2
  doc.setFont("helvetica", "bold");
  doc.text("WEEK / PERIOD", boxX + 2.5, boxY + rowH + 4.8);
  doc.setFont("helvetica", "normal");
  doc.text(report.periodLabel, boxX + 36.5, boxY + rowH + 4.8, { maxWidth: 67 });
  doc.setFont("helvetica", "bold");
  doc.text("DATE", midX + 2.5, boxY + rowH + 4.8);
  doc.setFont("helvetica", "normal");
  doc.text(formatDisplayDate(report.printDate), midX + 32.5, boxY + rowH + 4.8);

  // Row 3
  doc.setFont("helvetica", "bold");
  doc.text("OPENING BALANCE", boxX + 2.5, boxY + rowH * 2 + 4.8);
  doc.setFontSize(9.5);
  doc.text(openingDisplay, boxX + 36.5, boxY + rowH * 2 + 4.9);

  return boxY + boxH + 4.5; // Start Y for main ledger table (62mm)
}

function drawSummaryBox(
  doc: jsPDF,
  startY: number,
  report: WeeklyCashFlowReportData,
): number {
  const boxW = 118;
  const boxX = PAGE_WIDTH - MARGIN_RIGHT - boxW;
  const labelW = 72;
  const rowH = 8.5;
  const finalRowH = 10.5;

  // Row 1: TOTAL AMOUNT
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.rect(boxX, startY, boxW, rowH, "FD");
  doc.line(boxX + labelW, startY, boxX + labelW, startY + rowH);

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL AMOUNT", boxX + 3, startY + 5.7);
  doc.text(
    report.isBlankManual ? "Rs. ____________" : formatRs(report.totalAmount),
    boxX + boxW - 3,
    startY + 5.7,
    { align: "right" },
  );

  // Row 2: TOTAL PAYMENT / AMOUNT MINUS
  const row2Y = startY + rowH;
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.rect(boxX, row2Y, boxW, rowH, "FD");
  doc.line(boxX + labelW, row2Y, boxX + labelW, row2Y + rowH);

  doc.text("TOTAL PAYMENT / AMOUNT MINUS", boxX + 3, row2Y + 5.7);
  doc.text(
    report.isBlankManual ? "Rs. ____________" : formatRs(report.totalAmountPaid),
    boxX + boxW - 3,
    row2Y + 5.7,
    { align: "right" },
  );

  // Row 3: FINAL REMAINING BALANCE (prominent single-color navy highlight)
  const row3Y = row2Y + rowH;
  doc.setFillColor(...TINT_SUMMARY);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.rect(boxX, row3Y, boxW, finalRowH, "FD");
  doc.line(boxX + labelW, row3Y, boxX + labelW, row3Y + finalRowH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("FINAL REMAINING BALANCE", boxX + 3, row3Y + 6.9);
  doc.setFontSize(10.5);
  doc.text(
    report.isBlankManual
      ? "Rs. ____________"
      : formatRs(report.finalRemainingBalance),
    boxX + boxW - 3,
    row3Y + 7,
    { align: "right" },
  );

  return row3Y + finalRowH;
}

function drawSignatureFooter(
  doc: jsPDF,
  y: number,
  report: WeeklyCashFlowReportData,
) {
  const col1Center = MARGIN_LEFT + 24;
  const col2Center = PAGE_WIDTH / 2;
  const col3Center = PAGE_WIDTH - MARGIN_RIGHT - 26;
  const lineHalfW = 24;

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.35);
  doc.line(col1Center - lineHalfW, y, col1Center + lineHalfW, y);
  doc.line(col2Center - lineHalfW - 4, y, col2Center + lineHalfW + 4, y);
  doc.line(col3Center - lineHalfW - 2, y, col3Center + lineHalfW + 2, y);

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Date", col1Center, y + 4.8, { align: "center" });
  doc.text(`${report.shopName} Signature`, col2Center, y + 4.8, {
    align: "center",
  });

  const supplierSigLabel = report.isBlankManual
    ? "Supplier Signature"
    : `${report.supplierName} Signature`;
  doc.text(supplierSigLabel, col3Center, y + 4.8, {
    align: "center",
    maxWidth: 54,
  });
}

export function buildWeeklyCashFlowPdfDoc(
  report: WeeklyCashFlowReportData,
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const shopHeaderUpper =
    report.shopName.trim().toUpperCase() || "ALI ELECTRONIC";

  // Page 1 setup: watermark behind everything, header, title + metadata box
  drawDiagonalWatermarks(doc);
  drawPageHeader(doc, shopHeaderUpper);
  const page1TableStartY = drawSupplierMetadataBlock(doc, report);

  // Build rows: live chronological rows + configured blank handwritten rows
  const tableRows: string[][] = report.rows.map((row) => [
    formatDisplayDate(row.date),
    row.thisWeekAmount > 0 ? formatTableNum(row.thisWeekAmount) : "-",
    row.amountPaid > 0 ? formatTableNum(row.amountPaid) : "-",
    formatTableNum(row.totalAmount),
    formatTableNum(row.remainingBalance),
    clampDescription(row.description),
  ]);

  for (let i = 0; i < report.blankRows; i++) {
    tableRows.push(["", "", "", "", "", ""]);
  }

  // Exact 6 columns: cols 1-5 compactly sized so col 6 (Description) takes all remaining width
  autoTable(doc, {
    startY: page1TableStartY,
    margin: {
      top: HEADER_CONTINUATION_START_Y,
      right: MARGIN_RIGHT,
      bottom: MARGIN_BOTTOM + 6,
      left: MARGIN_LEFT,
    },
    tableWidth: CONTENT_WIDTH,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    theme: "grid",
    head: [
      [
        "Date",
        "This Week\nAmount (Rs.)",
        "Amount Paid\n(Minus) (Rs.)",
        "Total Amount\n(Rs.)",
        "Remaining\nBalance (Rs.)",
        "Description",
      ],
    ],
    body: tableRows,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: NAVY,
      lineColor: NAVY,
      lineWidth: 0.25,
      fillColor: WHITE,
      minCellHeight: 10.5,
      valign: "middle",
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: NAVY,
      lineWidth: 0.25,
      minCellHeight: 10.5,
      valign: "middle",
      halign: "center",
      cellPadding: { top: 1.8, right: 1.6, bottom: 1.8, left: 1.6 },
    },
    alternateRowStyles: {
      fillColor: WHITE,
    },
    columnStyles: {
      0: { cellWidth: 21.5, halign: "center" },
      1: { cellWidth: 24.5, halign: "right" },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 24.5, halign: "right" },
      4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 63.5, halign: "left", fontSize: 8 },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 5) {
        data.cell.styles.halign = "left";
      }
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawDiagonalWatermarks(doc);
        drawPageHeader(doc, shopHeaderUpper);
      }
    },
  });

  const tableEndY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? page1TableStartY;

  const usableBottomY = PAGE_HEIGHT - MARGIN_BOTTOM - 8; // Reserve space for Page X of Y
  const summaryTotalHeight = 8.5 + 8.5 + 10.5; // 27.5mm
  const signatureHeight = 20;

  let summaryStartY = tableEndY + 5;
  if (summaryStartY + summaryTotalHeight > usableBottomY) {
    doc.addPage();
    drawDiagonalWatermarks(doc);
    drawPageHeader(doc, shopHeaderUpper);
    summaryStartY = HEADER_CONTINUATION_START_Y + 2;
  }

  const summaryEndY = drawSummaryBox(doc, summaryStartY, report);

  let signatureLineY = Math.max(summaryEndY + 18, 255);
  if (signatureLineY + 10 > usableBottomY) {
    if (summaryEndY + 16 <= usableBottomY) {
      signatureLineY = usableBottomY - 8;
    } else {
      doc.addPage();
      drawDiagonalWatermarks(doc);
      drawPageHeader(doc, shopHeaderUpper);
      signatureLineY = Math.max(HEADER_CONTINUATION_START_Y + 20, 255);
    }
  }
  void signatureHeight;
  drawSignatureFooter(doc, signatureLineY, report);

  // Subtle Page X of Y footer on EVERY page in Dark Navy Blue
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      "AE Weekly Cash Flow Ledger",
      MARGIN_LEFT,
      PAGE_HEIGHT - 8.5,
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      PAGE_WIDTH - MARGIN_RIGHT,
      PAGE_HEIGHT - 8.5,
      { align: "right" },
    );
  }

  return doc;
}

export function buildCashFlowPdfFilename(
  report: WeeklyCashFlowReportData,
): string {
  const safeSupplier = report.isBlankManual
    ? "Blank-Manual-Sheet"
    : report.supplierName
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "Supplier";
  return `AE-Weekly-CashFlow-${safeSupplier}-${report.printDate}.pdf`;
}

export function generateWeeklyCashFlowPdf(
  report: WeeklyCashFlowReportData,
): string {
  const doc = buildWeeklyCashFlowPdfDoc(report);
  const filename = buildCashFlowPdfFilename(report);
  doc.save(filename);
  return filename;
}
