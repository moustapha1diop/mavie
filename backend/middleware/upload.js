const multer = require("multer");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Moteur de stockage multer personnalisé qui envoie le fichier directement
 * vers Cloudinary via un flux (aucune écriture sur le disque de Render, qui
 * est éphémère). Écrit à la main plutôt que via `multer-storage-cloudinary`
 * car ce paquet impose encore le SDK Cloudinary v1 en peer dependency.
 */
class CloudinaryStorageEngine {
  _handleFile(req, file, cb) {
    const isPdf = file.mimetype === "application/pdf";

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `ma-vie/${req.user?._id || "anonymous"}`,
        // "raw" pour les PDF (pas de transformation image), "image" sinon
        resource_type: isPdf ? "raw" : "image",
        // Identifiant aléatoire : jamais le nom de fichier original
        public_id: crypto.randomBytes(16).toString("hex"),
        type: "upload",
      },
      (err, result) => {
        if (err) return cb(err);
        cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
        });
      }
    );

    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    if (!file.filename) return cb(null);
    cloudinary.uploader
      .destroy(file.filename, { resource_type: file.mimetype === "application/pdf" ? "raw" : "image" })
      .then(() => cb(null))
      .catch(cb);
  }
}

const storage = new CloudinaryStorageEngine();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Type de fichier non autorisé. Utilise PDF, JPG, PNG ou WEBP."));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 Mo max
    files: 1,
  },
});

module.exports = upload;
