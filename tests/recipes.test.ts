import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadRecipes, parseRecipe, recipeSlug } from '../src/lib/recipes.ts';

test('parses metadata, quantities, notes, cookware, timers and named sections', () => {
  const recipe = parseRecipe(`---
title: A simple supper
description: Dinner for two.
tags: [dinner, quick]
servings: 2
time: 15 minutes
---

= Cooking

Add @rice{200%g}(rinsed) to a #pot{} and cook for ~simmer{10%minutes}.
`, 'dinner/simple-supper.cook');
  assert.equal(recipe.slug, 'dinner/simple-supper');
  assert.equal(recipe.title, 'A simple supper');
  assert.equal(recipe.description, 'Dinner for two.');
  assert.deepEqual(recipe.tags, ['dinner', 'quick']);
  assert.equal(recipe.servings, '2');
  assert.equal(recipe.time, '15 minutes');
  assert.equal(recipe.image, null);
  assert.deepEqual(recipe.ingredients, [
    { name: 'rice', quantity: '200 g', note: 'rinsed', optional: false },
  ]);
  assert.equal(recipe.cookware[0].name, 'pot');
  assert.equal(recipe.sections[0].name, 'Cooking');
  const step = recipe.sections[0].content[0];
  assert.equal(step.kind, 'step');
  if (step.kind === 'step') {
    assert.equal(step.number, 1);
    assert.ok(step.tokens.some((token) => token.kind === 'timer' && token.text === 'simmer: 10 minutes'));
    assert.ok(step.tokens.some((token) => token.text === 'rice (200 g) (rinsed)'));
  }
});

test('keeps source text as text, not generated HTML', () => {
  const recipe = parseRecipe('Mix @flour{1%cup}. <script>alert("no")</script>', 'test.cook');
  const step = recipe.sections[0].content[0];
  assert.equal(step.kind, 'step');
  if (step.kind === 'step') {
    assert.ok(step.tokens.some((token) => token.text.includes('<script>')));
  }
});

test('supports fractions, ranges, optional ingredients and text notes', () => {
  const recipe = parseRecipe(`> A note for the cook.

Mix @flour{1/2%cup}, @water{1-2%tbsp} and @?salt{}.
`, 'test.cook');
  assert.equal(recipe.sections[0].content[0].kind, 'text');
  assert.match(recipe.ingredients[0].quantity, /1\/2|0\.5/);
  assert.match(recipe.ingredients[1].quantity, /1.*2.*tbsp/);
  assert.equal(recipe.ingredients[2].optional, true);
});

test('uses the filename when metadata is absent and generates stable nested URLs', () => {
  const recipe = parseRecipe('Mix @salt{}.', 'Breakfast/Crème pancakes.COOK');
  assert.equal(recipe.title, 'Crème pancakes');
  assert.equal(recipe.slug, 'breakfast/creme-pancakes');
  assert.equal(recipeSlug('dinner\\One_Pot.cook'), 'dinner/one-pot');
  assert.throws(() => recipeSlug('!!!.cook'), /Cannot create a URL/);
});

test('rejects empty and invalid recipes with the source filename', () => {
  assert.throws(() => parseRecipe('', 'empty.cook'), /empty\.cook.*no instructions/);
  assert.throws(() => parseRecipe('Wait ~{not-a-number%minutes}.', 'invalid.cook'), /invalid\.cook/);
});

test('discovers nested recipes, ignores other files, handles empty folders and rejects URL collisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recipe-book-test-'));
  try {
    assert.deepEqual(await loadRecipes(directory), []);
    await mkdir(join(directory, 'Breakfast'));
    await writeFile(join(directory, 'Breakfast', 'Pancakes.COOK'), 'Mix @flour{100%g}.');
    await writeFile(join(directory, 'Breakfast', 'Pancakes.jpg'), 'fake photo');
    await writeFile(join(directory, 'notes.txt'), 'Not a recipe.');
    const recipes = await loadRecipes(directory);
    assert.equal(recipes.length, 1);
    assert.equal(recipes[0].slug, 'breakfast/pancakes');
    assert.equal(recipes[0].image, 'Breakfast/Pancakes.jpg');
    await writeFile(join(directory, 'Breakfast', 'Pancak\u00e9s.cook'), 'Mix @flour{200%g}.');
    await assert.rejects(loadRecipes(directory), /Duplicate recipe URL/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('does not silently ignore a missing recipes directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recipe-book-test-'));
  try {
    await assert.rejects(loadRecipes(join(directory, 'missing')), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
