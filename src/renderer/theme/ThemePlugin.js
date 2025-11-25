import { themeManager } from '../theme/ThemeManager';

export default {
  install(app, options) {
    app.config.globalProperties.$theme = themeManager;
    app.provide('theme', themeManager);
    app.mixin({
      mounted() {
        themeManager.applyTheme();
      }
    });
  }
};