import { ref, reactive, computed } from 'vue';
import { defineStore } from 'pinia';

export const useStockConfigStore = defineStore('StockConfig', () => {
    // ============ State ============
    const theme = ref('dark');
    const dataProvider = ref('eastmoney');
    const klineMode = ref('sync');
    const emaColors = reactive({
        10: '#FF6B6B', 20: '#4ECDC4', 30: '#45B7D1',
        60: '#96CEB4', 99: '#FFEAA7', 255: '#DDA0DD', 905: '#98D8C8'
    });
    const shortcuts = reactive({
        toggleWindow: 'Ctrl+Esc', search: 'F1',
        favorites: 'F2', settings: 'F3'
    });

    // ============ Getters ============
    const isDarkTheme = computed(() => theme.value === 'dark');
    const getEMAColor = (period) => emaColors[period] || '#FFFFFF';
    const getShortcut = (action) => shortcuts[action] || '';

    // ============ Actions ============
    const save = async (key, value) => {
        try {
            await window.channel?.setConfig(`settings.${key}`, value);
        } catch (error) {
            console.error(`保存失败: ${key}`, error);
        }
    };

    const updateTheme = (newTheme) => {
        if (!['dark', 'light'].includes(newTheme)) return;
        theme.value = newTheme;
        save('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    const updateDataProvider = (provider) => {
        if (!['eastmoney', 'sina', 'tencent'].includes(provider)) return;
        dataProvider.value = provider;
        save('dataProvider', provider);
    };

    const updateKlineMode = (mode) => {
        if (!['sync', 'async', 'hybrid'].includes(mode)) return;
        klineMode.value = mode;
        save('klineMode', mode);
    };

    const updateEMAColor = (period, color) => {
        if (emaColors.hasOwnProperty(period)) {
            emaColors[period] = color;
            save('emaColors', emaColors);
        }
    };

    const updateShortcut = (action, key) => {
        if (shortcuts.hasOwnProperty(action)) {
            shortcuts[action] = key;
            save('shortcuts', shortcuts);
        }
    };

    const resetConfig = () => {
        theme.value = 'dark';
        dataProvider.value = 'eastmoney';
        klineMode.value = 'sync';
        Object.assign(emaColors, {
            10: '#FF6B6B', 20: '#4ECDC4', 30: '#45B7D1',
            60: '#96CEB4', 99: '#FFEAA7', 255: '#DDA0DD', 905: '#98D8C8'
        });
        Object.assign(shortcuts, {
            toggleWindow: 'Ctrl+Esc', search: 'F1',
            favorites: 'F2', settings: 'F3'
        });
        Promise.all([
            save('theme', theme.value),
            save('dataProvider', dataProvider.value),
            save('klineMode', klineMode.value),
            save('emaColors', emaColors),
            save('shortcuts', shortcuts)
        ]);
    };

    const loadConfig = async () => {
        const [t, dp, klm, ec, sc] = await Promise.all([
            window.channel?.getConfig('settings.theme'),
            window.channel?.getConfig('settings.dataProvider'),
            window.channel?.getConfig('settings.klineMode'),
            window.channel?.getConfig('settings.emaColors'),
            window.channel?.getConfig('shortcuts')
        ]);
        if (t) theme.value = t;
        if (dp) dataProvider.value = dp;
        if (klm) klineMode.value = klm;
        if (ec) Object.assign(emaColors, ec);
        if (sc) Object.assign(shortcuts, sc);
        document.documentElement.setAttribute('data-theme', theme.value);
    };

    return {
        // state
        theme, dataProvider, klineMode, emaColors, shortcuts,
        // getters
        isDarkTheme, getEMAColor, getShortcut,
        // actions
        updateTheme, updateDataProvider, updateKlineMode,
        updateEMAColor, updateShortcut, resetConfig, loadConfig
    };
});