/** Runs before first paint: follows the browser's light / dark setting, including changes while
 * the page is open. The tokens switch on data-theme (styles/tokens.css). */
export const THEME_BOOT_SCRIPT = `try{var m=matchMedia("(prefers-color-scheme: dark)"),a=function(){document.documentElement.setAttribute("data-theme",m.matches?"dark":"light")};a();m.addEventListener("change",a)}catch(e){}`;
