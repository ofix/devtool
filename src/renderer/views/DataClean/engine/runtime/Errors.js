// 运行时错误类型

export class DataCleanError extends Error {
  constructor(message, code = "DATA_CLEAN_ERROR") {
    super(message)
    this.name = "DataCleanError"
    this.code = code
  }
}

export class PortTypeError extends DataCleanError {
  constructor(message) {
    super(message, "PORT_TYPE_ERROR")
    this.name = "PortTypeError"
  }
}
