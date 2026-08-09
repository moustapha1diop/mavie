const express = require("express");
const Transaction = require("../models/Transaction");
const Document = require("../models/Document");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

router.get("/", async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisMonthTx, lastMonthTx, allTx, expiringDocs] = await Promise.all([
      Transaction.find({ owner: ownerId, date: { $gte: startOfMonth } }),
      Transaction.find({ owner: ownerId, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
      Transaction.find({ owner: ownerId }),
      Document.find({
        owner: ownerId,
        expirationDate: { $ne: null, $lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      }).sort({ expirationDate: 1 }),
    ]);

    const sum = (txs, type) => txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

    const revenusMois = sum(thisMonthTx, "revenu");
    const depensesMois = sum(thisMonthTx, "depense");
    const soldeGlobal = sum(allTx, "revenu") - sum(allTx, "depense");
    const budget = req.user.monthlyBudget || 0;
    const resteAAllouer = budget > 0 ? Math.max(budget - depensesMois, 0) : null;

    // Répartition des dépenses par catégorie (mois courant)
    const parCategorie = {};
    thisMonthTx
      .filter((t) => t.type === "depense")
      .forEach((t) => {
        parCategorie[t.category] = (parCategorie[t.category] || 0) + t.amount;
      });

    // --- Assistant intelligent : quelques insights simples basés sur les règles ---
    const insights = [];

    expiringDocs.forEach((doc) => {
      const days = Math.ceil((doc.expirationDate - now) / (1000 * 60 * 60 * 24));
      if (days < 0) {
        insights.push(`"${doc.title}" a expiré il y a ${Math.abs(days)} jour(s).`);
      } else {
        insights.push(`"${doc.title}" expire dans ${days} jour(s).`);
      }
    });

    // Comparaison des dépenses par catégorie vs mois dernier
    const parCategorieMoisDernier = {};
    lastMonthTx
      .filter((t) => t.type === "depense")
      .forEach((t) => {
        parCategorieMoisDernier[t.category] = (parCategorieMoisDernier[t.category] || 0) + t.amount;
      });

    Object.entries(parCategorie).forEach(([cat, montant]) => {
      const precedent = parCategorieMoisDernier[cat] || 0;
      if (precedent > 0) {
        const variation = ((montant - precedent) / precedent) * 100;
        if (variation >= 20) {
          insights.push(
            `Tu as dépensé ${Math.round(variation)}% de plus en "${cat}" ce mois-ci par rapport au mois dernier.`
          );
        } else if (variation <= -20) {
          insights.push(
            `Bravo, tu as dépensé ${Math.round(Math.abs(variation))}% de moins en "${cat}" ce mois-ci.`
          );
        }
      }
    });

    if (budget > 0 && depensesMois > budget) {
      insights.push(`Tu as dépassé ton budget mensuel de ${Math.round(depensesMois - budget)} ${req.user.currency}.`);
    } else if (budget > 0 && resteAAllouer !== null) {
      insights.push(`Il te reste ${Math.round(resteAAllouer)} ${req.user.currency} à dépenser ce mois-ci.`);
    }

    res.json({
      solde: {
        soldeGlobal,
        revenusMois,
        depensesMois,
        budgetMensuel: budget,
        resteAAllouer,
      },
      depensesParCategorie: parCategorie,
      documentsExpirant: expiringDocs,
      insights,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
