import Script from "next/script";
import { THEME_STORAGE_KEY } from "@meals/lib/theme";

/**
 * Runs before hydration to avoid a light/dark flash on the meals shell.
 */
export function ThemeScript() {
  const script = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var roots=document.querySelectorAll(".tools-meals");for(var i=0;i<roots.length;i++){roots[i].dataset.theme=t;roots[i].style.colorScheme=t;}}catch(e){}})();`;

  return (
    <Script
      id="mealplan-theme"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
