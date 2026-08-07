export type Mode = "light" | "dark";

export const STORAGE_KEY = "camam-mode";

/**
 * Stamps data-mode on <html> BEFORE first paint.
 *
 * It has to be an inline script in <head> rather than an effect: React runs after the first
 * paint, so deciding the mode there would show the default for a frame and then swap - the
 * flash every themed site is judged by. Same approach as proxyma-landing's MODE_INIT_SCRIPT.
 *
 * A stored choice wins; otherwise the operating system's preference; dark if neither is
 * readable, which matches the :root defaults in globals.css.
 */
export const MODE_INIT_SCRIPT = `
(function(){
  try {
    var saved = window.localStorage.getItem('${STORAGE_KEY}');
    var mode = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-mode', mode);
  } catch (e) {
    document.documentElement.setAttribute('data-mode', 'dark');
  }
})();
`;
