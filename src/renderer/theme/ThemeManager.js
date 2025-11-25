import { ref } from 'vue';

class ThemeManager {
  constructor() {
    if (ThemeManager.instance) {
      return ThemeManager.instance;
    }
    ThemeManager.instance = this;

    this.theme = ref('dark');
    this.initTheme();

    return this;
  }

  initTheme() {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme && ['light', 'dark'].includes(savedTheme)) {
      this.theme.value = savedTheme;
    }
    this.applyTheme();
  }

  applyTheme() {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(this.theme.value);
  }

  toggleTheme() {
    const newTheme = this.theme.value === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  setTheme(theme) {
    this.theme.value = theme;
    this.applyTheme();
    localStorage.setItem('app-theme', theme);
  }
}

// 创建单例实例
export const themeManager = new ThemeManager();

// 提供 Composition API 使用方式
export const useTheme = () => {
  return {
    theme: themeManager.theme,
    toggleTheme: () => themeManager.toggleTheme(),
    setTheme: (theme) => themeManager.setTheme(theme)
  };
};