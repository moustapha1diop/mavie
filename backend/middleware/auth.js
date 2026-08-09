const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Vérifie le token JWT envoyé dans l'en-tête "Authorization: Bearer <token>".
 * Attache l'utilisateur authentifié (sans mot de passe) à req.user.
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentification requise." });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Session invalide ou expirée. Reconnecte-toi." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "Utilisateur introuvable." });
    }

    req.user = user; // objet complet (le hash du mot de passe n'est jamais sélectionné par défaut)
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { protect };
