/**
 * 命令基类 - 撤销重做命令模式
 */
class Command {
  constructor() { }
  // 执行操作
  execute() { }
  // 撤销操作
  undo() { }
  // 重做操作
  redo() { }
}

export default Command;