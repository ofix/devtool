import Singleton from "../Singleton.js";
import { join, dirname } from 'node:path';
import path from "path";
import fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default class FavoriteShare extends Singleton {
    constructor(manager) {
        super();
        this.manager = manager;
        this.favoriteFilePath = path.join(__dirname, '../../data/favorite_shares.json');
        // 自选股
        this.favoriteShares = []; // 自选股列表
        this.favoriteShareCodeSet = new Set(); // 自选股Set方便快速查找
    }

    static getInstance(manager) {
        if (!this.instance) {
            this.instance = new FavoriteShare(manager);
        }
        return this.instance;
    }


    /**
     * 从文件 favorites.json 中加载自选股
     * 文件格式: ["688203","322001","000001"]
     */
    loadFavoriteShares() {
        try {
            if (fs.existsSync(this.favoriteFilePath)) {
                const data = fs.readFileSync(this.favoriteFilePath, 'utf8');
                const parsed = JSON.parse(data);
                // 确保是数组格式
                if (Array.isArray(parsed)) {
                    // 去重并过滤无效数据
                    this.favoriteShares = [...new Set(parsed)];
                } else {
                    console.warn('自选股文件格式错误，使用空列表');
                    this.favoriteShares = [];
                }
                this.favoriteShareCodeSet.clear()
                this.favoriteShares.forEach(share => {
                    this.favoriteShareCodeSet.add(share.code);
                })
            } else {
                // 文件不存在，创建空数组
                this.favoriteShares = [];
                this.favoriteShareCodeSet.clear();
            }
        } catch (err) {
            console.error('加载自选股文件失败:', err);
            this.favoriteShares = [];
            this.favoriteShareCodeSet.clear();
        }
    }

    /**
     * 保存自选股到文件
     * @private
     */
    saveFavoriteShares() {
        try {
            fs.writeFileSync(this.favoriteFilePath, JSON.stringify(this.favoriteShares, null, 2), 'utf8');
        } catch (err) {
            console.error('保存自选股文件失败:', err);
        }
    }

    // 返回所有自选股
    getFavoriteShares() {
        return this.favoriteShares;
    }

    // 判断是否是自选股
    isFavoriteShare(code) {
        return this.favoriteShareCodeSet.has(code);
    }

    /**
     * 添加自选股（自动去重）
     * @param {string} code - 股票代码（如 '688203' 或 '322001'）
     * @returns {boolean} 是否添加成功
     */
    addFavoriteShare(code) {
        // 参数校验
        if (!code || typeof code !== 'string') {
            console.error('股票代码不能为空');
            return false;
        }

        // 标准化代码格式：去除空格，统一为字符串
        const _code = code.trim();

        // 检查是否已存在
        if (this.favoriteShareCodeSet.has(_code)) {
            console.log(`股票 ${_code} 已在自选股中`);
            return false;
        }

        // 添加并保存
        let share = this.manager.getShareByCode(_code);
        if (share) {
            share.favorite = true;
            this.favoriteShares.push(share);
            this.favoriteShareCodeSet.add(_code);
            this.saveFavoriteShares();
            console.log(`成功添加自选股: ${_code}`);
            return true;
        }
        return false;
    }

    /**
     * 删除自选股
     * @param {string} code - 股票代码
     * @returns {boolean} 是否删除成功
     */
    delFavoriteShare(code) {
        if (!code || typeof code !== 'string') {
            console.error('股票代码不能为空');
            return false;
        }

        const _code = code.trim();

        const index = this.favoriteShares.findIndex(item =>
            item.code === _code
        );

        if (index === -1) {
            console.log(`股票 ${_code} 不在自选股中`);
            return false;
        }

        // 删除并保存
        this.favoriteShares.splice(index, 1);
        this.favoriteShareCodeSet.delete(_code);
        this.saveFavoriteShares();
        console.log(`成功删除自选股: ${_code}`);
        return true;
    }

    /**
     * 批量删除自选股
     * @param {Array} codes - 股票代码数组
     * @returns {Object} 删除结果统计
     */
    delFavoriteShares(codes) {
        if (!Array.isArray(codes)) {
            console.error('参数必须是数组');
            return { success: 0, failed: 0, notFound: 0 };
        }

        let success = 0;
        let notFound = 0;

        codes.forEach(code => {
            if (!code || typeof code !== 'string') {
                return;
            }

            const _code = code.trim();
            const index = this.favoriteShares.findIndex(share => share.code === _code);

            if (index !== -1) {
                this.favoriteShares.splice(index, 1);
                this.favoriteShareCodeSet.delete(_code);
                success++;
            } else {
                notFound++;
            }
        });

        if (success > 0) {
            this.saveFavoriteShares();
        }

        console.log(`批量删除完成: 成功${success}个, 未找到${notFound}个`);
        return { success, notFound };
    }

    /**
     * 清空所有自选股
     * @returns {boolean}
     */
    clearAllFavoriteShares() {
        if (this.favoriteShares.length === 0) {
            console.log('自选股列表已为空');
            return false;
        }

        this.favoriteShares = [];
        this.favoriteShareCodeSet.clear();
        this.saveFavoriteShares();
        console.log('已清空所有自选股');
        return true;
    }


}