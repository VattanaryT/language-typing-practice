// Runs before first paint: apply a saved light/dark choice. With no saved
// choice, CSS follows the OS setting via prefers-color-scheme.
try {
  var saved = localStorage.getItem("tt_theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
} catch (e) {}
