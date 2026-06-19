const express = require('express');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Expense = require('../models/Expense');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  headerBg:   '#1E1B4B',
  accentBar:  '#7C3AED',
  primary:    '#4F46E5',
  accent:     '#7C3AED',
  success:    '#059669',
  textDark:   '#111827',
  textMid:    '#374151',
  textLight:  '#6B7280',
  white:      '#FFFFFF',
  rowWhite:   '#FFFFFF',
  rowAlt:     '#F8FAFC',
  tableHead:  '#1E1B4B',
  weekTotal:  '#EDE9FE',
  cardPurple: '#F5F3FF',
  cardGreen:  '#F0FDF4',
  cardOrange: '#FFF7ED',
  border:     '#E5E7EB',
};

const MARGIN     = 40;
const PAGE_W     = 595;
const CONTENT_W  = PAGE_W - MARGIN * 2; // 515

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt     = n  => `AED ${Number(n).toFixed(2)}`;
const fmtDate = d  => new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

function startOfDay(d) { const dt = new Date(d); dt.setHours(0, 0, 0, 0);          return dt; }
function endOfDay(d)   { const dt = new Date(d); dt.setHours(23, 59, 59, 999);      return dt; }

function hline(doc, y) {
  doc.save()
     .strokeColor(C.border).lineWidth(0.5)
     .moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
     .stroke()
     .restore();
}

function sectionTitle(doc, title, y) {
  doc.rect(MARGIN, y, 3, 16).fill(C.primary);
  doc.fillColor(C.textDark).fontSize(12).font('Helvetica-Bold')
     .text(title, MARGIN + 10, y + 1, { width: CONTENT_W - 10 });
  return y + 26;
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get('/download', async (req, res) => {
  try {
    const { filter = 'monthly', date } = req.query;
    const refDate = date ? new Date(date) : new Date();

    let startDate, endDate;
    switch ((filter || '').toLowerCase()) {
      case 'daily':
        startDate = startOfDay(refDate);
        endDate   = endOfDay(refDate);
        break;

      case 'weekly': {
        const d = new Date(refDate);
        const s = new Date(d);
        s.setDate(d.getDate() - d.getDay());
        startDate = startOfDay(s);
        const e = new Date(startDate);
        e.setDate(e.getDate() + 6);
        endDate = endOfDay(e);
        break;
      }

      case 'yearly':
        startDate = new Date(refDate.getFullYear(), 0, 1);
        endDate   = new Date(refDate.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;

      default: // monthly
        startDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
        endDate   = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
    }

    const match = {
      userId: new mongoose.Types.ObjectId(req.user._id),
      date:   { $gte: startDate, $lte: endDate },
    };

    const expenses = await Expense.find(match).sort({ date: 1 }).lean();
    const agg = await Expense.aggregate([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);

    const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const isMonthly    = (filter || '').toLowerCase() === 'monthly';

    // ── Weekly breakdown (monthly only) ───────────────────────────────────────
    let weeklyData = [];
    if (isMonthly) {
      const monthName = startDate.toLocaleString('en-US', { month: 'long' });
      const lastDay   = endDate.getDate();

      const weekDefs = [
        { label: 'Week 1', s: 1,  e: 7  },
        { label: 'Week 2', s: 8,  e: 14 },
        { label: 'Week 3', s: 15, e: 21 },
        { label: 'Week 4', s: 22, e: 28 },
        { label: 'Week 5', s: 29, e: 31 },
      ];

      weeklyData = weekDefs
        .filter(w => w.s <= lastDay)
        .map(w => {
          const end = Math.min(w.e, lastDay);
          const ws  = expenses.filter(ex => {
            const day = new Date(ex.date).getDate();
            return day >= w.s && day <= end;
          });
          return {
            label:  w.label,
            period: `${monthName} ${w.s}–${end}`,
            count:  ws.length,
            total:  ws.reduce((s, ex) => s + Number(ex.amount), 0),
          };
        })
        .filter(w => w.count > 0);
    }

    // ── PDF document ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${filter}_${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    doc.pipe(res);

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 88).fill(C.headerBg);
    doc.rect(0, 84, PAGE_W, 4).fill(C.accentBar);

    const filterLabel =
      (filter || 'monthly').charAt(0).toUpperCase() +
      (filter || 'monthly').slice(1) +
      ' Report';

    const periodStr =
      `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` +
      ` – ` +
      `${endDate.toLocaleDateString('en-US',   { month: 'short', day: 'numeric', year: 'numeric' })}`;

    doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
       .text('Expense Report', MARGIN, 20, { width: 320 });

    doc.fillColor('#A5B4FC').fontSize(10).font('Helvetica')
       .text(`${filterLabel}  ·  ${periodStr}`, MARGIN, 50, { width: CONTENT_W });

    doc.fillColor('#6366F1').fontSize(8)
       .text(
         `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
         MARGIN, 68, { width: CONTENT_W, align: 'right' }
       );

    let curY = 108;

    // ── SUMMARY CARDS ─────────────────────────────────────────────────────────
    const CARD_W = Math.floor((CONTENT_W - 16) / 3); // ~166
    const CARD_H = 76;

    // Card 1 – Total Expense
    doc.roundedRect(MARGIN, curY, CARD_W, CARD_H, 6).fill(C.cardPurple);
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text('TOTAL EXPENSE', MARGIN + 12, curY + 13, { width: CARD_W - 20 });
    doc.fillColor(C.accent).fontSize(18).font('Helvetica-Bold')
       .text(fmt(totalExpense), MARGIN + 12, curY + 28, { width: CARD_W - 20 });
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text(
         `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`,
         MARGIN + 12, curY + 58, { width: CARD_W - 20 }
       );

    // Card 2 – Avg per transaction
    const c2x   = MARGIN + CARD_W + 8;
    const avgTx = expenses.length ? totalExpense / expenses.length : 0;
    doc.roundedRect(c2x, curY, CARD_W, CARD_H, 6).fill(C.cardGreen);
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text('AVG TRANSACTION', c2x + 12, curY + 13, { width: CARD_W - 20 });
    doc.fillColor(C.success).fontSize(18).font('Helvetica-Bold')
       .text(fmt(avgTx), c2x + 12, curY + 28, { width: CARD_W - 20 });
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text('per transaction', c2x + 12, curY + 58, { width: CARD_W - 20 });

    // Card 3 – Top category
    const c3x    = MARGIN + (CARD_W + 8) * 2;
    const topCat = agg[0] || null;
    doc.roundedRect(c3x, curY, CARD_W, CARD_H, 6).fill(C.cardOrange);
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text('TOP CATEGORY', c3x + 12, curY + 13, { width: CARD_W - 20 });
    if (topCat) {
      doc.fillColor('#C2410C').fontSize(13).font('Helvetica-Bold')
         .text(topCat._id || 'Others', c3x + 12, curY + 30, { width: CARD_W - 24 });
      doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
         .text(fmt(topCat.total), c3x + 12, curY + 58, { width: CARD_W - 20 });
    } else {
      doc.fillColor(C.textLight).fontSize(10).font('Helvetica')
         .text('No data', c3x + 12, curY + 36);
    }

    curY += CARD_H + 22;

    // ── WEEKLY BREAKDOWN (monthly only) ───────────────────────────────────────
    if (isMonthly && weeklyData.length > 0) {
      curY = sectionTitle(doc, 'Weekly Breakdown', curY);

      // Columns: Week(72) | Period(178) | Transactions(90) | Amount(175) = 515
      const WC = [
        { x: MARGIN,       w: 72,  label: 'WEEK',         align: 'left'   },
        { x: MARGIN + 72,  w: 178, label: 'PERIOD',       align: 'left'   },
        { x: MARGIN + 250, w: 90,  label: 'TRANSACTIONS', align: 'center' },
        { x: MARGIN + 340, w: 175, label: 'AMOUNT',       align: 'right'  },
      ];

      // Header row
      doc.rect(MARGIN, curY, CONTENT_W, 26).fill(C.tableHead);
      WC.forEach(col => {
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
           .text(col.label, col.x + 6, curY + 9, { width: col.w - 10, align: col.align });
      });
      curY += 26;

      // Data rows
      weeklyData.forEach((w, i) => {
        const RH = 27;
        doc.rect(MARGIN, curY, CONTENT_W, RH).fill(i % 2 === 0 ? C.rowWhite : C.rowAlt);

        doc.fillColor(C.textMid).fontSize(9).font('Helvetica-Bold')
           .text(w.label, WC[0].x + 6, curY + 9, { width: WC[0].w - 10 });
        doc.fillColor(C.textMid).font('Helvetica')
           .text(w.period, WC[1].x + 6, curY + 9, { width: WC[1].w - 10 });
        doc.fillColor(C.textLight)
           .text(String(w.count), WC[2].x + 6, curY + 9, { width: WC[2].w - 10, align: 'center' });
        doc.fillColor(C.success).font('Helvetica-Bold')
           .text(fmt(w.total), WC[3].x + 6, curY + 9, { width: WC[3].w - 10, align: 'right' });

        curY += RH;
        hline(doc, curY);
      });

      // Monthly total row
      doc.rect(MARGIN, curY, CONTENT_W, 28).fill(C.weekTotal);
      doc.fillColor(C.accent).fontSize(9).font('Helvetica-Bold')
         .text('Monthly Total', WC[0].x + 6, curY + 10, { width: WC[0].w + WC[1].w - 10 });
      doc.fillColor(C.textMid).fontSize(9)
         .text(String(expenses.length), WC[2].x + 6, curY + 10, { width: WC[2].w - 10, align: 'center' });
      doc.fillColor(C.accent).font('Helvetica-Bold')
         .text(fmt(totalExpense), WC[3].x + 6, curY + 10, { width: WC[3].w - 10, align: 'right' });

      curY += 28 + 22;
    }

    // ── BY CATEGORY ───────────────────────────────────────────────────────────
    if (agg.length > 0) {
      const sectionH = 26 + 24 + agg.length * 27 + 22;
      if (curY + sectionH > doc.page.height - 80) {
        doc.addPage();
        curY = 40;
      }

      curY = sectionTitle(doc, 'By Category', curY);

      // Columns: Name(200) | Bar(155) | %(50) | Amount(110) = 515
      const CC = [
        { x: MARGIN,       w: 200, label: 'CATEGORY', align: 'left'  },
        { x: MARGIN + 200, w: 155, label: '',          align: 'left'  },
        { x: MARGIN + 355, w: 50,  label: '%',         align: 'right' },
        { x: MARGIN + 405, w: 110, label: 'AMOUNT',    align: 'right' },
      ];

      doc.rect(MARGIN, curY, CONTENT_W, 24).fill(C.tableHead);
      [CC[0], CC[2], CC[3]].forEach(col => {
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
           .text(col.label, col.x + 6, curY + 8, { width: col.w - 10, align: col.align });
      });
      curY += 24;

      agg.forEach((cat, i) => {
        const RH    = 27;
        const pct   = totalExpense > 0 ? (Number(cat.total) / totalExpense) * 100 : 0;
        const maxBW = CC[1].w - 12;
        const barW  = Math.max(2, maxBW * (pct / 100));

        doc.rect(MARGIN, curY, CONTENT_W, RH).fill(i % 2 === 0 ? C.rowWhite : C.rowAlt);

        doc.fillColor(C.textDark).fontSize(9).font('Helvetica')
           .text(cat._id || 'Others', CC[0].x + 6, curY + 9, { width: CC[0].w - 10 });

        // Progress bar
        doc.rect(CC[1].x + 6, curY + 11, maxBW, 5).fill('#E5E7EB');
        doc.rect(CC[1].x + 6, curY + 11, barW, 5).fill(C.primary);

        doc.fillColor(C.textLight).fontSize(8)
           .text(`${pct.toFixed(0)}%`, CC[2].x + 6, curY + 9, { width: CC[2].w - 10, align: 'right' });
        doc.fillColor(C.success).fontSize(9).font('Helvetica-Bold')
           .text(fmt(cat.total), CC[3].x + 6, curY + 9, { width: CC[3].w - 10, align: 'right' });

        curY += RH;
        hline(doc, curY);
      });

      curY += 22;
    }

    // ── TRANSACTION DETAILS ───────────────────────────────────────────────────
    if (expenses.length > 0) {
      if (curY + 80 > doc.page.height - 60) {
        doc.addPage();
        curY = 40;
      }

      curY = sectionTitle(doc, 'Transaction Details', curY);

      // Columns: Date(90) | Category(108) | Notes(193) | Amount(124) = 515
      const EC = [
        { x: MARGIN,       w: 90,  label: 'DATE',     align: 'left'  },
        { x: MARGIN + 90,  w: 108, label: 'CATEGORY', align: 'left'  },
        { x: MARGIN + 198, w: 193, label: 'NOTES',    align: 'left'  },
        { x: MARGIN + 391, w: 124, label: 'AMOUNT',   align: 'right' },
      ];

      const drawExpHeader = y => {
        doc.rect(MARGIN, y, CONTENT_W, 24).fill(C.tableHead);
        EC.forEach(col => {
          doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
             .text(col.label, col.x + 6, y + 8, { width: col.w - 10, align: col.align });
        });
        return y + 24;
      };

      curY = drawExpHeader(curY);

      expenses.forEach((expense, i) => {
        const notesText = expense.notes ? String(expense.notes) : '–';

        doc.font('Helvetica').fontSize(9);
        const notesH = doc.heightOfString(notesText, { width: EC[2].w - 14 });
        const RH     = Math.max(26, notesH + 14);

        if (curY + RH > doc.page.height - 70) {
          doc.addPage();
          curY = drawExpHeader(40);
        }

        doc.rect(MARGIN, curY, CONTENT_W, RH).fill(i % 2 === 0 ? C.rowWhite : C.rowAlt);

        doc.fillColor(C.textMid).fontSize(9).font('Helvetica')
           .text(fmtDate(expense.date), EC[0].x + 6, curY + 7, { width: EC[0].w - 10 });

        doc.fillColor(C.primary).font('Helvetica-Bold')
           .text(expense.category || 'Others', EC[1].x + 6, curY + 7, { width: EC[1].w - 10 });

        doc.fillColor(C.textLight).font('Helvetica')
           .text(notesText, EC[2].x + 6, curY + 7, { width: EC[2].w - 14 });

        doc.fillColor(C.success).font('Helvetica-Bold')
           .text(fmt(expense.amount), EC[3].x + 6, curY + 7, { width: EC[3].w - 10, align: 'right' });

        curY += RH;
        hline(doc, curY);
      });

      // Grand total row
      curY += 2;
      doc.rect(MARGIN, curY, CONTENT_W, 28).fill(C.weekTotal);
      doc.fillColor(C.accent).fontSize(10).font('Helvetica-Bold')
         .text('Grand Total', EC[0].x + 6, curY + 9, { width: 260 });
      doc.fillColor(C.accent).fontSize(10)
         .text(fmt(totalExpense), EC[3].x + 6, curY + 9, { width: EC[3].w - 10, align: 'right' });
      curY += 28;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    curY += 24;
    hline(doc, curY);
    curY += 10;
    doc.fillColor(C.textLight).fontSize(8).font('Helvetica')
       .text(
         `Generated on ${new Date().toLocaleString()}  ·  ExpenseTracker`,
         MARGIN, curY, { width: CONTENT_W, align: 'center' }
       );

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ message: 'Failed to generate report' });
  }
});

module.exports = router;
