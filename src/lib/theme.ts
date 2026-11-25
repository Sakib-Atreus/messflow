// Theme choice ("light" | "dark" | "system") lives in localStorage on each device.
// This script is inlined in <head>: it applies the class before first paint, follows the
// OS setting live when "system" is chosen, and prints in light mode so reports stay readable.
export const THEME_SCRIPT = `(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function choice() { try { return localStorage.getItem("theme") || "system"; } catch (e) { return "system"; } }
  function apply(t) {
    t = t || choice();
    root.dataset.theme = t;
    root.classList.toggle("dark", t === "dark" || (t === "system" && media.matches));
  }
  window.__setTheme = function (t) {
    try { localStorage.setItem("theme", t); } catch (e) {}
    apply(t);
  };
  media.addEventListener("change", function () { if (choice() === "system") apply(); });
  window.addEventListener("beforeprint", function () { root.classList.remove("dark"); });
  window.addEventListener("afterprint", function () { apply(); });
  apply();
})();`;

export type Theme = "light" | "dark" | "system";
