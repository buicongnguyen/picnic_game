import { installMobileGameSupport } from './mobile-game-support.mjs';
installMobileGameSupport({
  "menus": [
    "#title-screen .title-row",
    "#settings-dialog"
  ],
  "controls": [
    ".hud-bottom"
  ],
  "classifyCanvasTaps": false
});
