## v1.5 (March 22, 2026)
- Compose Mode
-- Create and edit sprite sheets
-- Add snipped sprites by group, sub-group, selection, or tag filter
-- Import external images as sprites
-- Grid-based layout with snap, padding, and auto-arrange
-- Export composed sheet as PNG
- Edit Mode 
-- Edit snipped sprites pixel-by-pixel or create new sprites from scratch.
-- Pencil, eraser, fill, eyedropper, dither, lighten/darken tools
-- Shape tools: line, rectangle, circle (filled & outline)
-- Layer system with opacity, visibility, merge, flatten
-- Frame animation with FPS control and onion skinning
-- Mirror drawing (X & Y axis symmetry)
-- Selection: copy, cut, paste, flip, delete
-- Color palettes: PICO-8, DB32, NES presets + custom
-- Canvas transforms: flip, rotate, resize, invert, desaturate, brightness, outline
- An astronomical amount of bug fixes and UI updates!!!!

## v1.4 (March 21, 2026)
- Remove background tool 
-- Pick a color to make transparent or auto-detect background
-- Tolerance slider for fine-tuned control over color matching
-- Live preview before applying changes
- Grid tool
-- Auto-detects row bands and individual sprites from pixel content
-- Also supports manual columns/rows or cell-size grid modes
-- Visual grid overlay on canvas with adjustable opacity
- Fix overlapping sprites tool
-- Auto-detects connected pixel objects within each sprite using flood-fill
-- Shows contour outline around each sprite's primary object
-- Excludes neighbor's pixels on export while keeping box dimensions
- Auto-trim sprites tool
-- Trim boxes to sprite content bounds
- Restore previous session feature
-- Prevents you from losing your work due to accidental refresh, freezes, or session timeout
- Enhanced animation tool with canvas size controls and per-frame position nudging
- Other bug fixes and QOL tweaks

## v1.3 (March 14, 2026)
- Added version info & change log (duh!)
- Multi-tab projects — work on multiple sprite sheets with tabs
- Animation tool — create and preview animations from subcategories
-- Base layer support — add sprites behind or on top of animation frames
- Custom padding option for repeat tool with live preview
- Other bug fixes and UI tweaks

## v1.2 (March 10, 2026)
- Tag system — tag sprites by category via click or lasso
-- Multi-tag mode — apply tags from multiple categories at once
-- Tag visibility — per-category highlight toggle shows tagged/untagged sprites on canvas
-- Tag filtering — filter sprite list by tags in the side panel
- Auto-color tagging — analyze sprite colors with basic, light/dark, or fine detail levels
- Advanced rename — variable-based naming and live preview
- Move tool click-select — click sprites to select, shift-click to add, click empty to deselect
- View toggles — show/hide sprite boxes, category boxes, and subcategory boxes independently
- Other bug fixes and UI tweaks

## v1.1 (March 7, 2026)
- Background color picker
- Zoom controls
- Side panel, coordinate display, & status bar
- Group & subgroup system
- Auto-detect sprites
- Repeat pattern tool
- Sprite thumbnails in the sprite list
- JSON import/export 
- Undo/redo system
- Keyboard shortcuts
- Pinch-to-zoom
- Drag-and-drop file loading

## v1.0 (February 24, 2026)
- A humble beginning. Just view sprite sheets & draw sprites.
