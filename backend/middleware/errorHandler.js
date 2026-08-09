function notFound(req, res, next) {
  res.status(404).json({ message: "Route introuvable." });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err.stack || err.message);

  let statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  let message = err.message || "Erreur serveur.";

  // Erreurs de validation Mongoose
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }

  // Clé dupliquée (ex: email déjà utilisé)
  if (err.code === 11000) {
    statusCode = 409;
    message = "Cette valeur existe déjà (email déjà utilisé ?).";
  }

  // Ne jamais renvoyer la stack trace en production
  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
