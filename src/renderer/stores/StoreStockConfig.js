import { reactive } from 'vue';

class ConfigStore {
  constructor() {
    this.state = reactive({
      theme: 'dark',
      dataProvider: 'eastmoney',
      kLineMode: 'sync',
      emaColors: {
        10: '#FF6B6B',
        20: '#4ECDC4',
        30: '#45B7D1',
        60: '#96CEB4',
        99: '#FFEAA7',
        255: '#DDA0DD',
        905: '#98D8C8'
      },
      shortcuts: {
        toggleWindow: 'Ctrl+Esc',
        search: 'F1',
        favorites: 'F2',
        settings: 'F3'
      }
    });

    this.loadFromStorage();
  }

  async loadFromStorage () {
    const theme = await window.electron?.getConfig('settings.theme');
    const dataProvider = await window.electron?.getConfig('settings.dataProvider');
    const kLineMode = await window.electron?.getConfig('settings.kLineMode');
    const emaColors = await window.electron?.getConfig('settings.emaColors');
    const shortcuts = await window.electron?.getConfig('shortcuts');

    if (theme) this.state.theme = theme;
    if (dataProvider) this.state.dataProvider = dataProvider;
    if (kLineMode) this.state.kLineMode = kLineMode;
    if (emaColors) this.state.emaColors = emaColors;
    if (shortcuts) this.state.shortcuts = shortcuts;
  }

  updateConfig (key, value) {
    this.state[key] = value;
  }

  get theme () {
    return this.state.theme;
  }

  get dataProvider () {
    return this.state.dataProvider;
  }

  get kLineMode () {
    return this.state.kLineMode;
  }

  get emaColors () {
    return this.state.emaColors;
  }

  get shortcuts () {
    return this.state.shortcuts;
  }
}

let instance = null;
export function useConfigStore () {
  if (!instance) {
    instance = new ConfigStore();
  }
  return instance;
}