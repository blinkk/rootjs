---
description: Implement a new CMS module from a design screenshot and add it to a page.
---

# Workflow: Implement Design

This workflow guides the Root Agent to create a new CMS module from a visual design and integrate it into a page.

## 1. Analyze Design

- [ ] Examine the provided screenshot.
- [ ] Identify the component name (e.g., `TemplateFeatureCards`).
- [ ] Determine necessary fields (title, body, image, list items, etc.).
- [ ] Identify reusable UI components (Buttons, Text, etc.).

## 2. Create Module Files

- [ ] Create directory: `docs/blocks/<Name>/` or `docs/templates/<Name>/`.
- [ ] Create `<Name>.schema.ts`: Define fields using `@blinkk/root-cms`.
- [ ] Create `<Name>.module.scss`: Implement styles using CSS modules.
- [ ] Create `<Name>.tsx`: Implement React component using `useTranslations`, `RichText`, and `node`.

## 3. Verify Schema

- [ ] Run `npm run build:core` (or wait for watcher) to generate types in `root-cms.d.ts`.
- [ ] Ensure the new block is available in the project schema.

## 4. Add to Page (Optional)

If the user requested adding it to a page:

- [ ] **Get Schema**: `collections_get_schema(collectionId='<Collection>')`.
- [ ] **Fetch Page**: `docs_get(collectionId='<Collection>', slug='<Slug>')`.
- [ ] **Construct Data**: Create a JSON object for the new block.
  - Remember `_type: '<Name>'`.
  - Remember richtext format: `{"blocks": [...]}`.
- [ ] **Update Page**: Append the new block to the `modules` array (or target field).
- [ ] **Save**: `docs_save(collectionId='<Collection>', slug='<Slug>', data=...)`.

## 5. Final Review

- [ ] Check if the module renders correctly in the CMS preview (if possible) or ask user to verify.
