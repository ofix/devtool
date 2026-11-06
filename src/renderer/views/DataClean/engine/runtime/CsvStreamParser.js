import Papa from "papaparse"

export default class CsvStreamParser {
  constructor(filePath, taskContext, options = {}) {
    this.filePath = filePath
    this.ctx = taskContext
    this.encoding = options.encoding || "utf-8"
    this.hasHeader = options.hasHeader !== false

    this.streamId = null
    this.decoder = new TextDecoder(this.encoding)

    this.inQuote = false
    this.textBuffer = ""
    this.pendingRows = []
    this.isDone = false
    this.isStreamStopped = false

    this.columns = []
    this.headerFields = null
    this.resolveHeaderReady = null
    this.headerReadyPromise = new Promise(resolve => {
      this.resolveHeaderReady = resolve
    })

    this.currentResolver = null
  }

  async start() {
    if (this.ctx?.signal?.aborted) {
      this.isStreamStopped = true
      this._safeResolveHeader()
      return
    }

    if (this.ctx?.signal) {
      this.ctx.signal.addEventListener("abort", () => this.stop(), { once: true })
    }

    const oldDestroy = this.ctx?.onDestroy
    this.ctx.onDestroy = () => {
      this.stop()
      oldDestroy?.()
    }

    try {
      this.streamId = await window.api.dataClean.fs.startStream(this.filePath)
    } catch (err) {
      this.isDone = true
      this._safeResolveHeader()
      throw err
    }

    window.api.dataClean.fs.onStreamData(this.streamId, chunk => {
      if (this.isStreamStopped) return
      if (this.ctx?.markFirstChunk) this.ctx.markFirstChunk()

      const text = this.decoder.decode(chunk, { stream: true })
      if (text) this._processText(text)
    })

    window.api.dataClean.fs.onStreamEnd(this.streamId, () => {
      if (this.isStreamStopped) return
      // 刷尾
      const finalText = this.decoder.decode(new Uint8Array(), { stream: false })
      if (finalText) this._processText(finalText)

      if (this.textBuffer) {
        this._onCompleteBlock(this.textBuffer)
        this.textBuffer = ""
      }
      this.isDone = true
      this._wakeupConsumer()
    })

    window.api.dataClean.fs.onStreamError(this.streamId, err => {
      console.error("[CsvParser] stream error", err)
      this.isDone = true
      this._safeResolveHeader()
      this._wakeupConsumer()
    })
  }

  _processText(text) {
    this.textBuffer += text
    let pos = 0
    const len = this.textBuffer.length
    for (; pos < len; pos++) {
      const ch = this.textBuffer[pos]
      if (ch === '"') {
        if (pos + 1 < len && this.textBuffer[pos + 1] === '"') {
          pos++
          continue
        }
        this.inQuote = !this.inQuote
      }
      if (!this.inQuote) {
        if (ch === "\r" && pos + 1 < len && this.textBuffer[pos + 1] === "\n") {
          const block = this.textBuffer.slice(0, pos + 2)
          this.textBuffer = this.textBuffer.slice(pos + 2)
          pos = 0
          this._onCompleteBlock(block)
          continue
        }
        if (ch === "\n") {
          const block = this.textBuffer.slice(0, pos + 1)
          this.textBuffer = this.textBuffer.slice(pos + 1)
          pos = 0
          this._onCompleteBlock(block)
        }
      }
    }
  }

  _onCompleteBlock(block) {
    if (this.headerFields === null) {
      return this._detectHeader(block)
    }
    this._parseChunk(block)
  }

  _detectHeader(block) {
    const preview = Papa.parse(block, { header: false, preview: 1, skipEmptyLines: false })
    if (!preview.data || preview.data.length === 0) return

    const firstRow = preview.data[0]
    if (this.hasHeader) {
      this._parseHeader(firstRow)
      // 兼容 CRLF / LF
      let nlPos = block.indexOf("\r\n")
      let offset = 2
      if (nlPos === -1) {
        nlPos = block.indexOf("\n")
        offset = 1
      }
      if (nlPos !== -1) {
        const restBlock = block.slice(nlPos + offset)
        if (restBlock.trim()) {
          this._parseChunk(restBlock)
        }
      }
    } else {
      this._parseHeader([], firstRow.length)
      this._parseChunk(block)
    }
  }

  _parseHeader(fields = [], fallbackCount = 0) {
    if (this.headerFields !== null) return
    if (Array.isArray(fields) && fields.length > 0) {
      this.headerFields = fields.map(f => String(f).trim())
    } else {
      const count = fallbackCount || 10
      this.headerFields = Array.from({ length: count }, (_, i) => `col_${i}`)
    }
    this.columns = this.headerFields.map(name => ({ name, type: "string" }))
    this.resolveHeaderReady()
  }

  _parseChunk(textToParse) {
    if (!textToParse.trim()) return
    Papa.parse(textToParse, {
      header: false,
      skipEmptyLines: true,
      step: results => {
        const rowArray = results.data
        const rowObject = {}
        this.headerFields.forEach((field, idx) => {
          const val = rowArray[idx]
          rowObject[field] = val !== undefined ? String(val).trim() : null
        })
        this.pendingRows.push(rowObject)
      },
      complete: () => {
        this._wakeupConsumer()
      },
    })
  }

  _safeResolveHeader() {
    if (this.headerFields === null) {
      this._parseHeader([], 0)
    }
    this.resolveHeaderReady()
  }

  _wakeupConsumer() {
    if (!this.currentResolver) return
    if (this.pendingRows.length > 0) {
      const chunk = this.pendingRows
      this.pendingRows = []
      this.currentResolver({ value: chunk, done: false })
      this.currentResolver = null
    } else if (this.isDone) {
      this.currentResolver({ done: true })
      this.currentResolver = null
    }
  }

  async *createIterator() {
    await this.headerReadyPromise
    try {
      while (true) {
        if (this.ctx?.signal?.aborted) return
        if (this.pendingRows.length > 0) {
          const chunk = this.pendingRows
          this.pendingRows = []
          if (this.ctx?.metrics) this.ctx.metrics.mainRows += chunk.length
          yield { columns: this.columns, rows: chunk }
        } else if (this.isDone) {
          break
        } else {
          const next = await new Promise(resolve => {
            this.currentResolver = resolve
          })
          if (next.done) break
          if (this.ctx?.metrics) this.ctx.metrics.mainRows += next.value.length
          yield { columns: this.columns, rows: next.value }
        }
      }
    } finally {
      this.stop()
    }
  }

  stop() {
    if (this.isStreamStopped) return
    this.isStreamStopped = true
    if (this.streamId) {
      window.api.dataClean.fs.abortStream(this.streamId)
    }
    if (this.ctx?.onDestroy) this.ctx.onDestroy()
    if (this.currentResolver) {
      this.currentResolver({ done: true })
      this.currentResolver = null
    }
  }
}
