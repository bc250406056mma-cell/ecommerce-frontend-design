/* Classic E-Commerce UI logic (theme, profile menu, cart, product finder) */

const STORAGE_KEY = "theme-preference";
const SUPPORTED_THEMES = new Set(["system", "light", "dark", "sepia", "ocean"]);
const CART_STORAGE_KEY = "cart-items";
const PENDING_ORDER_KEY = "pending-order";
const LAST_RECEIPT_KEY = "last-receipt";

function safeParseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_THEMES.has(stored) ? stored : "system";
}

function resolveTheme(theme) {
    return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme) {
    const activeTheme = resolveTheme(theme);
    document.documentElement.setAttribute("data-theme", activeTheme);
}

function syncSelect(theme) {
    const select = document.getElementById("theme-select");
    if (select instanceof HTMLSelectElement) {
        select.value = theme;
    }
}

function setupThemeSelector() {
    const select = document.getElementById("theme-select");
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    select.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }

        const selectedTheme = target.value;
        if (!SUPPORTED_THEMES.has(selectedTheme)) {
            return;
        }

        localStorage.setItem(STORAGE_KEY, selectedTheme);
        applyTheme(selectedTheme);
    });
}

function handleSystemThemeChanges() {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
        const currentPreference = getStoredTheme();
        if (currentPreference === "system") {
            applyTheme("system");
        }
    };

    if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", onChange);
        return;
    }

    // Older Safari
    if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(onChange);
    }
}

function setupProfileMenu() {
    const accountLink = document.querySelector('.icon-link[aria-label="Account"]');
    if (!(accountLink instanceof HTMLAnchorElement)) {
        return;
    }

    const themeSwitcher = document.querySelector(".theme-switcher");

    const wrapper = document.createElement("div");
    wrapper.className = "profile-menu";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "profile-trigger";
    trigger.setAttribute("aria-label", "Account menu");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = accountLink.innerHTML;

    const menu = document.createElement("div");
    menu.className = "profile-dropdown";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    menu.innerHTML = `
        <div class="profile-settings" role="none">
            <div class="profile-settings-title">Settings</div>
            <div class="profile-divider" role="separator" aria-hidden="true"></div>
            <div data-profile-slot="theme" role="none"></div>
        </div>
    `;

    wrapper.append(trigger, menu);
    accountLink.replaceWith(wrapper);

    // Move the existing theme selector into the dropdown.
    if (themeSwitcher instanceof HTMLElement) {
        const slot = menu.querySelector('[data-profile-slot="theme"]');
        if (slot instanceof HTMLElement) {
            slot.replaceChildren(themeSwitcher);
        }
    }

    function setOpen(isOpen) {
        menu.hidden = !isOpen;
        trigger.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
            const firstItem = menu.querySelector(".profile-item");
            if (firstItem instanceof HTMLElement) {
                firstItem.focus({ preventScroll: true });
            }
        }
    }

    trigger.addEventListener("click", () => setOpen(menu.hidden));

    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (!wrapper.contains(target)) {
            setOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            setOpen(false);
            trigger.focus({ preventScroll: true });
        }
    });
}

function getStoredCart() {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = safeParseJson(raw || "[]", []);
    return Array.isArray(parsed) ? parsed : [];
}

function saveCart(items) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

function formatPrice(value) {
    return `$${value.toFixed(2)}`;
}

function getScriptPrefix() {
    const scriptTag = document.querySelector('script[src$="js/script.js"]');
    const scriptSrc = scriptTag?.getAttribute("src") || "js/script.js";
    return scriptSrc.replace(/js\/script\.js$/i, "");
}

function setupCart() {
    const panel = document.getElementById("cart-panel");
    const overlay = document.getElementById("cart-overlay");
    const itemsNode = document.getElementById("cart-items");
    const totalNode = document.getElementById("cart-total");
    const countNode = document.querySelector(".cart-count");
    const toggleButton = document.querySelector(".cart-toggle");
    const closeButton = document.querySelector(".cart-close");
    const clearButton = document.getElementById("clear-cart");

    if (
        !(panel instanceof HTMLElement) ||
        !(overlay instanceof HTMLElement) ||
        !(itemsNode instanceof HTMLElement) ||
        !(totalNode instanceof HTMLElement) ||
        !(countNode instanceof HTMLElement) ||
        !(toggleButton instanceof HTMLElement) ||
        !(closeButton instanceof HTMLElement) ||
        !(clearButton instanceof HTMLElement)
    ) {
        return;
    }

    const footer = clearButton.closest(".cart-footer");
    let payButton = document.getElementById("pay-now");
    if (!(payButton instanceof HTMLButtonElement)) {
        payButton = document.createElement("button");
        payButton.type = "button";
        payButton.id = "pay-now";
        payButton.textContent = "Pay Now";
    }
    payButton.className = "product-action pay-btn";
    clearButton.classList.add("cart-clear-btn");

    if (footer instanceof HTMLElement && !footer.querySelector(".cart-footer-actions")) {
        const actions = document.createElement("div");
        actions.className = "cart-footer-actions";
        actions.append(payButton, clearButton);
        footer.append(actions);
    }

    // O(1) lookup/update by id
    const cartById = new Map();

    function hydrateCart() {
        cartById.clear();
        for (const item of getStoredCart()) {
            if (!item || typeof item !== "object" || !item.id) {
                continue;
            }

            const quantity = Number(item.quantity) || 0;
            if (quantity <= 0) {
                continue;
            }

            cartById.set(String(item.id), {
                id: String(item.id),
                name: String(item.name || ""),
                price: Number(item.price) || 0,
                image: String(item.image || ""),
                quantity
            });
        }
    }

    function persistCart() {
        saveCart(Array.from(cartById.values()));
    }

    function setOpenState(isOpen) {
        panel.classList.toggle("open", isOpen);
        overlay.classList.toggle("show", isOpen);
        panel.setAttribute("aria-hidden", String(!isOpen));
        toggleButton.setAttribute("aria-expanded", String(isOpen));
    }

    function renderCart() {
        if (cartById.size === 0) {
            itemsNode.innerHTML = `<li class="cart-empty">Your cart is empty. Add something you love.</li>`;
        } else {
            const fragment = document.createDocumentFragment();

            for (const item of cartById.values()) {
                const row = document.createElement("li");
                row.className = "cart-item";

                const image = document.createElement("img");
                image.src = item.image;
                image.alt = item.name;
                row.append(image);

                const content = document.createElement("div");

                const name = document.createElement("p");
                name.className = "cart-item-name";
                name.textContent = item.name;

                const meta = document.createElement("p");
                meta.className = "cart-item-meta";
                meta.textContent = `${item.quantity} x ${formatPrice(item.price)}`;

                content.append(name, meta);
                row.append(content);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "cart-item-remove";
                remove.setAttribute("data-remove-id", item.id);
                remove.textContent = "Delete";
                row.append(remove);

                fragment.append(row);
            }

            itemsNode.replaceChildren(fragment);
        }

        let total = 0;
        let totalQuantity = 0;
        for (const item of cartById.values()) {
            total += item.price * item.quantity;
            totalQuantity += item.quantity;
        }

        totalNode.textContent = formatPrice(total);
        countNode.textContent = String(totalQuantity);
    }

    function addItem(product) {
        const id = String(product.id || "");
        if (!id) {
            return;
        }

        const existing = cartById.get(id);
        if (existing) {
            existing.quantity += 1;
        } else {
            cartById.set(id, {
                id,
                name: String(product.name || ""),
                price: Number(product.price) || 0,
                image: String(product.image || ""),
                quantity: 1
            });
        }

        persistCart();
        renderCart();
    }

    function removeItem(id) {
        cartById.delete(String(id));
        persistCart();
        renderCart();
    }

    // Event delegation: scalable
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const addButton = target.closest("[data-add-to-cart]");
        if (!(addButton instanceof HTMLElement)) {
            return;
        }

        addItem({
            id: addButton.dataset.productId,
            name: addButton.dataset.productName,
            price: Number(addButton.dataset.productPrice),
            image: addButton.dataset.productImage
        });

        setOpenState(true);
    });

    itemsNode.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const button = target.closest("[data-remove-id]");
        if (!(button instanceof Element)) {
            return;
        }

        const id = button.getAttribute("data-remove-id");
        if (id) {
            removeItem(id);
        }
    });

    clearButton.addEventListener("click", () => {
        cartById.clear();
        persistCart();
        renderCart();
    });

    payButton.addEventListener("click", () => {
        if (cartById.size === 0) {
            window.alert("Your cart is empty. Add products before payment.");
            return;
        }

        const items = Array.from(cartById.values());
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        localStorage.setItem(
            PENDING_ORDER_KEY,
            JSON.stringify({
                orderId: `ORD-${Date.now().toString().slice(-8)}`,
                items,
                subtotal,
                createdAt: new Date().toISOString()
            })
        );
        const prefix = getScriptPrefix();
        window.location.href = `${prefix}payments/payment_methods.html`;
    });

    toggleButton.addEventListener("click", () => {
        const isOpen = panel.classList.contains("open");
        setOpenState(!isOpen);
    });

    closeButton.addEventListener("click", () => setOpenState(false));
    overlay.addEventListener("click", () => setOpenState(false));

    hydrateCart();
    renderCart();
}

function guessCategoryFromIdOrTitle(idRaw, titleRaw) {
    const id = normalizeText(idRaw);
    const title = normalizeText(titleRaw);
    const hay = `${id} ${title}`;

    if (/(sneaker|shoe|boot|loafer)/.test(hay)) return "Shoes";
    if (/(shirt|tee|t-?shirt|top)/.test(hay)) return "Tops";
    if (/(bag|backpack|tote|purse)/.test(hay)) return "Bags";
    if (/(blazer|jacket|coat|outerwear)/.test(hay)) return "Outerwear";
    if (/(pant|trouser|jean|denim)/.test(hay)) return "Bottoms";
    if (/(dress|skirt)/.test(hay)) return "Dresses";
    return "Other";
}

function setupHeaderSearchUI() {
    const container = document.querySelector(".search-container");
    const input = container?.querySelector("input");
    if (!(container instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
        return;
    }

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "search-clear";
    clearButton.setAttribute("aria-label", "Clear search");
    clearButton.textContent = "Clear";
    container.append(clearButton);

    function syncSearchState() {
        container.classList.toggle("has-value", input.value.trim().length > 0);
    }

    input.addEventListener("focus", () => container.classList.add("is-active"));
    input.addEventListener("blur", () => container.classList.remove("is-active"));
    input.addEventListener("input", syncSearchState);
    clearButton.addEventListener("click", () => {
        input.value = "";
        syncSearchState();
        input.focus();
    });

    syncSearchState();
}

function setupProductDetails() {
    const detailsRoot = document.querySelector("[data-product-details]");
    if (!(detailsRoot instanceof HTMLElement)) {
        return;
    }

    const sizeSelect = detailsRoot.querySelector("#product-size");
    const errorMessage = detailsRoot.querySelector(".size-error");
    const addButton = detailsRoot.querySelector("[data-add-to-cart]");

    if (
        !(sizeSelect instanceof HTMLSelectElement) ||
        !(errorMessage instanceof HTMLElement) ||
        !(addButton instanceof HTMLElement)
    ) {
        return;
    }

    function clearError() {
        errorMessage.hidden = true;
    }

    sizeSelect.addEventListener("change", () => {
        if (sizeSelect.value) {
            clearError();
        }
    });

    addButton.addEventListener("click", (event) => {
        if (!sizeSelect.value) {
            event.stopPropagation();
            errorMessage.hidden = false;
            sizeSelect.focus();
            return;
        }

        clearError();
    });
}

function setupLogo() {
    const logoNodes = document.querySelectorAll(".logo");
    if (logoNodes.length === 0) {
        return;
    }

    // Use the same base path as js/script.js so this works in subfolders (../js/script.js).
    const prefix = getScriptPrefix();

    const logoPath = `${prefix}assets/svg%20icons/shopping_bag_speed_88dp_1F1F1F_FILL0_wght400_GRAD0_opsz48.svg`;
    const logoMark = `<img class="logo-mark" src="${logoPath}" alt="" decoding="async">`;

    for (const node of logoNodes) {
        const currentText = (node.textContent || "").trim() || "E-Commerce Store";
        node.innerHTML = `${logoMark}<span class="logo-text">${currentText}</span>`;
    }
}

function setupCartIcon() {
    const cartButtons = document.querySelectorAll(".cart-toggle");
    if (cartButtons.length === 0) {
        return;
    }

    const prefix = getScriptPrefix();
    const iconPath = `${prefix}assets/svg%20icons/shopping_bag_speed_88dp_1F1F1F_FILL0_wght400_GRAD0_opsz48.svg`;

    for (const button of cartButtons) {
        const existing = button.querySelector(".material-symbols-rounded, .material-symbols-outlined");
        if (existing) {
            existing.remove();
        }

        // Avoid duplicating if already injected
        if (button.querySelector("img.cart-logo")) {
            continue;
        }

        const img = document.createElement("img");
        img.className = "cart-logo";
        img.src = iconPath;
        img.alt = "";
        img.decoding = "async";
        img.loading = "eager";

        button.insertBefore(img, button.firstChild);
    }
}

function setupPaymentMethodsPage() {
    const form = document.getElementById("payment-method-form");
    if (!(form instanceof HTMLFormElement)) {
        return;
    }

    const orderRaw = localStorage.getItem(PENDING_ORDER_KEY);
    const order = safeParseJson(orderRaw || "null", null);
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
        const prefix = getScriptPrefix();
        window.location.href = `${prefix}products/shop-all.html`;
        return;
    }

    const totalNode = document.getElementById("payment-total");
    if (totalNode instanceof HTMLElement) {
        totalNode.textContent = formatPrice(Number(order.subtotal) || 0);
    }

    const errorNode = document.getElementById("payment-form-error");
    const methodSelect = form.querySelector('select[name="payment-method"]');
    const methodCards = Array.from(document.querySelectorAll("[data-method-value]"));

    for (const card of methodCards) {
        card.addEventListener("click", () => {
            const value = card.getAttribute("data-method-value") || "";
            if (methodSelect instanceof HTMLSelectElement) {
                methodSelect.value = value;
            }
            for (const other of methodCards) {
                other.classList.remove("is-selected");
            }
            card.classList.add("is-selected");
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const data = new FormData(form);
        const selectedMethod = String(data.get("payment-method") || "").trim();
        const cardRequired = /(card|visa|mastercard|amex|stripe)/i.test(selectedMethod);
        const fields = cardRequired
            ? ["payment-method", "cardholder", "cardnumber", "expiry", "cvv"]
            : ["payment-method", "cardholder", "payment-handle"];
        const hasMissing = fields.some((field) => !String(data.get(field) || "").trim());
        if (hasMissing) {
            if (errorNode instanceof HTMLElement) errorNode.hidden = false;
            return;
        }
        if (errorNode instanceof HTMLElement) errorNode.hidden = true;

        const paymentMethod = selectedMethod;
        const receipt = {
            receiptNumber: `RCP-${Date.now().toString().slice(-8)}`,
            orderId: String(order.orderId || ""),
            issuedAt: new Date().toISOString(),
            paymentMethod,
            cardholder: String(data.get("cardholder") || ""),
            items: order.items,
            subtotal: Number(order.subtotal) || 0
        };
        localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(receipt));
        localStorage.removeItem(PENDING_ORDER_KEY);
        localStorage.removeItem(CART_STORAGE_KEY);

        const prefix = getScriptPrefix();
        window.location.href = `${prefix}recepits/recipt.html`;
    });
}

function setupReceiptPage() {
    const root = document.querySelector("[data-receipt-page]");
    if (!(root instanceof HTMLElement)) {
        return;
    }

    const receiptRaw = localStorage.getItem(LAST_RECEIPT_KEY);
    const receipt = safeParseJson(receiptRaw || "null", null);
    if (!receipt || !Array.isArray(receipt.items) || receipt.items.length === 0) {
        const prefix = getScriptPrefix();
        window.location.href = `${prefix}products/shop-all.html`;
        return;
    }

    const itemsNode = document.getElementById("receipt-items");
    const receiptNumberNode = document.getElementById("receipt-number");
    const orderIdNode = document.getElementById("receipt-order-id");
    const issuedAtNode = document.getElementById("receipt-issued-at");
    const methodNode = document.getElementById("receipt-payment-method");
    const totalNode = document.getElementById("receipt-total");

    if (receiptNumberNode) receiptNumberNode.textContent = String(receipt.receiptNumber || "-");
    if (orderIdNode) orderIdNode.textContent = String(receipt.orderId || "-");
    if (issuedAtNode) issuedAtNode.textContent = new Date(receipt.issuedAt).toLocaleString();
    if (methodNode) methodNode.textContent = String(receipt.paymentMethod || "-");
    if (totalNode) totalNode.textContent = formatPrice(Number(receipt.subtotal) || 0);

    if (itemsNode instanceof HTMLElement) {
        const rows = receipt.items
            .map((item) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const lineTotal = qty * price;
                return `
                    <tr>
                        <td>${String(item.name || "")}</td>
                        <td>${qty}</td>
                        <td>${formatPrice(price)}</td>
                        <td>${formatPrice(lineTotal)}</td>
                    </tr>
                `;
            })
            .join("");
        itemsNode.innerHTML = rows;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const preferredTheme = getStoredTheme();
    applyTheme(preferredTheme);
    syncSelect(preferredTheme);
    setupThemeSelector();
    handleSystemThemeChanges();
    setupLogo();
    setupCartIcon();
    setupProfileMenu();
    setupCart();
    setupHeaderSearchUI();
    setupProductDetails();
    setupPaymentMethodsPage();
    setupReceiptPage();
});
