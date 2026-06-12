const express = require('express');
const Expense = require('../models/Expense');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Get Daily Summary
router.get('/daily/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const expenses = await Expense.find({
      userId: req.user._id,
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = {};

    expenses.forEach((expense) => {
      byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
    });

    res.json({
      date: req.params.date,
      total,
      count: expenses.length,
      byCategory,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Weekly Summary
router.get('/weekly/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const day = date.getDay();
    const diff = date.getDate() - day;
    const startOfWeek = new Date(date.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const expenses = await Expense.find({
      userId: req.user._id,
      date: {
        $gte: startOfWeek,
        $lte: endOfWeek,
      },
    }).sort({ date: 1 });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = {};

    expenses.forEach((expense) => {
      byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
    });

    res.json({
      week: {
        start: startOfWeek,
        end: endOfWeek,
      },
      total,
      count: expenses.length,
      byCategory,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Monthly Summary
router.get('/monthly/:year/:month', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month) - 1;

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const expenses = await Expense.find({
      userId: req.user._id,
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    }).sort({ date: 1 });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = {};

    expenses.forEach((expense) => {
      byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
    });

    res.json({
      month: req.params.month,
      year: req.params.year,
      total,
      count: expenses.length,
      byCategory,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Yearly Summary
router.get('/yearly/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);
    endOfYear.setHours(23, 59, 59, 999);

    const expenses = await Expense.find({
      userId: req.user._id,
      date: {
        $gte: startOfYear,
        $lte: endOfYear,
      },
    }).sort({ date: 1 });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = {};
    const byMonth = {};

    expenses.forEach((expense) => {
      byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;

      const monthKey = `${expense.date.getMonth() + 1}`;
      byMonth[monthKey] = (byMonth[monthKey] || 0) + expense.amount;
    });

    res.json({
      year: req.params.year,
      total,
      count: expenses.length,
      byCategory,
      byMonth,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Overview (all time stats)
router.get('/overview/all', async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = {};

    expenses.forEach((expense) => {
      byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
    });

    const average = expenses.length > 0 ? total / expenses.length : 0;

    res.json({
      total,
      count: expenses.length,
      average,
      byCategory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
