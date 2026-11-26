import { GState, jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { WeeklyCashFlowReportData } from "@/types/domain";

const NAVY: [number, number, number] = [13, 35, 64]; // #0D2340 header navy
const INK: [number, number, number] = [17, 24, 39]; // #111827 crisp table text
const MUTED: [number, number, number] = [71, 85, 105]; // #475569 tagline / date
const BORDER: [number, number, number] = [203, 213, 225]; // #CBD5E1 subtle grid border
const BADGE_RED: [number, number, number] = [220, 38, 38]; // #DC2626 Current Balance badge
const WATERMARK_COLOR: [number, number, number] = [100, 116, 139];
const WHITE: [number, number, number] = [255, 255, 255];

const PAGE_WIDTH = 210; // A4 portrait width (mm)
const PAGE_HEIGHT = 297; // A4 portrait height (mm)
const MARGIN_LEFT = 12;
const MARGIN_RIGHT = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 186mm

function formatNum(amount: number): string {
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

function formatSlashDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

/**
 * Draw the circular AE monogram emblem in the top-left corner,
 * modeled directly after the reference serif monogram badge.
 */
function drawAeCircularMonogram(doc: jsPDF, cx: number, cy: number) {
  // Interlocked classic serif AE initials in center
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(21);
  doc.text("A", cx - 4.4, cy + 2.2);
  doc.text("E", cx - 0.1, cy + 2.9);

  // Subtle curved top arc letters: "ALI ELECTRONIC"
  const topLetters = "ALI ELECTRONIC".split("");
  const topRadius = 8.8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.4);
  doc.setTextColor(...INK);
  const topSpanDeg = 148;
  const topStartDeg = 90 + topSpanDeg / 2;
  const topStep = topSpanDeg / Math.max(1, topLetters.length - 1);

  for (let i = 0; i < topLetters.length; i++) {
    const deg = topStartDeg - i * topStep;
    const rad = (deg * Math.PI) / 180;
    const lx = cx + topRadius * Math.cos(rad);
    const ly = cy - topRadius * Math.sin(rad);
    doc.text(topLetters[i], lx, ly, {
      align: "center",
      angle: deg - 90,
    });
  }

  // Subtle bottom label upright along the lower arc: "ALIEMS"
  const botLetters = "ALIEMS".split("");
  const botRadius = 9.2;
  const botSpanDeg = 58;
  const botStartDeg = -90 - botSpanDeg / 2;
  const botStep = botSpanDeg / Math.max(1, botLetters.length - 1);
  doc.setFontSize(4.3);

  for (let i = 0; i < botLetters.length; i++) {
    const deg = botStartDeg + i * botStep;
    const rad = (deg * Math.PI) / 180;
    const lx = cx + botRadius * Math.cos(rad);
    const ly = cy - botRadius * Math.sin(rad);
    doc.text(botLetters[i], lx, ly, {
      align: "center",
      angle: deg + 90,
    });
  }
}

/**
 * Draw the tiled diagonal watermark grid ("ALI ELECTRONIC") across the full A4 page,
 * rendered behind table content just like the reference ledger.
 */
function drawTiledWatermarks(doc: jsPDF, watermarkText: string) {
  doc.setGState(new GState({ opacity: 0.08 }));
  doc.setTextColor(...WATERMARK_COLOR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);

  const xs = [26, 108, 190];
  const ys = [26, 86, 146, 206, 266];

  for (let r = 0; r < ys.length; r++) {
    const xShift = r % 2 === 1 ? -22 : 0;
    for (let c = 0; c < xs.length; c++) {
      doc.text(watermarkText, xs[c] + xShift, ys[r], {
        align: "center",
        angle: 32,
      });
    }
  }

  doc.setGState(new GState({ opacity: 1 }));
}

function drawPageOneHeader(
  doc: jsPDF,
  report: WeeklyCashFlowReportData,
  shopHeaderUpper: string,
): number {
  // Top-Left AE monogram emblem
  drawAeCircularMonogram(doc, MARGIN_LEFT + 10, 20);

  // Top-Right Brand Title + Italic Tagline
  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17.5);
  doc.text(shopHeaderUpper, rightX, 17.5, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.text("Dealer in all kinds of electric Items & Home appliances", rightX, 23, {
    align: "right",
  });

  // Thin crisp horizontal divider
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.35);
  doc.line(MARGIN_LEFT, 33.5, PAGE_WIDTH - MARGIN_RIGHT, 33.5);

  // Subheader Left: RECEIVABLE LEDGER + Supplier/Shop line
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("RECEIVABLE LEDGER", MARGIN_LEFT, 43);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const partyLine = report.isBlankManual
    ? "Supplier: __________________________"
    : `Supplier: ${report.supplierName}`;
  doc.text(partyLine, MARGIN_LEFT, 49.5, { maxWidth: 112 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`Period: ${report.periodLabel}`, MARGIN_LEFT, 54.5, { maxWidth: 112 });

  // Subheader Right: Date + Red Current Balance Pill
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Date: ${formatSlashDate(report.printDate)}`, rightX, 43, {
    align: "right",
  });

  const balanceText = report.isBlankManual
    ? "Current Balance: Rs ______________"
    : `Current Balance: Rs ${formatNum(report.finalRemainingBalance)}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const textW = doc.getTextWidth(balanceText);
  const pillW = Math.max(54, textW + 10);
  const pillH = 7.2;
  const pillX = rightX - pillW;
  const pillY = 45.2;

  doc.setFillColor(...BADGE_RED);
  doc.roundedRect(pillX, pillY, pillW, pillH, 1.5, 1.5, "F");

  doc.setTextColor(...WHITE);
  doc.text(balanceText, pillX + pillW / 2, pillY + 4.9, { align: "center" });

  return 59; // Table start Y on Page 1
}

function drawSignatureFooter(
  doc: jsPDF,
  y: number,
  shopName: string,
) {
  const leftLineX1 = MARGIN_LEFT;
  const leftLineX2 = MARGIN_LEFT + 58;
  const rightLineX1 = PAGE_WIDTH - MARGIN_RIGHT - 68;
  const rightLineX2 = PAGE_WIDTH - MARGIN_RIGHT;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.line(leftLineX1, y, leftLineX2, y);
  doc.line(rightLineX1, y, rightLineX2, y);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    "Customer/Vendor Signature",
    (leftLineX1 + leftLineX2) / 2,
    y + 4.6,
    { align: "center" },
  );
  doc.text(
    `Authorized Signature (${shopName})`,
    (rightLineX1 + rightLineX2) / 2,
    y + 4.6,
    { align: "center" },
  );
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

  // Page 1: Tiled watermark behind everything, then Page 1 header & subheader
  drawTiledWatermarks(doc, shopHeaderUpper);
  const page1TableStartY = drawPageOneHeader(doc, report, shopHeaderUpper);

  // Build exact 6-column table body matching the reference PDF:
  // Date | Type | Amount (Rs) | Payment Method | Remaining Balance | Description
  const tableRows: string[][] = [];

  if (!report.isBlankManual && report.openingBalance > 0) {
    tableRows.push([
      formatSlashDate(report.startDate),
      "CHARGE",
      formatNum(report.openingBalance),
      "N/A",
      formatNum(report.openingBalance),
      "All Previous Balance till now",
    ]);
  }

  for (const row of report.rows) {
    const isPayment = row.sourceType === "payment" || row.amountPaid > 0;
    const txType = isPayment ? "PAYMENT" : "CHARGE";
    const txAmount = isPayment ? row.amountPaid : row.thisWeekAmount;
    const method = isPayment ? row.paymentMethod || "CASH" : "N/A";

    tableRows.push([
      formatSlashDate(row.date),
      txType,
      formatNum(txAmount),
      method,
      formatNum(row.remainingBalance),
      row.description,
    ]);
  }

  for (let i = 0; i < report.blankRows; i++) {
    tableRows.push(["", "", "", "", "", ""]);
  }

  autoTable(doc, {
    startY: page1TableStartY,
    margin: {
      top: 14,
      right: MARGIN_RIGHT,
      bottom: 24,
      left: MARGIN_LEFT,
    },
    tableWidth: CONTENT_WIDTH,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    theme: "grid",
    head: [
      [
        "Date",
        "Type",
        "Amount\n(Rs)",
        "Payment\nMethod",
        "Remaining\nBalance",
        "Description",
      ],
    ],
    body: tableRows,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: INK,
      lineColor: BORDER,
      lineWidth: 0.22,
      fillColor: false, // Transparent body cells so watermark stays faintly visible like reference PDF
      minCellHeight: 9.5,
      valign: "middle",
      cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: NAVY,
      lineWidth: 0.22,
      minCellHeight: 11,
      valign: "middle",
      halign: "center",
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
    },
    alternateRowStyles: {
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 21, halign: "center" },
      2: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      3: { cellWidth: 23, halign: "center" },
      4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 70, halign: "left" },
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawTiledWatermarks(doc, shopHeaderUpper);
      }
    },
  });

  const tableEndY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? page1TableStartY;

  let signatureY = Math.max(tableEndY + 24, PAGE_HEIGHT - 26);
  if (signatureY + 10 > PAGE_HEIGHT - 12) {
    doc.addPage();
    drawTiledWatermarks(doc, shopHeaderUpper);
    signatureY = PAGE_HEIGHT - 26;
  }

  drawSignatureFooter(doc, signatureY, report.shopName);

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
  return `AE-Receivable-Ledger-${safeSupplier}-${report.printDate}.pdf`;
}

export function generateWeeklyCashFlowPdf(
  report: WeeklyCashFlowReportData,
): string {
  const doc = buildWeeklyCashFlowPdfDoc(report);
  const filename = buildCashFlowPdfFilename(report);
  doc.save(filename);
  return filename;
}
