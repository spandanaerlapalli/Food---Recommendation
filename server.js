const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, "users.json");
const RECIPES_FILE = path.join(ROOT, "recipes.json");
const IMAGES_DIR = path.join(ROOT, "images");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT));

// ========================================
// JSON HELPERS
// ========================================

function readJSON(file, fallback = []) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2)
            );
        }

        return JSON.parse(
            fs.readFileSync(file, "utf8") ||
            JSON.stringify(fallback)
        );
    } catch (error) {
        console.error("JSON error:", error.message);
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\.(jpg|jpeg|png|webp)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ========================================
// HOME PAGE
// ========================================

app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "index.html"));
});

// ========================================
// REGISTER
// ========================================

app.post("/api/register", (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            password.length < 6
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your name, email and a password of at least 6 characters."
            });
        }

        const users = readJSON(USERS_FILE, []);

        if (!Array.isArray(users)) {
            return res.status(500).json({
                success: false,
                message: "Invalid users.json file."
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        if (users.some(user =>
            String(user.email || "").toLowerCase() === cleanEmail
        )) {
            return res.status(409).json({
                success: false,
                message: "Email already registered. Please log in."
            });
        }

        const salt = crypto.randomBytes(16).toString("hex");

        const passwordHash = crypto
            .pbkdf2Sync(password, salt, 100000, 64, "sha512")
            .toString("hex");

        users.push({
            id: crypto.randomUUID(),
            name: name.trim(),
            email: cleanEmail,
            salt,
            passwordHash
        });

        writeJSON(USERS_FILE, users);

        return res.status(201).json({
            success: true,
            message: "Registration successful. Please log in."
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
});

// ========================================
// LOGIN
// ========================================

app.post("/api/login", (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your email and password."
            });
        }

        const users = readJSON(USERS_FILE, []);

        if (!Array.isArray(users)) {
            return res.status(500).json({
                success: false,
                message: "Invalid users.json file."
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const user = users.find(item =>
            String(item.email || "").toLowerCase() === cleanEmail
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        let matches = false;

        if (user.passwordHash && user.salt) {
            const expected = Buffer.from(user.passwordHash, "hex");

            const supplied = Buffer.from(
                crypto.pbkdf2Sync(
                    password,
                    user.salt,
                    100000,
                    64,
                    "sha512"
                ).toString("hex"),
                "hex"
            );

            matches =
                expected.length === supplied.length &&
                crypto.timingSafeEqual(expected, supplied);

        } else if (typeof user.password === "string") {
            matches = user.password === password;
        }

        if (!matches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        return res.json({
            success: true,
            message: "Login successful!",
            user: {
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

// ========================================
// RECIPES API
// ========================================

app.get("/api/recipes", (req, res) => {
    const recipes = readJSON(RECIPES_FILE, []);

    if (!Array.isArray(recipes)) {
        return res.status(500).json({
            success: false,
            message: "recipes.json must contain an array."
        });
    }

    res.json(recipes);
});

// ========================================
// RECIPE IMAGE HELPERS
// ========================================

const imageCache = new Map();
const pendingSearches = new Map();

const aliases = {
    "gongura pachadi": "gongura chutney",
    "gutti vankaya curry": "stuffed brinjal curry",
    "mamidikaya pappu": "raw mango dal",
    "andhra garlic rasam": "garlic rasam",
    "pulihora": "tamarind rice",
    "pesarattu": "green gram dosa",
    "avakaya pachadi": "mango pickle",
    "bendakaya pulusu": "okra curry",
    "medu vada": "medu vada Indian food",
    "ven pongal": "ven pongal Indian food",
    "masala dosa": "masala dosa Indian food",
    "plain dosa": "plain dosa Indian food",
    "vegetable upma": "vegetable upma Indian food"
};

// ========================================
// IMPROVED LOCAL IMAGE FINDER
// ========================================
function findLocalImage(recipeName) {
    if (!fs.existsSync(IMAGES_DIR)) {
        return null;
    }

    const files = fs.readdirSync(IMAGES_DIR).filter(file =>
        /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    function normalizeName(name) {
        return name
            .replace(/\.(jpg|jpeg|png|webp)$/i, "")
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/[^a-z0-9 ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const wanted = normalizeName(recipeName);

    if (!wanted) {
        return null;
    }

    // 1. Prefer an exact filename match.
    const exact = files.find(file =>
        normalizeName(file) === wanted
    );

    if (exact) {
        return "/images/" + encodeURIComponent(exact);
    }

    // 2. Match only when the complete recipe name
    // appears in the filename.
    const matching = files.filter(file => {
        const filename = normalizeName(file);

        return filename.includes(wanted);
    });

    // Avoid guessing when several different photos match.
    if (matching.length === 1) {
        return "/images/" + encodeURIComponent(matching[0]);
    }

    // No reliable match found.
    return null;
}
// ========================================
// ONLINE IMAGE SEARCH
// ========================================

async function findOnlineImage(name) {
    const wanted = normalize(name);
    const searchName = aliases[wanted] || name;

    const url = new URL(
        "https://commons.wikimedia.org/w/api.php"
    );

    url.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: searchName + " food",
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "600",
        format: "json"
    }).toString();

    const response = await fetch(url, {
        headers: {
            "User-Agent": "BiteFoodRecipeProject/1.0"
        },
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        throw new Error("Image search HTTP " + response.status);
    }

    const data = await response.json();

    const pages = Object.values(data.query?.pages || {});

    const candidates = pages
        .filter(page => {
            const image =
                page.imageinfo?.[0]?.thumburl ||
                page.imageinfo?.[0]?.url;

            return image &&
                /^https?:\/\//i.test(image) &&
                !/\.svg(?:$|\?)/i.test(image) &&
                !/logo|icon|map|flag|poster/i.test(page.title || "");
        })
        .map(page => ({
            title: normalize(page.title),
            image:
                page.imageinfo?.[0]?.thumburl ||
                page.imageinfo?.[0]?.url
        }));

    // Prefer a result whose title matches the dish.
    const exact = candidates.find(item =>
        item.title.includes(wanted)
    );

    if (exact) {
        return exact.image;
    }

    const alternateName = normalize(aliases[wanted] || "");

    if (alternateName) {
        const alternateMatch = candidates.find(item =>
            item.title.includes(alternateName)
        );

        if (alternateMatch) {
            return alternateMatch.image;
        }
    }

    // Avoid returning a potentially unrelated image.
    return null;
}

// ========================================
// AUTOMATIC PHOTO API
// ========================================

app.get("/api/food-image", async (req, res) => {
    const name = String(req.query.name || "").trim();

    if (!name) {
        return res.status(400).json({
            error: "Recipe name is required"
        });
    }

    const key = normalize(name);

    // Reuse a previously successful result.
    if (imageCache.has(key)) {
        return res.json({
            name,
            image: imageCache.get(key)
        });
    }

    // Check local images first.
    const local = findLocalImage(name);

    if (local) {
        imageCache.set(key, local);

        return res.json({
            name,
            image: local
        });
    }

    // Reuse an image search already in progress.
    if (pendingSearches.has(key)) {
        try {
            const image = await pendingSearches.get(key);

            if (image) {
                return res.json({ name, image });
            }

            return res.status(404).json({
                error: "No matching photo found"
            });
        } catch {
            return res.status(502).json({
                error: "Image service temporarily unavailable"
            });
        }
    }

    const searchPromise = findOnlineImage(name);
    pendingSearches.set(key, searchPromise);

    try {
        const image = await searchPromise;

        if (!image) {
            return res.status(404).json({
                error: "No matching photo found"
            });
        }

        imageCache.set(key, image);

        return res.json({
            name,
            image
        });

    } catch (error) {
        console.error("Image search error:", error.message);

        return res.status(502).json({
            error: "Image service temporarily unavailable"
        });

    } finally {
        pendingSearches.delete(key);
    }
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
    console.log(
        `BiteFood server running at http://localhost:${PORT}`
    );
});