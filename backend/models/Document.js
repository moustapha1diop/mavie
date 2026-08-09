const mongoose = require("mongoose");

const DOCUMENT_TYPES = [
  "carte_identite",
  "passeport",
  "permis",
  "diplome",
  "contrat",
  "facture",
  "certificat",
  "autre",
];

const DocumentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    type: { type: String, enum: DOCUMENT_TYPES, default: "autre" },
    expirationDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000 },
    // Fichier stocké sur Cloudinary (persistant, contrairement au disque de Render)
    fileUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
    cloudinaryId: { type: String, default: null }, // public_id, requis pour la suppression
    cloudinaryResourceType: { type: String, default: null }, // "image" ou "raw"
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DocumentSchema.index({ owner: 1, expirationDate: 1 });

module.exports = mongoose.model("Document", DocumentSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
