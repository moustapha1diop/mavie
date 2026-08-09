const express = require("express");
const { body, validationResult } = require("express-validator");
const Document = require("../models/Document");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const router = express.Router();
router.use(protect); // toutes les routes ci-dessous exigent une authentification

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
}

// --- Liste des documents de l'utilisateur connecté ---
router.get("/", async (req, res, next) => {
  try {
    const documents = await Document.find({ owner: req.user._id }).sort({ expirationDate: 1 });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// --- Ajouter un document (avec fichier optionnel) ---
router.post(
  "/",
  upload.single("file"),
  [
    body("title").trim().notEmpty().withMessage("Le titre est requis.").isLength({ max: 150 }),
    body("expirationDate").optional({ checkFalsy: true }).isISO8601().withMessage("Date invalide."),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { title, type, expirationDate, notes } = req.body;

      const doc = await Document.create({
        owner: req.user._id,
        title,
        type,
        expirationDate: expirationDate || null,
        notes,
        // multer-storage-cloudinary expose l'URL sécurisée dans req.file.path
        // et le public_id dans req.file.filename
        fileUrl: req.file ? req.file.path : null,
        fileName: req.file ? req.file.originalname : null,
        mimeType: req.file ? req.file.mimetype : null,
        cloudinaryId: req.file ? req.file.filename : null,
        cloudinaryResourceType: req.file ? (req.file.mimetype === "application/pdf" ? "raw" : "image") : null,
      });

      res.status(201).json({ document: doc });
    } catch (err) {
      next(err);
    }
  }
);

// --- Modifier un document ---
router.put("/:id", async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document introuvable." });

    const { title, type, expirationDate, notes } = req.body;
    if (title !== undefined) doc.title = title;
    if (type !== undefined) doc.type = type;
    if (expirationDate !== undefined) doc.expirationDate = expirationDate || null;
    if (notes !== undefined) doc.notes = notes;

    await doc.save();
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
});

// --- Supprimer un document ---
router.delete("/:id", async (req, res, next) => {
  try {
    const doc = await Document.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document introuvable." });

    // Supprime aussi le fichier sur Cloudinary pour ne pas laisser de données orphelines
    if (doc.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(doc.cloudinaryId, {
          resource_type: doc.cloudinaryResourceType || "image",
        });
      } catch (cloudErr) {
        // On ne bloque pas la réponse pour ça : le document est déjà supprimé
        // côté base de données, mais on garde une trace de l'échec.
        console.error("Échec de suppression Cloudinary:", cloudErr.message);
      }
    }

    res.json({ message: "Document supprimé." });
  } catch (err) {
    next(err);
  }
});

// --- Documents qui expirent bientôt (par défaut: 60 jours) ---
router.get("/alerts/expiring", async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 60;
    const limitDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const documents = await Document.find({
      owner: req.user._id,
      expirationDate: { $ne: null, $lte: limitDate },
    }).sort({ expirationDate: 1 });

    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
