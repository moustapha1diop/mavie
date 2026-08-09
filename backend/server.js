require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

const connectDB = require("./config/db");
require("./config/cloudinary"); // configure le SDK dès le démarrage
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiters");

const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const financeRoutes = require("./routes/financeRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

// Render (et la plupart des PaaS) sont derrière un proxy inverse.
// Nécessaire pour que express-rate-limit et req.secure fonctionnent correctement.
app.set("trust proxy", 1);

// --- Sécurité HTTP de base ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// --- CORS : n'autorise que l'origine du frontend web + les coquilles natives Capacitor ---
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || "http://localhost:5000",
  "capacitor://localhost", // app native iOS
  "http://localhost",      // app native Android (androidScheme: https utilise en fait https://localhost, gardé par sécurité)
  "https://localhost",     // app native Android
];

app.use(
  cors({
    origin(origin, callback) {
      // "origin" est absent pour les requêtes sans navigateur (ex: apps natives
      // via certains clients HTTP) — on les autorise, la vraie protection
      // reste l'authentification JWT sur chaque route.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origine non autorisée par CORS."));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

// --- Parsing JSON avec une limite de taille (anti-DoS basique) ---
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// --- Anti-injection NoSQL (nettoie req.body/req.query des opérateurs Mongo type $gt) ---
app.use(mongoSanitize());

// --- Anti-pollution des paramètres HTTP ---
app.use(hpp());

// --- Rate limiting global sur toute l'API ---
app.use("/api", apiLimiter);

// --- Redirection forcée vers HTTPS en production (Render fournit déjà le TLS,
//     ceci est une sécurité supplémentaire si jamais du trafic HTTP arrive) ---
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// --- Fichiers statiques ---
// Les documents uploadés vivent sur Cloudinary (persistant), pas sur le disque
// éphémère de Render. Seul le frontend est servi localement.
app.use(express.static(path.join(__dirname, "..", "frontend")));

// --- Routes API ---
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/dashboard", dashboardRoutes);

// --- Healthcheck pour Render ---
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Toute route non-API renvoie index.html (pour une SPA simple)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn(
    "ATTENTION: variables CLOUDINARY_* manquantes. L'upload de documents échouera tant qu'elles ne sont pas définies."
  );
}

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Serveur "Ma Vie" démarré sur le port ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
});

// Sécurité : éviter que le process crashe silencieusement sur une erreur non gérée
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});
