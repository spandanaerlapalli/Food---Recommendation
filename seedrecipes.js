const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

console.log("MONGODB_URI loaded:", Boolean(process.env.MONGODB_URI));

const MONGODB_URI = process.env.MONGODB_URI;

const RecipeSchema = new mongoose.Schema(
  {
    id: Number,
    name: String,
    user: String,
    type: String,
    category: String,
    time: String,
    prepTime: String,
    cookTime: String,
    servings: Number,
    ingredients: [String],
    process: [String],
    instructions: String,
    image: String
  },
  {
    strict: false
  }
);

const Recipe = mongoose.model("Recipe", RecipeSchema);

async function seedDatabase() {
  try {
    if (!MONGODB_URI) {
      console.log("ERROR: MONGODB_URI not found in .env");
      return;
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGODB_URI);

    console.log("MongoDB connected!");

    const filePath = path.join(__dirname, "recipes.json");

    if (!fs.existsSync(filePath)) {
      console.log("ERROR: recipes.json not found!");
      await mongoose.disconnect();
      return;
    }

    const file = fs.readFileSync(filePath, "utf8");

    const recipes = JSON.parse(file);

    if (!Array.isArray(recipes)) {
      console.log("ERROR: recipes.json must contain an array.");
      await mongoose.disconnect();
      return;
    }

    console.log(`Found ${recipes.length} recipes in recipes.json`);

    await Recipe.deleteMany({});

    console.log("Old recipes deleted.");

    if (recipes.length > 0) {
      await Recipe.insertMany(recipes);
    }

    console.log(
      `SUCCESS: ${recipes.length} recipes added to MongoDB!`
    );

    await mongoose.disconnect();

    console.log("MongoDB connection closed.");
  } catch (error) {
    console.error("SEED ERROR:");
    console.error(error);
  }
}

seedDatabase();