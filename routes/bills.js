const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_CATEGORIES = [
  'Food',
  'Snack and Drinks',
  'Transportation',
  'Entertainment',
  'Utilities',
  'Healthcare',
  'Shopping',
  'Education',
  'Other',
];

router.post('/scan', authenticate, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `You are a receipt/bill reader. Analyze this receipt image and extract the information. Return ONLY valid JSON with no extra text or markdown code blocks.

JSON format:
{
  "merchant": "name of the restaurant or store",
  "items": ["item 1 with quantity if shown", "item 2"],
  "totalAmount": 0.00,
  "category": "one of the categories below",
  "date": "YYYY-MM-DD or null if not visible",
  "notes": "merchant name — items as a comma separated list"
}

Category rules (pick exactly one):
- Food: restaurants, fast food, cafeterias, groceries, supermarket food
- Snack and Drinks: cafes, juice bars, coffee shops, snacks, beverages only
- Transportation: taxi, ride-hailing, fuel, parking, metro, bus
- Entertainment: cinema, games, events, streaming subscriptions
- Utilities: electricity, water, internet, phone bills, gas
- Healthcare: pharmacy, clinic, hospital, medicine, supplements
- Shopping: clothes, electronics, home goods, general retail
- Education: books, courses, school supplies, stationery
- Other: anything else

Rules:
- totalAmount must be a plain number only, no currency symbols
- Use the final/grand total line, not subtotals
- items should list actual purchased items, not tax or service charge lines
- If the bill is unclear, make your best guess
- Always return valid JSON only`,
            },
          ],
        },
      ],
    });

    const rawText = response.content[0].text.trim();
    const jsonStr = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(422).json({ message: 'Could not read the bill. Please try a clearer photo.' });
    }

    if (!VALID_CATEGORIES.includes(parsed.category)) {
      parsed.category = 'Other';
    }
    if (typeof parsed.totalAmount !== 'number' || isNaN(parsed.totalAmount)) {
      parsed.totalAmount = 0;
    }
    if (!Array.isArray(parsed.items)) {
      parsed.items = [];
    }

    res.json(parsed);
  } catch (error) {
    console.error('Bill scan error:', error.message);
    res.status(500).json({ message: 'Failed to scan bill. Please try again.' });
  }
});

module.exports = router;
