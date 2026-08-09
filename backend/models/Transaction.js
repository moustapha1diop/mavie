const mongoose = require("mongoose");

const CATEGORIES = [
  "salaire",
  "transport",
  "logement",
  "alimentation",
  "sante",
  "education",
  "loisirs",
  "abonnement",
  "epargne",
  "dette",
  "autre",
];

const TransactionSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, enum: ["revenu", "depense"], required: true },
    amount: { type: Number, required: true, min: [0.01, "Le montant doit être positif"] },
    category: { type: String, enum: CATEGORIES, default: "autre" },
    description: { type: String, trim: true, maxlength: 300 },
    date: { type: Date, required: true, default: Date.now },
    isRecurring: { type: Boolean, default: false }, // ex: abonnement mensuel
  },
  { timestamps: true }
);

TransactionSchema.index({ owner: 1, date: -1 });
TransactionSchema.index({ owner: 1, category: 1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
module.exports.CATEGORIES = CATEGORIES;
