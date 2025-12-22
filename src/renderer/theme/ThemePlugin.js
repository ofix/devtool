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

    if (options?.router) {
      const router = options.router;
      // 路由切换完成后更新主题
      router.afterEach((to, from) => {
        console.log(`路由从 ${from.path} 切换到 ${to.path}，自动更新主题`);
        if (to.path.includes('/postwoman')) {
          themeManager.setTheme('light');
        } else if (to.path.includes('/debug-tool')) {
          themeManager.setTheme('dark');
        }
        themeManager.applyTheme(); // 应用切换后的主题
      });
    }

  }
};