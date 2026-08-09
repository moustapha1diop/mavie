const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("ERREUR: MONGO_URI n'est pas défini dans les variables d'environnement.");
    process.exit(1);
  }

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      // Ces options garantissent des délais d'attente raisonnables
      // pour éviter que le serveur reste bloqué si Atlas est injoignable.
      serverSelectionTimeoutMS: 10000,
      autoIndex: process.env.NODE_ENV !== "production", // indexes construits au démarrage seulement en dev
    });
    console.log(`MongoDB Atlas connecté: ${mongoose.connection.host}`);
  } catch (err) {
    console.error("Échec de connexion à MongoDB Atlas:", err.message);
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    console.error("Erreur MongoDB:", err.message);
  });
}

module.exports = connectDB;
