// ============================================
// BITEFOOD - COMPLETE SCRIPT.JS
// All buttons + recipe search + images
// Preparation Time Only
// ============================================

const API_URL = "/api/recipes";

let allRecipes = [];
let activeCategory = "all";
let activeDiet = "all";
let searchText = "";

window.displayedRecipes = [];
const imageCache = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/\.(jpg|jpeg|png|webp)$/i, "")
        .replace(/[_-]/g, " ")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function getRecipeName(recipe) {
    return recipe.name ||
        recipe.title ||
        recipe.recipeName ||
        recipe.dishName ||
        "Indian Recipe";
}

function getRecipeCategory(recipe) {
    const name = normalize(getRecipeName(recipe));

    const originalCategory = normalize(
        recipe.category ||
        recipe.recipeCategory ||
        recipe.type ||
        ""
    );

    // Identify Sambar and Rasam first.
    if (name.includes("sambar") || originalCategory.includes("sambar")) {
        return "Sambar";
    }

    if (name.includes("rasam") || originalCategory.includes("rasam")) {
        return "Rasam";
    }

    // Tiffin and breakfast dishes.
    const tiffinKeywords = [
        "idli", "dosa", "pesarattu", "upma", "pongal",
        "vada", "uttapam", "punugulu", "mirchi bajji",
        "poha", "paratha", "chapati", "puri", "appam",
        "breakfast", "tiffin"
    ];

    if (
        originalCategory.includes("tiffin") ||
        originalCategory.includes("breakfast") ||
        tiffinKeywords.some(keyword => name.includes(keyword))
    ) {
        return "Tiffin";
    }

    // Map common category names to the HTML buttons.
    if (
        originalCategory.includes("snack") ||
        originalCategory.includes("starter")
    ) {
        return "Snacks";
    }

    if (
        originalCategory.includes("sweet") ||
        originalCategory.includes("dessert")
    ) {
        return "Sweets";
    }

    if (
        originalCategory.includes("curry") ||
        originalCategory.includes("gravy")
    ) {
        return "Curries";
    }

    if (
        originalCategory.includes("dal") ||
        originalCategory.includes("pappu")
    ) {
        return "Dal";
    }

    if (
        originalCategory.includes("pachadi") ||
        originalCategory.includes("chutney")
    ) {
        return "Pachadi";
    }

    return recipe.category ||
        recipe.recipeCategory ||
        recipe.type ||
        "Other";
}

function getRecipeDiet(recipe) {
    const diet = normalize(
        recipe.diet ||
        recipe.foodType ||
        recipe.typeOfFood ||
        ""
    );

    if (
        diet.includes("non veg") ||
        diet.includes("nonvegetarian") ||
        diet.includes("non vegetarian") ||
        diet === "nonveg"
    ) {
        return "Non-Veg";
    }

    if (diet.includes("veg") || diet.includes("vegetarian")) {
        return "Veg";
    }

    const name = normalize(getRecipeName(recipe));

    const nonVegKeywords = [
        "chicken", "mutton", "fish", "prawn", "prawns",
        "shrimp", "egg", "crab", "meat", "keema",
        "lamb", "beef", "pork"
    ];

    return nonVegKeywords.some(keyword => name.includes(keyword))
        ? "Non-Veg"
        : "Veg";
}

// ============================================
// PREPARATION TIME ONLY
// ============================================

function getPreparationTime(recipe) {
    return recipe.prepTime ||
        recipe.preparationTime ||
        recipe.preparation_time ||
        recipe.prep_time ||
        "Not specified";
}

// ============================================
// RECIPE IMAGES
// ============================================

function getRecipeImage(recipe) {
    const name = normalize(getRecipeName(recipe));

    if (imageCache.has(name)) {
        return imageCache.get(name);
    }

    // Use the image specified in recipes.json when available.
    let image = typeof recipe.image === "string"
        ? recipe.image.trim()
        : "";

    // Use a generated local filename if no image is specified.
    if (!image) {
        const filename = name
            .replace(/[^a-z0-9 ]/g, "")
            .trim()
            .replace(/\s+/g, "-");

        image = `/images/${filename}.jpg`;
    }

    imageCache.set(name, image);
    return image;
}

function handleImageError(img) {
    if (img.dataset.fallbackTried !== "true") {
        img.dataset.fallbackTried = "true";
        img.src = "/images/default-food.jpg";
        return;
    }

    img.style.display = "none";

    const placeholder = img.parentElement.querySelector(
        ".image-placeholder"
    );

    if (placeholder) {
        placeholder.style.display = "flex";
    }
}

// ============================================
// LOAD RECIPES
// ============================================

async function loadRecipes() {
    const container = document.getElementById("recipeContainer");

    if (container) {
        container.innerHTML = `
            <div class="message">Loading delicious recipes...</div>
        `;
    }

    try {
        let response = await fetch(API_URL);

        if (!response.ok) {
            response = await fetch("/recipes.json");
        }

        if (!response.ok) {
            throw new Error(`Unable to load recipes: HTTP ${response.status}`);
        }

        const data = await response.json();

        allRecipes = Array.isArray(data)
            ? data
            : Array.isArray(data.recipes)
                ? data.recipes
                : [];

        if (allRecipes.length === 0) {
            throw new Error("The recipe list is empty.");
        }

        displayCategoryButtons();
        displayRecipes();

    } catch (error) {
        console.error("Recipe loading error:", error);

        if (container) {
            container.innerHTML = `
                <div class="message">
                    <h3>Unable to load recipes</h3>
                    <p>Check your server and recipes.json file.</p>
                    <button type="button" onclick="loadRecipes()">
                        Try Again
                    </button>
                </div>
            `;
        }

        const count = document.getElementById("recipeCount");

        if (count) {
            count.textContent = "Recipes could not be loaded.";
        }
    }
}

// ============================================
// CONNECT CATEGORY BUTTONS IN index.html
// ============================================

function displayCategoryButtons() {
    document.querySelectorAll(".category-btn").forEach(button => {
        button.onclick = () => {
            filterByCategory(button.dataset.category || "all");
        };
    });
}

// ============================================
// DISPLAY AND FILTER RECIPES
// ============================================

function displayRecipes() {
    const container = document.getElementById("recipeContainer");

    if (!container) {
        console.error('Missing HTML element: id="recipeContainer"');
        return;
    }

    const filteredRecipes = allRecipes.filter(recipe => {
        const name = normalize(getRecipeName(recipe));
        const category = normalize(getRecipeCategory(recipe));
        const diet = normalize(getRecipeDiet(recipe));

        const ingredients = normalize(
            Array.isArray(recipe.ingredients)
                ? recipe.ingredients.join(" ")
                : recipe.ingredients || ""
        );

        const matchesSearch =
            !searchText ||
            name.includes(normalize(searchText)) ||
            category.includes(normalize(searchText)) ||
            ingredients.includes(normalize(searchText));

        const matchesCategory =
            activeCategory === "all" ||
            category === normalize(activeCategory);

        const matchesDiet =
            activeDiet === "all" ||
            diet === normalize(activeDiet);

        return matchesSearch && matchesCategory && matchesDiet;
    });

    window.displayedRecipes = filteredRecipes;

    const count = document.getElementById("recipeCount");

    if (count) {
        count.textContent = `${filteredRecipes.length} recipes found`;
    }

    if (filteredRecipes.length === 0) {
        container.innerHTML = `
            <div class="message">
                <h3>No recipes found</h3>
                <p>Try another search or select a different category.</p>
                <button type="button" onclick="resetFilters()">
                    Show All Recipes
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredRecipes.map((recipe, index) => {
        const name = getRecipeName(recipe);
        const category = getRecipeCategory(recipe);
        const diet = getRecipeDiet(recipe);
        const prepTime = getPreparationTime(recipe);
        const image = getRecipeImage(recipe);

        return `
            <article class="recipe-card">

                <div class="recipe-image-container">
                    <img
                        class="recipe-image"
                        src="${escapeHTML(image)}"
                        alt="${escapeHTML(name)}"
                        loading="lazy"
                        onerror="handleImageError(this)"
                    >

                    <div class="image-placeholder" style="display:none;">
                        🍲
                    </div>
                </div>

                <div class="recipe-content">
                    <h3 class="recipe-title">
                        ${escapeHTML(name)}
                    </h3>

                    <p class="recipe-category">
                        ${escapeHTML(category)}
                    </p>

                    <p class="recipe-diet">
                        ${escapeHTML(diet)}
                    </p>

                    <p class="preparation-time">
                        <strong>Preparation Time:</strong>
                        ${escapeHTML(prepTime)}
                    </p>

                    <button
                        type="button"
                        class="view-recipe-btn"
                        onclick="showRecipeDetails(${index})"
                    >
                        View Recipe
                    </button>
                </div>

            </article>
        `;
    }).join("");
}

// ============================================
// CATEGORY FILTER
// ============================================

function filterByCategory(category) {
    activeCategory = normalize(category) === "all"
        ? "all"
        : category;

    document.querySelectorAll(".category-btn").forEach(button => {
        button.classList.toggle(
            "active",
            normalize(button.dataset.category || "all") ===
            normalize(activeCategory)
        );
    });

    displayRecipes();
}

// ============================================
// VEG / NON-VEG FILTER
// ============================================

function filterByDiet(diet) {
    activeDiet = normalize(diet) === "all"
        ? "all"
        : diet;

    displayRecipes();
}

// ============================================
// SEARCH RECIPES
// ============================================

function searchRecipes() {
    const input = document.getElementById("searchInput");

    searchText = input ? input.value.trim() : "";
    displayRecipes();
}

// ============================================
// RESET ALL FILTERS
// ============================================

function resetFilters() {
    activeCategory = "all";
    activeDiet = "all";
    searchText = "";

    const input = document.getElementById("searchInput");
    const diet = document.getElementById("dietFilter");

    if (input) input.value = "";
    if (diet) diet.value = "all";

    document.querySelectorAll(".category-btn").forEach(button => {
        button.classList.toggle(
            "active",
            normalize(button.dataset.category || "all") === "all"
        );
    });

    displayRecipes();
}

// ============================================
// VIEW RECIPE DETAILS
// ============================================

function showRecipeDetails(index) {
    const recipe = (window.displayedRecipes || [])[index];

    if (!recipe) {
        console.error("Recipe not found at index:", index);
        return;
    }

    const name = getRecipeName(recipe);
    const image = getRecipeImage(recipe);
    const prepTime = getPreparationTime(recipe);

    const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients
        : typeof recipe.ingredients === "string"
            ? recipe.ingredients.split(/\n|,/).filter(Boolean)
            : [];

    const rawInstructions = recipe.steps || recipe.instructions || [];

    const instructions = Array.isArray(rawInstructions)
        ? rawInstructions
        : typeof rawInstructions === "string"
            ? rawInstructions.split(/\n/).filter(Boolean)
            : [];

    let modal = document.getElementById("recipeModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "recipeModal";
        modal.className = "recipe-modal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="recipe-modal-content">

            <button
                type="button"
                class="close-modal"
                onclick="closeRecipeDetails()"
                aria-label="Close recipe"
            >
                &times;
            </button>

            <img
                class="recipe-modal-image"
                src="${escapeHTML(image)}"
                alt="${escapeHTML(name)}"
                onerror="handleImageError(this)"
            >

            <h2>${escapeHTML(name)}</h2>

            <p class="preparation-time">
                <strong>Preparation Time:</strong>
                ${escapeHTML(prepTime)}
            </p>

            <h3>Ingredients</h3>

            ${
                ingredients.length
                    ? `<ul>${ingredients.map(item =>
                        `<li>${escapeHTML(item)}</li>`
                    ).join("")}</ul>`
                    : "<p>Ingredients are not available.</p>"
            }

            <h3>Instructions</h3>

            ${
                instructions.length
                    ? `<ol>${instructions.map(step =>
                        `<li>${escapeHTML(step)}</li>`
                    ).join("")}</ol>`
                    : "<p>Instructions are not available.</p>"
            }

        </div>
    `;

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    modal.onclick = event => {
        if (event.target === modal) {
            closeRecipeDetails();
        }
    };
}

// ============================================
// CLOSE RECIPE DETAILS
// ============================================

function closeRecipeDetails() {
    const modal = document.getElementById("recipeModal");

    if (modal) {
        modal.style.display = "none";
    }

    document.body.style.overflow = "";
}

// ============================================
// CONNECT ALL BUTTONS AND INPUTS
// ============================================

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            searchText = searchInput.value.trim();
            displayRecipes();
        });
    }

    const dietFilter = document.getElementById("dietFilter");

    if (dietFilter) {
        dietFilter.addEventListener("change", () => {
            filterByDiet(dietFilter.value);
        });
    }

    displayCategoryButtons();
    loadRecipes();

    // Escape key closes the recipe details modal.
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeRecipeDetails();
        }
    });
});

// ============================================
// END OF BITEFOOD SCRIPT.JS
// ============================================