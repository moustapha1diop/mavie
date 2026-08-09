const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Le nom est requis"],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email invalide"],
    },
    password: {
      type: String,
      required: [true, "Le mot de passe est requis"],
      minlength: 8,
      select: false, // jamais renvoyé par défaut dans les requêtes
    },
    // compteur de tentatives échouées pour limiter le brute force au niveau compte
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    monthlyBudget: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "FCFA" },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Ne jamais exposer le hash du mot de passe même si sélectionné manuellement
UserSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    monthlyBudget: this.monthlyBudget,
    currency: this.currency,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", UserSchema);
