// ======================================================
// BITEFOOD: AUTOMATIC RECIPE IMAGE DOWNLOADER
// Preserves existing photos, retries failures, and saves progress
// ======================================================

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const RECIPES_FILE = path.join(ROOT, "recipes.json");
const IMAGES_DIR = path.join(ROOT, "images");
const FAILED_FILE = path.join(ROOT, "failed-images.json");
const BACKUP_FILE = path.join(ROOT, "recipes.backup.json");

const PLACEHOLDER = "/images/food-placeholder.svg";
const DELAY_MS = 4000;
const MAX_RETRIES = 3;

const ALIASES = {
    "gongura pachadi": ["gongura chutney", "gongura pickle"],
    "gutti vankaya curry": ["stuffed brinjal curry", "stuffed eggplant curry"],
    "mamidikaya pappu": ["raw mango dal", "mango lentil curry"],
    "pulihora": ["Andhra tamarind rice", "puliyodarai"],
    "pesarattu": ["green gram dosa", "moong dal dosa"],
    "avakaya pachadi": ["Andhra mango pickle", "Indian mango pickle"],
    "bendakaya pulusu": ["okra curry", "Andhra ladies finger curry"],
    "chepala pulusu": ["Andhra fish curry", "Indian fish curry"],
    "royyala iguru": ["Andhra prawn curry", "Indian prawn curry"],
    "poornam boorelu": ["poornam boorelu sweet", "Andhra sweet boorelu"],
    "hyderabadi chicken biryani": ["Hyderabadi chicken biryani"],
    "egg biryani": ["Indian egg biryani", "boiled egg biryani"],
    "vegetable pulao": ["Indian vegetable pulao", "vegetable pilaf"],
    "andhra chicken curry": ["Andhra chicken curry"],
    "masala dosa": ["Indian masala dosa"],
    "idli": ["South Indian idli"],
    "sambar": ["South Indian sambar"],
    "okra curry": ["Indian bhindi curry"],
    "okra fry": ["Indian bhindi fry"],
    "bitter gourd curry": ["Indian karela curry"],
    "cabbage curry": ["Indian cabbage curry"],
    "cauliflower curry": ["Indian gobi curry"]
};

const BLOCKED_TERMS =
    /logo|icon|map|flag|poster|diagram|drawing|symbol|coat.of.arms|screenshot/i;

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\.(jpg|jpeg|png|webp|svg)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function slugify(value) {
    return normalize(value).replace(/\s+/g, "-");
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function readRecipes() {
    if (!fs.existsSync(RECIPES_FILE)) {
        throw new Error("recipes.json was not found.");
    }

    const data = JSON.parse(
        fs.readFileSync(RECIPES_FILE, "utf8")
    );

    if (!Array.isArray(data)) {
        throw new Error("recipes.json must contain a JSON array.");
    }

    return data;
}

function getName(recipe) {
    return String(
        recipe.name ||
        recipe.title ||
        recipe.recipeName ||
        recipe.dishName ||
        ""
    ).trim();
}

function getCurrentImage(recipe) {
    return (
        recipe.image ||
        recipe.imageUrl ||
        recipe.image_url ||
        recipe.photo ||
        recipe.photoUrl ||
        ""
    );
}

// Preserve only valid, existing local image files.
function findExistingImage(recipe) {
    const current = String(getCurrentImage(recipe)).trim();

    if (
        current &&
        !/^https?:\/\//i.test(current) &&
        !/^data:/i.test(current)
    ) {
        const filename = path.basename(
            current.split("?")[0]
        );

        if (/^\.+$/.test(filename)) {
            return "";
        }

        const fullPath = path.join(IMAGES_DIR, filename);

        if (
            /\.(jpg|jpeg|png|webp)$/i.test(filename) &&
            fs.existsSync(fullPath) &&
            fs.statSync(fullPath).size > 0
        ) {
            return filename;
        }
    }

    const wanted = normalize(getName(recipe));

    const files = fs.readdirSync(IMAGES_DIR);

    return files.find(file =>
        /\.(jpg|jpeg|png|webp)$/i.test(file) &&
        normalize(file) === wanted &&
        fs.statSync(path.join(IMAGES_DIR, file)).size > 0
    ) || "";
}

// Retry temporary errors and respect Retry-After.
async function fetchWithRetry(url) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent":
                        "BiteFoodRecipeProject/1.0 (educational recipe application)"
                },
                signal: AbortSignal.timeout(20000)
            });

            if (response.ok) {
                return response;
            }

            const error = new Error(`HTTP ${response.status}`);
            lastError = error;

            const retryable =
                response.status === 429 ||
                response.status >= 500;

            if (!retryable || attempt === MAX_RETRIES) {
                throw error;
            }

            const retryAfter = Number(
                response.headers.get("retry-after")
            );

            const delay = Number.isFinite(retryAfter) &&
                retryAfter > 0
                ? Math.min(retryAfter * 1000, 60000)
                : attempt * 10000;

            console.log(
                `Temporary HTTP ${response.status}; retrying in ${Math.ceil(delay / 1000)} seconds.`
            );

            await wait(delay);
        } catch (error) {
            lastError = error;

            if (
                attempt === MAX_RETRIES ||
                /^HTTP 4\d\d$/.test(error.message)
            ) {
                throw error;
            }

            await wait(attempt * 5000);
        }
    }

    throw lastError || new Error("Image request failed.");
}

// Search Wikimedia Commons using a dish name.
async function searchCommons(searchName, recipeName) {
    const api = new URL(
        "https://commons.wikimedia.org/w/api.php"
    );

    api.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: `filetype:bitmap "${searchName}" food`,
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "700",
        format: "json"
    }).toString();

    const response = await fetchWithRetry(api.toString());
    const data = await response.json();

    const wanted = normalize(searchName);
    const recipeWords = normalize(recipeName)
        .split(" ")
        .filter(word => word.length > 2);

    const pages = Object.values(data.query?.pages || {});

    const candidates = pages
        .map(page => {
            const info = page.imageinfo?.[0];

            return {
                title: normalize(page.title || ""),
                url: info?.thumburl || info?.url,
                mime: info?.mime || ""
            };
        })
        .filter(item =>
            item.url &&
            /^https?:\/\//i.test(item.url) &&
            item.mime.startsWith("image/") &&
            !/svg/i.test(item.mime) &&
            !BLOCKED_TERMS.test(item.title)
        )
        .map(item => {
            const title = item.title.replace(/^file /, "");

            const matched = recipeWords.filter(word =>
                title.includes(word)
            ).length;

            return {
                ...item,
                score: recipeWords.length
                    ? matched / recipeWords.length
                    : 0,
                exactPhrase: title.includes(wanted)
            };
        })
        .filter(item =>
            item.exactPhrase || item.score >= 0.6
        )
        .sort((a, b) =>
            Number(b.exactPhrase) - Number(a.exactPhrase) ||
            b.score - a.score
        );

    return candidates[0]?.url || null;
}

// Try the original name, followed by known alternatives.
async function findImage(recipeName) {
    const normalized = normalize(recipeName);
    const alternatives = ALIASES[normalized] || [];

    const searches = [
        recipeName,
        ...alternatives
    ];

    for (const searchName of [...new Set(searches)]) {
        try {
            console.log("Searching:", searchName);

            const url = await searchCommons(
                searchName,
                recipeName
            );

            if (url) {
                return url;
            }
        } catch (error) {
            console.log(
                `Search failed for "${searchName}": ${error.message}`
            );

            if (/HTTP 429/.test(error.message)) {
                await wait(15000);
            }
        }

        await wait(1500);
    }

    return null;
}

function extensionFromURL(url) {
    try {
        const pathname = new URL(url).pathname;
        const extension = path.extname(pathname).toLowerCase();

        if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
            return extension === ".jpeg" ? ".jpg" : extension;
        }
    } catch {
        // Default to JPG.
    }

    return ".jpg";
}

async function downloadImage(url, destination) {
    const response = await fetchWithRetry(url);

    const contentType = (
        response.headers.get("content-type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("image/") ||
        contentType.includes("svg")) {
        throw new Error("The response is not a supported photo.");
    }

    const buffer = Buffer.from(
        await response.arrayBuffer()
    );

    if (buffer.length < 1000) {
        throw new Error("Downloaded image is too small.");
    }

    // Basic file signature validation.
    const isJPEG =
        buffer[0] === 0xff && buffer[1] === 0xd8;

    const isPNG =
        buffer.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );

    const isWEBP =
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP";

    if (!isJPEG && !isPNG && !isWEBP) {
        throw new Error("Downloaded file is not a valid JPG, PNG, or WebP image.");
    }

    fs.writeFileSync(destination, buffer);
}

function saveProgress(recipes, failed) {
    fs.writeFileSync(
        RECIPES_FILE,
        JSON.stringify(recipes, null, 2),
        "utf8"
    );

    fs.writeFileSync(
        FAILED_FILE,
        JSON.stringify(failed, null, 2),
        "utf8"
    );
}

async function main() {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });

    const recipes = readRecipes();

    if (!fs.existsSync(BACKUP_FILE)) {
        fs.copyFileSync(RECIPES_FILE, BACKUP_FILE);
        console.log("Created recipes.backup.json");
    }

    const failed = [];
    let skipped = 0;
    let downloaded = 0;

    console.log(`Total recipes: ${recipes.length}`);
    console.log("Existing local images will be preserved.");

    for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        const name = getName(recipe);

        if (!name) {
            failed.push({
                index: i,
                recipe: "Unknown",
                reason: "Recipe name is missing"
            });

            continue;
        }

        const existing = findExistingImage(recipe);

        if (existing) {
            recipe.image = `/images/${existing}`;
            skipped++;

            if ((i + 1) % 50 === 0) {
                saveProgress(recipes, failed);
                console.log(
                    `Progress: ${i + 1}/${recipes.length}`
                );
            }

            continue;
        }

        console.log(
            `\n[${i + 1}/${recipes.length}] ${name}`
        );

        try {
            const imageURL = await findImage(name);

            if (!imageURL) {
                throw new Error("No suitable matching image found.");
            }

            const extension = extensionFromURL(imageURL);
            const filename = slugify(name) + extension;
            const destination = path.join(IMAGES_DIR, filename);

            // Do not overwrite an existing file.
            if (!fs.existsSync(destination)) {
                await downloadImage(imageURL, destination);
            }

            recipe.image = `/images/${filename}`;
            downloaded++;

            console.log("Saved:", filename);
        } catch (error) {
            // The front end will use the placeholder if no photo exists.
            recipe.image = PLACEHOLDER;

            failed.push({
                index: i,
                recipe: name,
                reason: error.message
            });

            console.log(
                `Using placeholder for "${name}": ${error.message}`
            );
        }

        // Save after every recipe, so completed work is not lost.
        saveProgress(recipes, failed);

        await wait(DELAY_MS);
    }

    saveProgress(recipes, failed);

    console.log("\n========== COMPLETE ==========");
    console.log("Total recipes:", recipes.length);
    console.log("Existing images reused:", skipped);
    console.log("New images downloaded:", downloaded);
    console.log("Recipes needing attention:", failed.length);
    console.log("Failure report:", FAILED_FILE);
    console.log("Backup:", BACKUP_FILE);
}

main().catch(error => {
    console.error("Downloader stopped:", error.message);
    process.exitCode = 1;
});