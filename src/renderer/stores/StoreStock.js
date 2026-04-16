import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useStockStore = defineStore('stock', () => {
    // ============ State ============
    const watchlist = ref([]);           // 观察列表（所有加入观察的股票）
    const displayStocks = ref([]);       // 当前显示的股票列表（当前页，最多4只）
    const favorites = ref([]);           // 自选股列表
    const currentStock = ref(null);      // 当前选中的股票
    const stockDataCache = ref(new Map()); // 股票数据缓存
    
    // 分页相关
    const currentPage = ref(0);           // 当前页码（0-based）
    const pageSize = 4;                   // 每页显示数量

    // ============ Getters ============
    const canAddMore = computed(() => watchlist.value.length < 100); // 最多100只观察股
    const hasDisplayStocks = computed(() => displayStocks.value.length > 0);
    const displayCount = computed(() => displayStocks.value.length);
    const favoriteCount = computed(() => favorites.value.length);
    const favoriteCodes = computed(() => favorites.value.map(f => f.code));
    
    // 分页相关 getters
    const totalPages = computed(() => Math.ceil(watchlist.value.length / pageSize));
    const hasPrevPage = computed(() => currentPage.value > 0);
    const hasNextPage = computed(() => currentPage.value < totalPages.value - 1);
    const currentRange = computed(() => {
        const start = currentPage.value * pageSize;
        const end = Math.min(start + pageSize, watchlist.value.length);
        return { start, end };
    });
    
    // 当前页的股票代码列表
    const currentPageCodes = computed(() => {
        return displayStocks.value.map(s => s.code);
    });

    // 检查是否自选
    const isFavorite = (code) => {
        return favorites.value.some(s => s.code === code);
    };

    // 检查是否在观察列表中
    const isInWatchlist = (code) => {
        return watchlist.value.some(s => s.code === code);
    };

    // 获取股票数据
    const getStockData = (code) => {
        return stockDataCache.value.get(code);
    };

    // 获取显示区域中的股票
    const getDisplayStock = (code) => {
        return displayStocks.value.find(s => s.code === code);
    };

    // 获取自选股中的股票
    const getFavoriteStock = (code) => {
        return favorites.value.find(f => f.code === code);
    };

    // 获取观察列表中的股票
    const getWatchlistStock = (code) => {
        return watchlist.value.find(w => w.code === code);
    };

    // 更新当前页显示
    const updateDisplayPage = () => {
        const start = currentPage.value * pageSize;
        const end = Math.min(start + pageSize, watchlist.value.length);
        displayStocks.value = watchlist.value.slice(start, end).map(stock => ({
            ...stock,
            price: stock.price || 0,
            change: stock.change || 0,
            changePercent: stock.changePercent || 0
        }));
        
        // 如果有显示股票且当前选中的股票不在当前页，自动选中第一只
        if (displayStocks.value.length > 0) {
            const isCurrentInPage = displayStocks.value.some(s => s.code === currentStock.value);
            if (!isCurrentInPage || !currentStock.value) {
                currentStock.value = displayStocks.value[0].code;
            }
        } else {
            currentStock.value = null;
        }
    };

    // 翻页操作
    const nextPage = () => {
        if (hasNextPage.value) {
            currentPage.value++;
            updateDisplayPage();
            saveToStorage();
            return true;
        }
        return false;
    };

    const prevPage = () => {
        if (hasPrevPage.value) {
            currentPage.value--;
            updateDisplayPage();
            saveToStorage();
            return true;
        }
        return false;
    };

    const goToPage = (page) => {
        if (page >= 0 && page < totalPages.value) {
            currentPage.value = page;
            updateDisplayPage();
            saveToStorage();
            return true;
        }
        return false;
    };

    // ============ Actions ============
    // 添加股票到观察列表
    const addToWatchlist = (stock) => {
        if (watchlist.value.length >= 100) {
            console.warn('观察列表最多只能添加100只股票');
            return false;
        }

        if (!isInWatchlist(stock.code)) {
            watchlist.value.push({
                code: stock.code,
                name: stock.name,
                market: stock.market,
                sector: stock.sector || '',
                price: 0,
                change: 0,
                changePercent: 0
            });
            
            // 更新当前页显示
            updateDisplayPage();
            saveToStorage();
            return true;
        }
        return false;
    };

    // 批量添加股票到观察列表
    const addMultipleToWatchlist = (stocks) => {
        const added = [];
        for (const stock of stocks) {
            if (addToWatchlist(stock)) {
                added.push(stock);
            }
            if (watchlist.value.length >= 100) break;
        }
        return added;
    };

    // 从观察列表移除股票
    const removeFromWatchlist = (code) => {
        const index = watchlist.value.findIndex(s => s.code === code);
        if (index !== -1) {
            watchlist.value.splice(index, 1);
            
            // 如果当前页没有股票了，回到上一页
            if (displayStocks.value.length === 0 && currentPage.value > 0) {
                currentPage.value--;
            }
            
            updateDisplayPage();
            saveToStorage();
            return true;
        }
        return false;
    };

    // 清空观察列表
    const clearWatchlist = () => {
        watchlist.value = [];
        currentPage.value = 0;
        displayStocks.value = [];
        currentStock.value = null;
        saveToStorage();
    };

    // 添加股票到显示区域（兼容旧接口）
    const addStock = (stock) => {
        return addToWatchlist(stock);
    };

    // 移除显示的股票（兼容旧接口）
    const removeStock = (code) => {
        return removeFromWatchlist(code);
    };

    // 清空所有显示的股票（兼容旧接口）
    const clearDisplayStocks = () => {
        clearWatchlist();
    };

    // 添加自选股
    const addFavorite = (stock) => {
        if (!favorites.value.find(s => s.code === stock.code)) {
            favorites.value.push({
                code: stock.code,
                name: stock.name,
                market: stock.market,
                sector: stock.sector || '',
                price: 0,
                change: 0,
                changePercent: 0
            });
            saveToStorage();
            return true;
        }
        return false;
    };

    // 批量添加自选股
    const addMultipleFavorites = (stocks) => {
        const added = [];
        for (const stock of stocks) {
            if (addFavorite(stock)) {
                added.push(stock);
            }
        }
        return added;
    };

    // 移除自选股
    const removeFavorite = (code) => {
        const index = favorites.value.findIndex(s => s.code === code);
        if (index !== -1) {
            favorites.value.splice(index, 1);
            saveToStorage();
            return true;
        }
        return false;
    };

    // 清空所有自选股
    const clearFavorites = () => {
        favorites.value = [];
        saveToStorage();
    };

    // 切换自选股状态
    const toggleFavorite = (stock) => {
        if (isFavorite(stock.code)) {
            removeFavorite(stock.code);
            return false;
        } else {
            addFavorite(stock);
            return true;
        }
    };

    // 设置当前选中的股票
    const setCurrentStock = (code) => {
        currentStock.value = code;
    };

    // 切换到下一只股票（同页内切换）
    const nextStock = () => {
        const currentIndex = displayStocks.value.findIndex(s => s.code === currentStock.value);
        if (currentIndex !== -1 && currentIndex < displayStocks.value.length - 1) {
            // 同页下一只
            currentStock.value = displayStocks.value[currentIndex + 1].code;
            return true;
        } else if (hasNextPage.value) {
            // 下一页第一只
            nextPage();
            currentStock.value = displayStocks.value[0]?.code;
            return true;
        }
        return false;
    };

    // 切换到上一只股票（同页内切换）
    const prevStock = () => {
        const currentIndex = displayStocks.value.findIndex(s => s.code === currentStock.value);
        if (currentIndex > 0) {
            // 同页上一只
            currentStock.value = displayStocks.value[currentIndex - 1].code;
            return true;
        } else if (hasPrevPage.value) {
            // 上一页最后一只
            prevPage();
            currentStock.value = displayStocks.value[displayStocks.value.length - 1]?.code;
            return true;
        }
        return false;
    };

    // 更新股票实时数据
    const updateStockData = (code, data) => {
        // 更新观察列表中的数据
        const watchlistStock = watchlist.value.find(s => s.code === code);
        if (watchlistStock) {
            Object.assign(watchlistStock, data);
        }

        // 更新显示列表中的数据
        const displayStock = displayStocks.value.find(s => s.code === code);
        if (displayStock) {
            Object.assign(displayStock, data);
        }

        // 更新自选股中的数据
        const favorite = favorites.value.find(s => s.code === code);
        if (favorite) {
            Object.assign(favorite, data);
        }

        stockDataCache.value.set(code, data);
    };

    // 批量更新股票数据
    const updateMultipleStockData = (dataMap) => {
        for (const [code, data] of dataMap) {
            updateStockData(code, data);
        }
    };

    // 刷新所有显示股票的实时数据
    const refreshAllDisplayStocks = async (fetchDataFn) => {
        const promises = displayStocks.value.map(async (stock) => {
            const data = await fetchDataFn(stock.code);
            if (data) {
                updateStockData(stock.code, data);
            }
        });
        await Promise.all(promises);
    };

    // 刷新观察列表所有股票的实时数据
    const refreshAllWatchlist = async (fetchDataFn) => {
        const promises = watchlist.value.map(async (stock) => {
            const data = await fetchDataFn(stock.code);
            if (data) {
                updateStockData(stock.code, data);
            }
        });
        await Promise.all(promises);
    };

    // 刷新所有自选股的实时数据
    const refreshAllFavorites = async (fetchDataFn) => {
        const promises = favorites.value.map(async (favorite) => {
            const data = await fetchDataFn(favorite.code);
            if (data) {
                updateStockData(favorite.code, data);
            }
        });
        await Promise.all(promises);
    };

    // 保存到本地存储
    const saveToStorage = async () => {
        try {
            const data = {
                watchlist: watchlist.value.map(s => ({
                    code: s.code,
                    name: s.name,
                    market: s.market,
                    sector: s.sector
                })),
                favorites: favorites.value.map(f => ({
                    code: f.code,
                    name: f.name,
                    market: f.market,
                    sector: f.sector
                })),
                currentPage: currentPage.value
            };
            await window.channel?.setConfig('stocks', data);
        } catch (error) {
            console.error('保存股票配置失败:', error);
        }
    };

    // 从本地存储加载
    const loadFromStorage = async () => {
        try {
            const data = await window.channel?.getConfig('stocks');
            if (data) {
                if (data.watchlist) {
                    watchlist.value = data.watchlist.map(s => ({
                        ...s,
                        price: 0,
                        change: 0,
                        changePercent: 0
                    }));
                }
                if (data.favorites) {
                    favorites.value = data.favorites.map(f => ({
                        ...f,
                        price: 0,
                        change: 0,
                        changePercent: 0
                    }));
                }
                if (data.currentPage !== undefined) {
                    currentPage.value = data.currentPage;
                }
            }
            
            // 更新显示
            updateDisplayPage();
        } catch (error) {
            console.error('加载股票配置失败:', error);
        }
    };

    // 重置所有状态
    const resetStore = () => {
        watchlist.value = [];
        favorites.value = [];
        currentStock.value = null;
        currentPage.value = 0;
        stockDataCache.value.clear();
        displayStocks.value = [];
        saveToStorage();
    };

    // 导出所有需要暴露的内容
    return {
        // state
        watchlist,
        displayStocks,
        favorites,
        currentStock,
        stockDataCache,
        currentPage,
        pageSize,
        
        // getters
        canAddMore,
        hasDisplayStocks,
        displayCount,
        favoriteCount,
        favoriteCodes,
        totalPages,
        hasPrevPage,
        hasNextPage,
        currentRange,
        currentPageCodes,
        isFavorite,
        isInWatchlist,
        getStockData,
        getDisplayStock,
        getFavoriteStock,
        getWatchlistStock,
        
        // actions - 观察列表管理
        addToWatchlist,
        addMultipleToWatchlist,
        removeFromWatchlist,
        clearWatchlist,
        
        // actions - 分页
        nextPage,
        prevPage,
        goToPage,
        nextStock,
        prevStock,
        
        // actions - 自选股管理
        addFavorite,
        addMultipleFavorites,
        removeFavorite,
        clearFavorites,
        toggleFavorite,
        
        // actions - 数据更新
        setCurrentStock,
        updateStockData,
        updateMultipleStockData,
        refreshAllDisplayStocks,
        refreshAllWatchlist,
        refreshAllFavorites,
        
        // actions - 兼容旧接口
        addStock,
        removeStock,
        clearDisplayStocks,
        
        // actions - 持久化
        loadFromStorage,
        resetStore
    };
});