const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }
  next();
}

// --- Inscription ---
router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Le nom est requis.").isLength({ max: 100 }),
    body("email").isEmail().withMessage("Email invalide.").normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Le mot de passe doit contenir au moins 8 caractères.")
      .matches(/\d/)
      .withMessage("Le mot de passe doit contenir au moins un chiffre."),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: "Un compte existe déjà avec cet email." });
      }

      const user = await User.create({ name, email, password });
      const token = signToken(user._id);

      res.status(201).json({ token, user: user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

// --- Connexion ---
router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Email invalide.").normalizeEmail(),
    body("password").notEmpty().withMessage("Mot de passe requis."),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select("+password");

      // Message générique volontairement identique pour ne pas révéler
      // si c'est l'email ou le mot de passe qui est incorrect.
      const genericError = { message: "Email ou mot de passe incorrect." };

      if (!user) return res.status(401).json(genericError);

      if (user.isLocked()) {
        return res.status(423).json({
          message: "Compte temporairement verrouillé suite à trop de tentatives. Réessaie plus tard.",
        });
      }

      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
          user.failedLoginAttempts = 0;
        }
        await user.save();
        return res.status(401).json(genericError);
      }

      // Connexion réussie : réinitialiser le compteur
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();

      const token = signToken(user._id);
      res.json({ token, user: user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

// --- Profil courant ---
router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// --- Mise à jour du budget mensuel ---
router.patch(
  "/budget",
  protect,
  [body("monthlyBudget").isFloat({ min: 0 }).withMessage("Le budget doit être un nombre positif.")],
  handleValidation,
  async (req, res, next) => {
    try {
      req.user.monthlyBudget = req.body.monthlyBudget;
      await req.user.save();
      res.json({ user: req.user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
