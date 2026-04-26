# E-Commerce Frontend (Desktop Only)

This project is a **desktop-only** HTML/CSS/JS implementation of an eCommerce UI.

## Folder structure

- `index.html`: Landing page
- `css/`: Global styles (`index.css`)
- `js/`: Global scripts (`script.js`)
- `assets/`: Images, fonts, icons
- `products/`, `pages/`, `main/`, `header/`, `footer/`, `forms/`: Additional HTML pages

## Run

Open `index.html` in a browser.

## Notes (performance + maintainability)

- Images use `loading="lazy"` + `decoding="async"` where applicable.
- The header/footer styling is centralized in `css/index.css`.
- UI behavior (theme, profile menu, cart, search filter) lives in `js/script.js`.

