const rateLimit = require("express-rate-limit");

// Limite stricte sur les routes sensibles (login/register) pour freiner le brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessaie dans 15 minutes." },
});

// Limite générale plus permissive pour le reste de l'API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes, ralentis un peu." },
});

module.exports = { authLimiter, apiLimiter };
