const express = require("express");
const { body, validationResult } = require("express-validator");
const Transaction = require("../models/Transaction");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
}

// --- Liste des transactions (avec filtres optionnels) ---
router.get("/", async (req, res, next) => {
  try {
    const { type, category, from, to } = req.query;
    const filter = { owner: req.user._id };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const transactions = await Transaction.find(filter).sort({ date: -1 });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});

// --- Ajouter une transaction ---
router.post(
  "/",
  [
    body("type").isIn(["revenu", "depense"]).withMessage("Type invalide."),
    body("amount").isFloat({ gt: 0 }).withMessage("Le montant doit être positif."),
    body("date").optional().isISO8601().withMessage("Date invalide."),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { type, amount, category, description, date, isRecurring } = req.body;
      const tx = await Transaction.create({
        owner: req.user._id,
        type,
        amount,
        category,
        description,
        date: date || Date.now(),
        isRecurring: !!isRecurring,
      });
      res.status(201).json({ transaction: tx });
    } catch (err) {
      next(err);
    }
  }
);

// --- Modifier une transaction ---
router.put("/:id", async (req, res, next) => {
  try {
    const tx = await Transaction.findOne({ _id: req.params.id, owner: req.user._id });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });

    const { type, amount, category, description, date, isRecurring } = req.body;
    if (type !== undefined) tx.type = type;
    if (amount !== undefined) tx.amount = amount;
    if (category !== undefined) tx.category = category;
    if (description !== undefined) tx.description = description;
    if (date !== undefined) tx.date = date;
    if (isRecurring !== undefined) tx.isRecurring = isRecurring;

    await tx.save();
    res.json({ transaction: tx });
  } catch (err) {
    next(err);
  }
});

// --- Supprimer une transaction ---
router.delete("/:id", async (req, res, next) => {
  try {
    const tx = await Transaction.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!tx) return res.status(404).json({ message: "Transaction introuvable." });
    res.json({ message: "Transaction supprimée." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
