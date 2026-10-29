const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const RECIPES_FILE = path.join(ROOT, "recipes.json");
const IMAGES_DIR = path.join(ROOT, "images");
const REPORT_FILE = path.join(ROOT, "image-report.json");

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\.(jpg|jpeg|png|webp|gif|svg)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getName(recipe) {
    return recipe.name ||
        recipe.title ||
        recipe.recipeName ||
        recipe.dishName ||
        "Unnamed recipe";
}

function getImagePath(recipe) {
    return recipe.image ||
        recipe.imageUrl ||
        recipe.image_url ||
        recipe.photo ||
        recipe.photoUrl ||
        "";
}

function main() {
    if (!fs.existsSync(RECIPES_FILE)) {
        console.error("recipes.json not found.");
        return;
    }

    if (!fs.existsSync(IMAGES_DIR)) {
        console.error("images folder not found.");
        return;
    }

    const recipes = JSON.parse(
        fs.readFileSync(RECIPES_FILE, "utf8")
    );

    if (!Array.isArray(recipes)) {
        console.error("recipes.json must contain an array.");
        return;
    }

    const actualFiles = fs.readdirSync(IMAGES_DIR)
        .filter(file =>
            /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file)
        );

    const exactFiles = new Set(actualFiles);
    const normalizedFiles = new Map();

    for (const file of actualFiles) {
        const key = normalize(file);

        if (!normalizedFiles.has(key)) {
            normalizedFiles.set(key, file);
        }
    }

    const report = recipes.map(recipe => {
        const name = getName(recipe);
        const image = getImagePath(recipe);

        let status = "missing";
        let matchedFile = null;

        if (image && /^https?:\/\//i.test(String(image))) {
            status = "external URL";
        } else if (image) {
            const relativePath = String(image)
                .replace(/^\/+/, "")
                .replace(/\\/g, "/");

            const filename = path.basename(relativePath);

            if (exactFiles.has(filename)) {
                status = "file exists";
                matchedFile = filename;
            } else if (normalizedFiles.has(normalize(filename))) {
                status = "filename mismatch";
                matchedFile = normalizedFiles.get(normalize(filename));
            }
        }

        // Suggest an exact filename based on the recipe name.
        const nameKey = normalize(name);
        const suggestion = normalizedFiles.get(nameKey) || null;

        if (status === "missing" && suggestion) {
            status = "possible match";
            matchedFile = suggestion;
        }

        return {
            recipe: name,
            currentImage: image || null,
            status,
            suggestedFile: matchedFile
        };
    });

    fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    const counts = {};

    for (const item of report) {
        counts[item.status] = (counts[item.status] || 0) + 1;
    }

    console.log("\n========== BITEFOOD IMAGE REPORT ==========");
    console.log("Total recipes:", recipes.length);
    console.log("Images in folder:", actualFiles.length);
    console.log("\nResults:");

    for (const [status, count] of Object.entries(counts)) {
        console.log(`${status}: ${count}`);
    }

    console.log("\nReport saved to:", REPORT_FILE);
    console.log("No recipes or images were changed.");
}

main();