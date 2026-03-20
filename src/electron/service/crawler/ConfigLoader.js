// src/main/crawler/core/ConfigLoader.js
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { glob } from 'glob';
import Joi from 'joi';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';

/**
 * 配置加载器 - 支持完整的 YAML 配置格式
 * 提供配置验证、热加载、默认值合并等功能
 * 主要功能
1. 完整的配置验证
使用 Joi 进行 Schema 验证

支持所有配置项的验证规则

自定义验证逻辑（URL、选择器等）

2. 变量解析
支持 {{variable}} 语法

支持嵌套变量（如 {{site.id}}）

自动解析配置中的变量

3. 配置合并
深度合并默认配置和用户配置

保留用户自定义字段

4. 热加载
使用 chokidar 监听文件变化

自动重新加载修改的配置

触发相应事件

5. 选择器解析
支持 CSS 选择器

支持属性选择器（selector@attribute 格式）

自动解析为结构化数据

6. 延迟配置解析
支持固定延迟（如 2000）

支持范围延迟（如 1000-3000）

自动计算随机延迟

7. 配置导入导出
支持 YAML 和 JSON 格式

批量导入验证

配置模板生成

8. 事件系统
configAdded - 配置添加

configChanged - 配置修改

configRemoved - 配置删除

configSaved - 配置保存

configReloaded - 配置重载

error - 错误事件
// 使用示例：
const configLoader = new ConfigLoader({
  configPath: './configs/sites',
  autoWatch: true
});

// 加载所有配置
const configs = await configLoader.loadAll('./configs/sites');

// 监听配置变化
configLoader.on('configChanged', ({ id, config, oldConfig }) => {
  console.log(`Config ${id} changed`);
});

// 获取配置
const exampleConfig = configLoader.getConfig('example_news');

// 解析选择器
const selector = configLoader.parseSelector('a.title@href');
// 返回: { css: 'a.title', attr: 'href', type: 'attribute' }

// 解析延迟
const delay = configLoader.parseDelay('1000-3000');
// 返回: { min: 1000, max: 3000, isRange: true }

// 保存配置
await configLoader.saveConfig(newConfig, './configs/sites/new-site.yaml');

// 导出配置
const yamlStr = configLoader.exportConfig('example_news', 'yaml');

// 关闭
configLoader.close();
 */
export default class ConfigLoader extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configs = new Map();           // 配置缓存
    this.watchers = new Map();          // 文件监听器
    this.configPath = options.configPath || null;
    this.autoWatch = options.autoWatch !== false;
    this.defaultConfig = this.getDefaultConfig();
    
    // 配置验证 schema
    this.schema = this.buildValidationSchema();
  }
  
  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      site: {
        encoding: 'utf-8',
        need_login: false,
        anti_block: {
          delay: '1000-3000',
          use_proxy: false,
          rotate_ip: false,
          user_agents: []
        },
        list_page: {
          type: 'pagination',
          start_page: 1,
          max_pages: 10,
          pagination: {
            param_name: 'page',
            page_size: 20
          }
        },
        download: {
          enabled: true,
          types: [],
          save_path: './downloads/{{site}}/{{date}}'
        },
        incremental: {
          enabled: true,
          strategy: 'url_hash',
          expire_days: 30
        },
        circuit_breaker: {
          enabled: true,
          max_failures: 3,
          reset_timeout: 300000,
          exceptions: ['timeout', '403', '404', '500']
        },
        storage: {
          database: true,
          json_file: true,
          export_formats: []
        },
        processors: {
          before_crawl: [],
          after_crawl: []
        }
      }
    };
  }
  
  /**
   * 构建验证 Schema
   */
  buildValidationSchema() {
    return Joi.object({
      site: Joi.object({
        id: Joi.string().required().pattern(/^[a-z0-9_]+$/).messages({
          'string.pattern.base': 'Site ID must contain only lowercase letters, numbers and underscore'
        }),
        name: Joi.string().required(),
        base_url: Joi.string().uri().required(),
        encoding: Joi.string().default('utf-8'),
        need_login: Joi.boolean().default(false),
        
        // 登录配置
        login: Joi.when('need_login', {
          is: true,
          then: Joi.object({
            url: Joi.string().required(),
            method: Joi.string().valid('get', 'post').default('post'),
            form_data: Joi.object().pattern(Joi.string(), Joi.string()),
            success_indicators: Joi.array().items(Joi.string()).min(1),
            cookie_jar: Joi.string(),
            timeout: Joi.number().default(30000)
          }).required(),
          otherwise: Joi.optional()
        }),
        
        // 反爬配置
        anti_block: Joi.object({
          delay: Joi.alternatives().try(
            Joi.string().pattern(/^\d+-\d+$/),
            Joi.number().min(0)
          ).default('1000-3000'),
          user_agents: Joi.array().items(Joi.string()).default([]),
          use_proxy: Joi.boolean().default(false),
          rotate_ip: Joi.boolean().default(false),
          proxy_list: Joi.array().items(Joi.string()),
          retry_count: Joi.number().default(3),
          timeout: Joi.number().default(30000)
        }).default(),
        
        // 列表页配置
        list_page: Joi.object({
          url: Joi.string().required(),
          type: Joi.string().valid('pagination', 'scroll', 'ajax', 'infinite').default('pagination'),
          start_page: Joi.number().min(1).default(1),
          max_pages: Joi.number().min(1).default(10),
          selector: Joi.string().required(),
          pagination: Joi.object({
            param_name: Joi.string().default('page'),
            page_size: Joi.number().default(20),
            scroll_selector: Joi.string(),
            scroll_threshold: Joi.number().default(100),
            ajax_url: Joi.string(),
            ajax_method: Joi.string().valid('get', 'post').default('get')
          }).default(),
          next_page: Joi.object({
            selector: Joi.string(),
            attribute: Joi.string().default('href')
          }),
          item: Joi.object({
            link: Joi.string().required(),
            title: Joi.string().required(),
            date: Joi.string(),
            thumbnail: Joi.string(),
            custom_fields: Joi.object().pattern(Joi.string(), Joi.string())
          }).required()
        }).required(),
        
        // 详情页配置
        detail_page: Joi.object({
          fields: Joi.array().items(
            Joi.object({
              name: Joi.string().required(),
              selector: Joi.string().required(),
              type: Joi.string().valid('text', 'html', 'attribute', 'datetime', 'array', 'json').default('text'),
              attribute: Joi.when('type', {
                is: 'attribute',
                then: Joi.string().required(),
                otherwise: Joi.optional()
              }),
              default: Joi.any(),
              transform: Joi.func()
            })
          ).min(1).required(),
          wait_selector: Joi.string(),
          timeout: Joi.number().default(30000),
          auto_scroll: Joi.boolean().default(false)
        }).required(),
        
        // 下载配置
        download: Joi.object({
          enabled: Joi.boolean().default(true),
          types: Joi.array().items(Joi.string()).default([]),
          save_path: Joi.string().default('./downloads/{{site}}/{{date}}'),
          naming_rule: Joi.string().default('{{title}}_{{timestamp}}'),
          max_concurrent: Joi.number().default(3),
          chunk_size: Joi.number().default(1024 * 1024),
          retry_count: Joi.number().default(3),
          timeout: Joi.number().default(60000)
        }).default(),
        
        // 增量爬取配置
        incremental: Joi.object({
          enabled: Joi.boolean().default(true),
          strategy: Joi.string().valid('url_hash', 'content_hash', 'timestamp', 'etag').default('url_hash'),
          expire_days: Joi.number().default(30),
          check_interval: Joi.number().default(3600),
          ignore_fields: Joi.array().items(Joi.string())
        }).default(),
        
        // 熔断配置
        circuit_breaker: Joi.object({
          enabled: Joi.boolean().default(true),
          max_failures: Joi.number().min(1).default(3),
          reset_timeout: Joi.number().min(1000).default(300000),
          exceptions: Joi.array().items(Joi.string()).default(['timeout', '403', '404', '500']),
          half_open_timeout: Joi.number().default(5000)
        }).default(),
        
        // 存储配置
        storage: Joi.object({
          database: Joi.boolean().default(true),
          json_file: Joi.boolean().default(true),
          export_formats: Joi.array().items(Joi.string().valid('csv', 'excel', 'json')).default([])
        }).default(),
        
        // 处理器配置
        processors: Joi.object({
          before_crawl: Joi.array().items(
            Joi.object({
              type: Joi.string().required(),
              pattern: Joi.string(),
              replacement: Joi.string(),
              options: Joi.object()
            })
          ).default([]),
          after_crawl: Joi.array().items(
            Joi.object({
              type: Joi.string().required(),
              options: Joi.object()
            })
          ).default([])
        }).default()
      }).required()
    });
  }
  
  /**
   * 加载所有配置文件
   * @param {string} configPath - 配置文件路径
   * @returns {Promise<Array>} 配置数组
   */
  async loadAll(configPath) {
    const pattern = path.join(configPath, '**/*.{yaml,yml}');
    const files = await glob(pattern);
    const configs = [];
    
    for (const file of files) {
      try {
        const config = await this.loadFile(file);
        if (config && config.site && config.site.enabled !== false) {
          configs.push(config);
          this.configs.set(config.site.id, {
            ...config,
            _path: file,
            _loadedAt: new Date()
          });
        }
      } catch (error) {
        console.error(`Failed to load config ${file}:`, error);
        this.emit('error', { file, error: error.message });
      }
    }
    
    // 启动文件监听
    if (this.autoWatch && configPath) {
      this.startWatching(configPath);
    }
    
    return configs;
  }
  
  /**
   * 加载单个配置文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 配置对象
   */
  async loadFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const config = yaml.load(content);
    
    // 合并默认配置
    const mergedConfig = this.mergeConfig(this.defaultConfig, config);
    
    // 验证配置
    const validated = await this.validateConfig(mergedConfig);
    
    // 解析变量和表达式
    const parsed = this.parseConfigVariables(validated);
    
    // 添加元数据
    parsed._path = filePath;
    parsed._loadedAt = new Date();
    
    return parsed;
  }
  
  /**
   * 合并配置（深度合并）
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig));
    
    const deepMerge = (target, source) => {
      if (!source) return target;
      
      for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
      return target;
    };
    
    return deepMerge(merged, userConfig);
  }
  
  /**
   * 验证配置
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} 验证后的配置
   */
  async validateConfig(config) {
    try {
      const { error, value } = this.schema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: false
      });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        throw new Error(`Config validation failed: ${JSON.stringify(errors, null, 2)}`);
      }
      
      // 额外验证
      await this.additionalValidation(value);
      
      return value;
    } catch (error) {
      throw new Error(`Invalid config: ${error.message}`);
    }
  }
  
  /**
   * 额外验证
   */
  async additionalValidation(config) {
    const site = config.site;
    
    // 验证 URL 格式
    try {
      new URL(site.base_url);
    } catch {
      throw new Error(`Invalid base_url: ${site.base_url}`);
    }
    
    // 验证列表页 URL
    if (site.list_page.url.includes('{{page}}')) {
      // 验证分页配置
      if (site.list_page.type !== 'pagination') {
        throw new Error('List page with page variable should use pagination type');
      }
    }
    
    // 验证选择器格式
    const validateSelector = (selector) => {
      if (typeof selector === 'string') {
        // 检查是否是属性选择器格式（如 "a.title@text"）
        if (selector.includes('@')) {
          const [css, attr] = selector.split('@');
          if (!css || !attr) {
            throw new Error(`Invalid selector format: ${selector}`);
          }
        }
      }
    };
    
    // 验证列表页选择器
    if (site.list_page.item) {
      Object.values(site.list_page.item).forEach(validateSelector);
    }
    
    // 验证详情页选择器
    if (site.detail_page.fields) {
      site.detail_page.fields.forEach(field => {
        validateSelector(field.selector);
      });
    }
  }
  
  /**
   * 解析配置中的变量和表达式
   */
  parseConfigVariables(config) {
    const parseValue = (value, context = {}) => {
      if (typeof value === 'string') {
        // 解析 {{variable}} 格式的变量
        return value.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
          const keys = key.split('.');
          let result = context;
          for (const k of keys) {
            result = result?.[k];
            if (result === undefined) break;
          }
          return result !== undefined ? result : match;
        });
      } else if (Array.isArray(value)) {
        return value.map(v => parseValue(v, context));
      } else if (value && typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = parseValue(v, context);
        }
        return result;
      }
      return value;
    };
    
    // 使用 site 作为上下文解析
    return parseValue(config, { site: config.site });
  }
  
  /**
   * 保存配置到文件
   * @param {Object} config - 配置对象
   * @param {string} filePath - 文件路径
   */
  async saveConfig(config, filePath) {
    try {
      // 验证配置
      const validated = await this.validateConfig(config);
      
      // 移除内部字段
      const cleanConfig = JSON.parse(JSON.stringify(validated));
      delete cleanConfig._path;
      delete cleanConfig._loadedAt;
      
      // 转换为 YAML
      const yamlStr = yaml.dump(cleanConfig, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: true
      });
      
      // 确保目录存在
      await fs.ensureDir(path.dirname(filePath));
      
      // 写入文件
      await fs.writeFile(filePath, yamlStr, 'utf-8');
      
      // 更新缓存
      this.configs.set(config.site.id, {
        ...validated,
        _path: filePath,
        _loadedAt: new Date()
      });
      
      this.emit('configSaved', { id: config.site.id, path: filePath });
      
      return filePath;
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }
  
  /**
   * 删除配置文件
   * @param {string} filePath - 文件路径
   */
  async deleteConfig(filePath) {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      
      // 从缓存中移除
      for (const [id, config] of this.configs.entries()) {
        if (config._path === filePath) {
          this.configs.delete(id);
          break;
        }
      }
      
      this.emit('configDeleted', { path: filePath });
    }
  }
  
  /**
   * 开始监听配置文件变化
   */
  startWatching(configPath) {
    if (this.watcher) {
      return;
    }
    
    this.watcher = chokidar.watch(configPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true
    });
    
    this.watcher
      .on('add', async (filePath) => {
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          try {
            const config = await this.loadFile(filePath);
            this.configs.set(config.site.id, config);
            this.emit('configAdded', { id: config.site.id, path: filePath, config });
          } catch (error) {
            this.emit('error', { event: 'add', path: filePath, error: error.message });
          }
        }
      })
      .on('change', async (filePath) => {
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          try {
            const config = await this.loadFile(filePath);
            const oldConfig = this.configs.get(config.site.id);
            this.configs.set(config.site.id, config);
            this.emit('configChanged', { 
              id: config.site.id, 
              path: filePath, 
              config,
              oldConfig 
            });
          } catch (error) {
            this.emit('error', { event: 'change', path: filePath, error: error.message });
          }
        }
      })
      .on('unlink', (filePath) => {
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          for (const [id, config] of this.configs.entries()) {
            if (config._path === filePath) {
              this.configs.delete(id);
              this.emit('configRemoved', { id, path: filePath });
              break;
            }
          }
        }
      });
    
    this.emit('watching', { path: configPath });
  }
  
  /**
   * 停止监听
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
  
  /**
   * 获取配置
   * @param {string} id - 站点 ID
   * @returns {Object|null} 配置对象
   */
  getConfig(id) {
    return this.configs.get(id) || null;
  }
  
  /**
   * 获取所有配置
   * @returns {Array} 配置列表
   */
  getAllConfigs() {
    return Array.from(this.configs.values());
  }
  
  /**
   * 重新加载配置
   * @param {string} id - 站点 ID
   */
  async reloadConfig(id) {
    const config = this.configs.get(id);
    if (config && config._path) {
      const newConfig = await this.loadFile(config._path);
      this.configs.set(id, newConfig);
      this.emit('configReloaded', { id, config: newConfig });
      return newConfig;
    }
    return null;
  }
  
  /**
   * 批量导入配置
   * @param {Array} configs - 配置数组
   */
  async importConfigs(configs) {
    const results = [];
    for (const config of configs) {
      try {
        const validated = await this.validateConfig(config);
        results.push(validated);
      } catch (error) {
        results.push({ error: error.message, config });
      }
    }
    return results;
  }
  
  /**
   * 导出配置
   * @param {string} id - 站点 ID
   * @param {string} format - 导出格式 (yaml|json)
   */
  exportConfig(id, format = 'yaml') {
    const config = this.configs.get(id);
    if (!config) return null;
    
    const cleanConfig = JSON.parse(JSON.stringify(config));
    delete cleanConfig._path;
    delete cleanConfig._loadedAt;
    
    if (format === 'yaml') {
      return yaml.dump(cleanConfig, { indent: 2, lineWidth: -1 });
    } else if (format === 'json') {
      return JSON.stringify(cleanConfig, null, 2);
    }
    
    return null;
  }
  
  /**
   * 验证单个选择器
   * @param {string} selector - 选择器字符串
   * @returns {Object} 解析后的选择器
   */
  parseSelector(selector) {
    if (selector.includes('@')) {
      const [css, attr] = selector.split('@');
      return { css: css.trim(), attr: attr.trim(), type: 'attribute' };
    }
    return { css: selector.trim(), type: 'text' };
  }
  
  /**
   * 解析延迟配置
   * @param {string|number} delay - 延迟配置
   * @returns {Object} 解析后的延迟配置
   */
  parseDelay(delay) {
    if (typeof delay === 'number') {
      return { min: delay, max: delay, isRange: false };
    }
    
    if (typeof delay === 'string' && delay.includes('-')) {
      const [min, max] = delay.split('-').map(Number);
      return { min, max, isRange: true };
    }
    
    return { min: 1000, max: 3000, isRange: true };
  }
  
  /**
   * 生成配置模板
   * @param {string} id - 站点 ID
   * @returns {Object} 配置模板
   */
  generateTemplate(id) {
    return {
      site: {
        id,
        name: `New Site ${id}`,
        base_url: 'https://example.com',
        encoding: 'utf-8',
        need_login: false,
        anti_block: {
          delay: '1000-3000',
          user_agents: [],
          use_proxy: false,
          rotate_ip: false
        },
        list_page: {
          url: '/list?page={{page}}',
          type: 'pagination',
          start_page: 1,
          max_pages: 10,
          selector: '.item',
          item: {
            link: 'a@href',
            title: 'a@text'
          }
        },
        detail_page: {
          fields: [
            { name: 'title', selector: 'h1', type: 'text' },
            { name: 'content', selector: '.content', type: 'html' }
          ]
        },
        download: {
          enabled: true,
          types: [],
          save_path: './downloads/{{site}}/{{date}}'
        },
        incremental: {
          enabled: true,
          strategy: 'url_hash',
          expire_days: 30
        },
        circuit_breaker: {
          enabled: true,
          max_failures: 3,
          reset_timeout: 300000
        },
        storage: {
          database: true,
          json_file: true,
          export_formats: []
        }
      }
    };
  }
  
  /**
   * 关闭配置加载器
   */
  close() {
    this.stopWatching();
    this.removeAllListeners();
    this.configs.clear();
  }
}