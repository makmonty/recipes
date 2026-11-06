import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  Parser,
  CooklangRecipe,
  ingredient_display_name,
  ingredient_should_be_listed,
  ingredient_is_optional,
  cookware_display_name,
  cookware_should_be_listed,
  cookware_is_optional,
  grouped_quantity_display,
  grouped_quantity_is_empty,
  quantity_display,
  type Item,
} from '@cooklang/cooklang';

export interface Component {
  name: string;
  quantity: string;
  note: string | null;
  optional: boolean;
}

export interface Token {
  kind: Item['type'];
  text: string;
}

export interface Recipe {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  time: string;
  servings: string;
  /** Sibling photo (e.g. Falafel.jpg next to Falafel.cook), relative to the recipes directory. */
  image: string | null;
  ingredients: Component[];
  cookware: Component[];
  sections: {
    name: string | null;
    content: (
      | { kind: 'text'; text: string }
      | { kind: 'step'; number: number; tokens: Token[] }
    )[];
  }[];
}

// Astro relocates server modules during the build; npm runs scripts at the project root.
const recipesDirectory = resolve('recipes');

export function recipeSlug(filename: string): string {
  return filename.replace(/\.cook$/i, '').split(/[\\/]/).map((part) => {
    const slug = part.normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    if (!slug) throw new Error(`Cannot create a URL for recipe "${filename}".`);
    return slug;
  }).join('/');
}

function metadataText(recipe: CooklangRecipe, key: string): string {
  const value: unknown = recipe.rawMetadata.get(key);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function inlineToken(item: Item, recipe: CooklangRecipe): Token {
  switch (item.type) {
    case 'text':
      return { kind: item.type, text: item.value };
    case 'ingredient': {
      const ingredient = recipe.ingredients[item.index];
      const quantity = ingredient.quantity ? ` (${quantity_display(ingredient.quantity)})` : '';
      const note = ingredient.note ? ` (${ingredient.note})` : '';
      return { kind: item.type, text: ingredient_display_name(ingredient) + quantity + note };
    }
    case 'cookware':
      return { kind: item.type, text: cookware_display_name(recipe.cookware[item.index]) };
    case 'timer': {
      const timer = recipe.timers[item.index];
      return {
        kind: item.type,
        text: [timer.name, timer.quantity ? quantity_display(timer.quantity) : null]
          .filter(Boolean).join(': '),
      };
    }
    case 'inlineQuantity':
      return { kind: item.type, text: quantity_display(recipe.inlineQuantities[item.index]) };
  }
}

export function parseRecipe(source: string, filename: string): Recipe {
  const parser = new Parser();
  try {
    const raw = parser.parse(source);
    if (raw.report) {
      // The WASM API returns HTML diagnostics and may recover from parse errors.
      const report = raw.report.replace(/<[^>]*>/g, '')
        .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
        .replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
      if (/^Error:/m.test(report)) throw new Error(report);
      console.warn(`[Cooklang: ${filename}]\n${report}`);
    }
    const parsed = new CooklangRecipe(
      raw, parser.group_ingredients(raw), parser.group_cookware(raw),
    );
    if (!parsed.sections.some((section) => section.content.length > 0)) {
      throw new Error('Recipe has no instructions.');
    }
    const slug = recipeSlug(filename);
    return {
      slug,
      title: parsed.title || metadataText(parsed, 'name')
        || filename.split(/[\\/]/).at(-1)!.replace(/\.cook$/i, '').replace(/[-_]/g, ' '),
      description: parsed.description || '',
      tags: [...parsed.tags].sort(),
      time: metadataText(parsed, 'time'),
      servings: metadataText(parsed, 'servings'),
      image: null,
      ingredients: parsed.groupedIngredients
        .filter(([ingredient]) => ingredient_should_be_listed(ingredient))
        .map(([ingredient, quantity]) => ({
          name: ingredient_display_name(ingredient),
          quantity: grouped_quantity_is_empty(quantity) ? '' : grouped_quantity_display(quantity),
          note: ingredient.note,
          optional: ingredient_is_optional(ingredient),
        })),
      cookware: parsed.groupedCookware
        .filter(([cookware]) => cookware_should_be_listed(cookware))
        .map(([cookware, quantity]) => ({
          name: cookware_display_name(cookware),
          quantity: grouped_quantity_is_empty(quantity) ? '' : grouped_quantity_display(quantity),
          note: cookware.note,
          optional: cookware_is_optional(cookware),
        })),
      sections: parsed.sections.map((section) => ({
        name: section.name,
        content: section.content.map((content) => content.type === 'text'
          ? { kind: 'text', text: content.value }
          : {
              kind: 'step',
              number: content.value.number,
              tokens: content.value.items.map((item) => inlineToken(item, parsed)),
            }),
      })),
    };
  } catch (cause) {
    throw new Error(`Could not parse recipe "${filename}": ${String(cause)}`, { cause });
  } finally {
    parser.free();
  }
}

async function discoverFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverFiles(path);
    return entry.isFile() && /\.(cook|jpe?g)$/i.test(entry.name) ? [path] : [];
  }));
  return files.flat().sort();
}

export async function loadRecipes(directory = recipesDirectory): Promise<Recipe[]> {
  const files = await discoverFiles(directory);
  // Match photos to recipes by filename, so Falafel.cook picks up Falafel.jpg.
  const images = new Map<string, string>();
  for (const file of files) {
    if (/\.jpe?g$/i.test(file)) {
      images.set(file.replace(/\.[^.]+$/, '').toLowerCase(), relative(directory, file).split(sep).join('/'));
    }
  }
  const recipes = await Promise.all(files
    .filter((file) => /\.cook$/i.test(file))
    .map(async (file) => {
      const recipe = parseRecipe(
        await readFile(file, 'utf8'),
        relative(directory, file).split(sep).join('/'),
      );
      recipe.image = images.get(file.replace(/\.[^.]+$/, '').toLowerCase()) ?? null;
      return recipe;
    }));
  const slugs = new Set<string>();
  for (const recipe of recipes) {
    if (slugs.has(recipe.slug)) {
      throw new Error(`Duplicate recipe URL "${recipe.slug}". Rename the conflicting .cook files.`);
    }
    slugs.add(recipe.slug);
  }
  return recipes.sort((a, b) => a.title.localeCompare(b.title, 'en'));
}
