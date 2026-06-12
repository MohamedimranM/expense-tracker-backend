const express = require('express');
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Create Expense
router.post(
  '/',
  [
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('category').notEmpty().withMessage('Category is required'),
    body('date').isISO8601().withMessage('Invalid date'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { description, amount, category, date, notes } = req.body;

      const expense = new Expense({
        userId: req.user._id,
        description,
        amount,
        category,
        date: new Date(date),
        notes,
      });

      await expense.save();

      res.status(201).json({
        message: 'Expense created successfully',
        expense,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get All Expenses
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    let query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (category) {
      query.category = category;
    }

    const expenses = await Expense.find(query).sort({ date: -1 });

    res.json({
      count: expenses.length,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Single Expense
router.get('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ expense });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Expense
router.put(
  '/:id',
  [
    body('description').optional().trim().notEmpty(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('category').optional().notEmpty(),
    body('date').optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let expense = await Expense.findOne({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
      }

      const { description, amount, category, date, notes } = req.body;

      if (description) expense.description = description;
      if (amount) expense.amount = amount;
      if (category) expense.category = category;
      if (date) expense.date = new Date(date);
      if (notes !== undefined) expense.notes = notes;

      await expense.save();

      res.json({
        message: 'Expense updated successfully',
        expense,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Expense
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
