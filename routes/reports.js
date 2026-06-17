
const express = require('express');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Expense = require('../models/Expense');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfDay(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

router.get('/download', async (req, res) => {
  try {
    const { filter = 'monthly', date } = req.query;
    const refDate = date ? new Date(date) : new Date();

    let startDate, endDate;

    switch ((filter || '').toLowerCase()) {
      case 'daily':
        startDate = startOfDay(refDate);
        endDate = endOfDay(refDate);
        break;

      case 'weekly': {
        const d = new Date(refDate);
        const day = d.getDay();
        const start = new Date(d);
        start.setDate(d.getDate() - day);

        startDate = startOfDay(start);

        const end = new Date(startDate);
        end.setDate(end.getDate() + 6);

        endDate = endOfDay(end);
        break;
      }

      case 'yearly':
        startDate = new Date(refDate.getFullYear(), 0, 1);
        endDate = new Date(
          refDate.getFullYear(),
          11,
          31,
          23,
          59,
          59,
          999
        );
        break;

      case 'monthly':
      default:
        startDate = new Date(
          refDate.getFullYear(),
          refDate.getMonth(),
          1
        );

        endDate = new Date(
          refDate.getFullYear(),
          refDate.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        );
        break;
    }

    const match = {
      userId: new mongoose.Types.ObjectId(req.user._id),
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    const expenses = await Expense.find(match)
      .sort({ date: -1 })
      .lean();

    const agg = await Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
      { $sort: { total: -1 } },
    ]);

    // ==========================
    // PDF
    // ==========================

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${filter}_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf"`
    );

    doc.pipe(res);

    // ==========================
    // HEADER
    // ==========================

    doc.rect(0, 0, doc.page.width, 90).fill('#2563EB');

    doc
      .fillColor('white')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Expense Report', 50, 28);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        50,
        58
      );

    doc.moveDown(4);

    // ==========================
    // SUMMARY
    // ==========================

    const totalExpense = expenses.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );

    const summaryY = doc.y;

    doc.roundedRect(50, summaryY, 220, 60, 6).fill('#10B981');

    doc
      .fillColor('white')
      .fontSize(11)
      .font('Helvetica')
      .text('Total Expense', 65, summaryY + 12);

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(
        `AED ${totalExpense.toFixed(2)}`,
        65,
        summaryY + 30
      );

    doc.moveDown(5);

    // ==========================
    // TOP CATEGORIES
    // ==========================

    doc
      .fillColor('#F62440')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Top Categories');

    doc.moveDown(0.5);

    agg.forEach((c, index) => {
      const y = doc.y;

      doc
        .rect(50, y, 500, 24)
        .fill(index % 2 === 0 ? '#F8FAFC' : '#E5E7EB');

      doc
        .fillColor('#111827')
        .fontSize(10)
        .font('Helvetica')
        .text(c._id || 'Others', 65, y + 7);

      doc
        .fillColor('#2563EB')
        .font('Helvetica-Bold')
        .text(
          `AED ${Number(c.total).toFixed(2)}`,
          430,
          y + 7
        );

      doc.moveDown(1.4);
    });

    doc.moveDown(1);

    // ==========================
    // EXPENSE TABLE
    // ==========================

    doc
      .fillColor('#111827')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Expenses');

    doc.moveDown(0.5);

    const drawTableHeader = () => {
      const headerY = doc.y;

      doc.rect(50, headerY, 500, 28).fill('#374151');

      doc
        .fillColor('white')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Date', 70, headerY + 8);

      doc.text('Category', 220, headerY + 8);

      doc.text('Notes', 330, headerY + 8);

      doc.text('Amount', 460, headerY + 8);

      doc.moveDown(2);
    };

    drawTableHeader();

    expenses.forEach((expense, index) => {
      // If near bottom, start new page and redraw header
      if (doc.y > 720) {
        doc.addPage();
        drawTableHeader();
      }

      const rowY = doc.y;

      // column positions
      const dateX = 70;
      const categoryX = 220;
      const notesX = 330;
      const amountX = 460;

      // compute notes wrapping
      const notesText = expense.notes ? String(expense.notes) : '';
      const notesWidth = amountX - notesX - 10;
      const notesOptions = { width: notesWidth, align: 'left' };
      const notesHeight = notesText
        ? doc.heightOfString(notesText, { ...notesOptions, font: 'Helvetica', fontSize: 10 })
        : 0;

      // row height should accommodate notes (with some padding)
      const baseRowHeight = 24;
      const rowHeight = Math.max(baseRowHeight, notesHeight + 14);

      // draw row background
      doc.rect(50, rowY, 500, rowHeight).fill(index % 2 === 0 ? '#FFFFFF' : '#F9FAFB');

      // date
      doc
        .fillColor('#111827')
        .fontSize(10)
        .font('Helvetica')
        .text(new Date(expense.date).toLocaleDateString(), dateX, rowY + 7);

      // category
      doc.text(expense.category || 'Others', categoryX, rowY + 7);

      // notes (allow wrapping within column)
      if (notesText) {
        doc.text(notesText, notesX, rowY + 7, notesOptions);
      }

      // amount
      doc
        .fillColor('#059669')
        .font('Helvetica-Bold')
        .text(`AED ${Number(expense.amount).toFixed(2)}`, amountX, rowY + 7);

      // move cursor to the end of this row
      doc.y = rowY + rowHeight + 6;
    });

    // ==========================
    // FOOTER
    // ==========================

    doc.moveDown(2);

    doc
      .fillColor('gray')
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Generated on ${new Date().toLocaleString()}`,
        50,
        doc.page.height - 50,
        {
          align: 'center',
        }
      );

    doc.end();
  } catch (error) {
    console.error('Report generation error:', error);

    res.status(500).json({
      message: 'Failed to generate report',
    });
  }
});

module.exports = router;

