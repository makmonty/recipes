# The Recipe Book

A static recipe website built with Astro 7.4.7 and the official
[`@cooklang/cooklang`](https://cooklang.org) parser. Recipe files are read at
build time; the deployed website needs no Node server, database or API.

## Getting started

Use Node.js **22.23.4 or newer** (Node 24 LTS recommended).

```sh
# If you use nvm:
nvm install
nvm use

npm ci
npm run build
```

`npm run build` type-checks the project, recursively discovers every `.cook`
file in the project's `recipes` directory and generates the complete website
in `dist`. Run it again after adding, changing or deleting a recipe.
The three included recipes are examples; replace them with your own.

```text
recipes/
  lemon-pasta.cook
  lemon-pasta.jpg            Optional photo, shown on the index and the recipe page
  breakfast/
    banana-pancakes.cook
src/                         Astro pages, styles and build-time parser
dist/                        Generated HTML, CSS and browser JavaScript
```

A recipe can have a photo: place a `.jpg` file with the same name next to the
`.cook` file (for example, `Falafel.jpg` next to `Falafel.cook`). The photo
replaces the placeholder illustration on the index card and is shown on the
recipe page. Recipes without a photo keep the placeholder.

The index lists all recipes and supports client-side search by name,
description, tag or ingredient. Each recipe has its own page with ingredients,
cookware, sections, numbered instructions and inline timer durations.
Ingredient checkboxes and a print-friendly layout help while cooking.
Recipe content and navigation work without JavaScript; JavaScript only adds
search/filter controls and the print button.

## Writing recipes

Use [Cooklang syntax](https://cooklang.org/docs/spec/). YAML frontmatter is the
current metadata syntax; the parser also accepts legacy `>> key: value`
metadata and reports its deprecation warnings during the build.

```cook
---
title: Tomato pasta
description: A quick weeknight dinner.
tags: [dinner, vegetarian]
servings: 2
time: 20 minutes
---

= Cook the pasta

Boil @pasta{200%g} in a #pot{} for ~{10%minutes}.

= Make the sauce

Warm @olive oil{1%tbsp} in a #pan{}. Add @tomatoes{300%g}(chopped).

Toss the pasta with the sauce and serve.
```

Metadata is optional. Without a title, the filename is used. The filename,
not the title, determines the URL: `recipes/breakfast/banana-pancakes.cook`
becomes `/recipes/breakfast/banana-pancakes/`. Names are lowercased, accents
are normalized and spaces become hyphens. Duplicate URLs, unreadable files,
empty recipes and parser errors fail the build with an error; parser warnings
are printed with the filename. Non-`.cook` files and symlinks are ignored.
Recipe content is rendered as escaped text, not injected HTML.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server with Astro hot reload |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm test` | Parser and file-discovery tests |
| `npm run build` | Validate and generate the static site in `dist` |
| `npm run preview` | Serve the generated site locally |

After editing recipes during development, refresh the page to read the latest
files. Production output only changes when you rebuild.

The build, development and test scripts enable Node's WebAssembly module
support for the official Rust-powered Cooklang parser. Node may emit an
experimental-feature warning. The parser is **not** sent to the browser.
Astro's own strict TypeScript configuration is used instead of standalone
`tsc` compilation, since Astro handles both TypeScript and `.astro` templates.

## Deployment

Upload the **contents** of `dist` to any static web host, such as GitHub Pages,
Netlify, Cloudflare Pages or an ordinary web server. Configure the build command
as `npm run build` and the publish directory as `dist`. The host should serve
directory index files (for example, `/recipes/lemon-pasta/index.html` at
`/recipes/lemon-pasta/`). Preview over HTTP instead of opening files directly.

If hosting under a subdirectory, set `BASE_PATH` while building:

```sh
BASE_PATH=/my-recipe-book/ npm run build
BASE_PATH=/my-recipe-book/ npm run preview
```

In PowerShell, use `$env:BASE_PATH = '/my-recipe-book/'` before the commands.
The default base path is `/`. All internal links and generated asset URLs
respect this setting. No external fonts, images or runtime services are needed.
