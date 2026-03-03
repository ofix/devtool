// src/utils/VideoRecorder.js
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { screen, BrowserWindow } from 'electron'

/**
 * 视频录屏类（支持暂停/恢复）
 * 核心：分段录制 + 后期合并
 */
class VideoRecorder {
  constructor() {
    // 核心状态
    this.recordingProcess = null // 当前 FFmpeg 进程
    this.isRecording = false // 整体录屏状态
    this.isPaused = false // 暂停状态
    this.savePath = '' // 最终保存路径
    this.tempSegments = [] // 临时分段文件列表
    this.segmentIndex = 0 // 分段索引
    this.recordingConfig = {
      fps: 30,
      format: 'mp4',
      videoCodec: 'libx264',
      preset: 'fast',
      crf: 23,
      drawMouse: true
    }
    this.tempDir = path.join(os.tmpdir(), 'electron-recorder-segments') // 临时目录

    // 初始化
    this._initFfmpegPermission()
    this._createTempDir()
  }

  /**
   * 初始化 FFmpeg 权限
   * @private
   */
  _initFfmpegPermission() {
    if (process.platform !== 'win32' && fs.existsSync(ffmpeg.path)) {
      try {
        fs.chmodSync(ffmpeg.path, 0o755)
      } catch (err) {
        console.warn('FFmpeg 权限设置失败:', err.message)
      }
    }
  }

  /**
   * 创建临时目录（存储分段文件）
   * @private
   */
  _createTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * 清除临时文件
   * @private
   */
  _cleanTempFiles() {
    if (fs.existsSync(this.tempDir)) {
      fs.readdirSync(this.tempDir).forEach(file => {
        fs.unlinkSync(path.join(this.tempDir, file))
      })
      fs.rmdirSync(this.tempDir)
    }
    this.tempSegments = []
    this.segmentIndex = 0
  }

  /**
   * 获取 FFmpeg 路径
   * @private
   */
  _getFfmpegPath() {
    if (process.env.NODE_ENV === 'production' && process.versions.electron) {
      const unpackedPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@ffmpeg-installer',
        'ffmpeg',
        'ffmpeg' + (process.platform === 'win32' ? '.exe' : '')
      )
      return fs.existsSync(unpackedPath) ? unpackedPath : ffmpeg.path
    }
    return ffmpeg.path
  }

  /**
   * 生成临时分段文件路径
   * @returns {string}
   * @private
   */
  _getTempSegmentPath() {
    const segmentName = `segment_${Date.now()}_${this.segmentIndex}.${this.recordingConfig.format}`
    const segmentPath = path.join(this.tempDir, segmentName)
    this.tempSegments.push(segmentPath)
    this.segmentIndex++
    return segmentPath
  }

  /**
   * 构建 FFmpeg 录屏参数
   * @private
   */
  _buildFfmpegArgs(inputConfig, outputPath) {
    const { type, region, windowId } = inputConfig
    const { fps, format, videoCodec, preset, crf, drawMouse } = this.recordingConfig
    const args = []

    // 通用参数
    args.push('-framerate', fps.toString())
    if (drawMouse) args.push('-draw_mouse', '1')

    // 平台适配
    switch (process.platform) {
      case 'win32':
        args.push('-f', 'gdigrab')
        if (type === 'fullscreen') args.push('-i', 'desktop')
        else if (type === 'region') {
          const { x, y, width, height } = region
          args.push('-offset_x', x, '-offset_y', y, '-video_size', `${width}x${height}`, '-i', 'desktop')
        } else if (type === 'window') {
          args.push('-i', `title=${this._getWindowTitleById(windowId)}`)
        }
        break
      case 'darwin':
        args.push('-f', 'avfoundation', '-i', '1:0', '-pix_fmt', 'yuv420p')
        if (type === 'region' || type === 'window') {
          const bounds = type === 'region' ? region : this._getWindowBoundsById(windowId)
          args.push('-filter:v', `crop=${bounds.width}:${bounds.height}:${bounds.x}:${bounds.y}`)
        }
        break
      case 'linux':
        args.push('-f', 'x11grab', '-i', `${process.env.DISPLAY || ':0.0'}`)
        if (type === 'region' || type === 'window') {
          const bounds = type === 'region' ? region : this._getWindowBoundsById(windowId)
          args.push('-video_size', `${bounds.width}x${bounds.height}`, '-i', `${process.env.DISPLAY}+${bounds.x},${bounds.y}`)
        }
        break
    }

    // 输出参数
    args.push(
      '-c:v', videoCodec,
      '-preset', preset,
      '-crf', crf,
      '-movflags', '+faststart',
      '-y',
      outputPath
    )

    return args
  }

  /**
   * 启动单个分段的录制
   * @private
   */
  async _startSegmentRecording(inputConfig) {
    try {
      const segmentPath = this._getTempSegmentPath()
      const ffmpegArgs = this._buildFfmpegArgs(inputConfig, segmentPath)
      const ffmpegBin = this._getFfmpegPath()

      this.recordingProcess = spawn(ffmpegBin, ffmpegArgs)
      this.isRecording = true
      this.isPaused = false

      // 进程监听
      this.recordingProcess.stderr.on('data', (data) => {
        const log = data.toString()
        if (log.includes('error')) console.error('FFmpeg 错误:', log)
      })

      this.recordingProcess.on('exit', (code) => {
        if (code !== 0 && !this.isPaused) {
          console.error(`分段录制异常退出，码：${code}`)
          this.isRecording = false
        }
      })

      this.recordingProcess.on('error', (err) => {
        console.error('分段录制启动失败:', err)
        this.isRecording = false
      })

      return { success: true, message: '分段录制已启动' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  /**
   * 停止当前分段录制（优雅停止）
   * @private
   */
  async _stopSegmentRecording() {
    if (!this.recordingProcess) return { success: true }

    try {
      // 发送停止指令
      if (this.recordingProcess.stdin.writable) {
        this.recordingProcess.stdin.write('q\n')
        this.recordingProcess.stdin.end()
      }

      // 兜底强制停止
      const timeout = setTimeout(() => {
        if (this.recordingProcess && !this.recordingProcess.killed) {
          this.recordingProcess.kill('SIGTERM')
        }
      }, 3000)

      await new Promise(resolve => {
        this.recordingProcess.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      this.recordingProcess = null
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  /**
   * 合并分段文件为最终视频
   * @private
   */
  async _mergeSegments() {
    if (this.tempSegments.length === 0) {
      throw new Error('无分段文件可合并')
    }

    // 生成文件列表（FFmpeg 合并需要的文件清单）
    const listPath = path.join(this.tempDir, 'segments.txt')
    const listContent = this.tempSegments.map(seg => `file '${seg.replace(/'/g, "\\'")}'`).join('\n')
    fs.writeFileSync(listPath, listContent)

    // 构建合并参数
    const mergeArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy', // 直接拷贝流，不重新编码（快速）
      '-y',
      this.savePath
    ]

    return new Promise((resolve, reject) => {
      const mergeProcess = spawn(this._getFfmpegPath(), mergeArgs)

      mergeProcess.on('exit', (code) => {
        // 清理临时文件
        this._cleanTempFiles()
        if (code === 0) {
          resolve({ success: true })
        } else {
          reject(new Error(`合并失败，退出码：${code}`))
        }
      })

      mergeProcess.on('error', (err) => {
        this._cleanTempFiles()
        reject(err)
      })
    })
  }

  // ========== 公开 API ==========
  /**
   * 开始录屏
   */
  async startRecording(options) {
    try {
      if (this.isRecording) throw new Error('当前正在录屏')

      const { type, savePath, region, windowId, config = {} } = options
      // 参数校验
      if (!savePath) throw new Error('保存路径不能为空')
      if (type === 'region' && !region) throw new Error('区域录屏需传入 region')
      if (type === 'window' && !windowId) throw new Error('窗口录屏需传入 windowId')

      // 初始化配置
      this.savePath = savePath
      Object.assign(this.recordingConfig, config)
      this._cleanTempFiles() // 清空旧的临时文件

      // 启动第一个分段
      const res = await this._startSegmentRecording({ type, region, windowId })
      if (!res.success) throw new Error(res.message)

      return {
        success: true,
        message: '录屏已开始',
        savePath: this.savePath
      }
    } catch (err) {
      return {
        success: false,
        message: err.message,
        savePath: ''
      }
    }
  }

  /**
   * 暂停录屏
   */
  async pauseRecording() {
    try {
      if (!this.isRecording || this.isPaused) throw new Error('当前未在录屏或已暂停')

      // 停止当前分段
      const res = await this._stopSegmentRecording()
      if (!res.success) throw new Error(res.message)

      this.isPaused = true
      return {
        success: true,
        message: '录屏已暂停'
      }
    } catch (err) {
      return {
        success: false,
        message: err.message
      }
    }
  }

  /**
   * 恢复录屏
   */
  async resumeRecording(inputConfig) {
    try {
      if (!this.isRecording || !this.isPaused) throw new Error('当前未暂停录屏')

      // 启动新的分段
      const res = await this._startSegmentRecording(inputConfig)
      if (!res.success) throw new Error(res.message)

      this.isPaused = false
      return {
        success: true,
        message: '录屏已恢复'
      }
    } catch (err) {
      return {
        success: false,
        message: err.message
      }
    }
  }

  /**
   * 停止录屏（合并分段）
   */
  async stopRecording() {
    try {
      if (!this.isRecording) throw new Error('当前未在录屏')

      // 1. 停止当前分段
      if (!this.isPaused) {
        await this._stopSegmentRecording()
      }

      // 2. 合并所有分段
      if (this.tempSegments.length > 1) {
        await this._mergeSegments()
      } else if (this.tempSegments.length === 1) {
        // 只有一个分段，直接重命名
        fs.renameSync(this.tempSegments[0], this.savePath)
        this._cleanTempFiles()
      }

      // 3. 重置状态
      this.isRecording = false
      this.isPaused = false

      return {
        success: true,
        message: '录屏已停止并合并完成',
        savePath: this.savePath
      }
    } catch (err) {
      return {
        success: false,
        message: err.message,
        savePath: this.savePath
      }
    }
  }

  /**
   * 获取录屏状态
   */
  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      savePath: this.savePath,
      segmentCount: this.tempSegments.length,
      config: { ...this.recordingConfig }
    }
  }

  /**
   * 销毁实例
   */
  destroy() {
    if (this.isRecording) {
      this.stopRecording().catch(err => console.error('销毁时停止录屏失败:', err))
    }
    this._cleanTempFiles()
    this.recordingProcess = null
  }

  // ========== 辅助方法 ==========
  _getWindowTitleById(windowId) {
    const window = BrowserWindow.fromId(windowId)
    return window ? window.getTitle() : ''
  }

  _getWindowBoundsById(windowId) {
    const window = BrowserWindow.fromId(windowId)
    return window ? window.getBounds() : { x: 0, y: 0, width: 1920, height: 1080 }
  }
}

export default new VideoRecorder()