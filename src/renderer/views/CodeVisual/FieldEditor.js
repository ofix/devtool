export class FieldEditor {
    constructor(core, onFieldChange) {
      this.canvasCore = core;
      this.onFieldChange = onFieldChange; // 字段修改回调，触发重绘
      this.maxChar = 20;
      this.editDom = null;
      this.currentField = null;
    }
  
    // 创建悬浮输入DOM
    createInputDom() {
      if (this.editDom) return this.editDom;
      const input = document.createElement('textarea');
      input.style.position = 'fixed';
      input.style.zIndex = 9999;
      input.style.fontSize = '16px';
      input.style.border = '1px solid #409eff';
      input.style.padding = '4px';
      input.style.minWidth = '120px';
      input.maxLength = this.maxChar;
      document.body.appendChild(input);
  
      // 输入实时截断
      input.addEventListener('input', () => {
        if (input.value.length > this.maxChar) {
          input.value = input.value.slice(0, this.maxChar);
        }
      });
  
      // 粘贴大段文字截断
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteText = e.clipboardData.getData('text').slice(0, this.maxChar);
        input.value = pasteText;
      });
  
      // 失去焦点确认修改
      input.addEventListener('blur', () => {
        this.confirmEdit(input.value.trim());
      });
      // 回车确认
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.confirmEdit(input.value.trim());
        }
      });
  
      this.editDom = input;
      return input;
    }
  
    // 唤起编辑框
    startEdit(fieldItem, screenX, screenY) {
      this.currentField = fieldItem;
      const input = this.createInputDom();
      input.value = fieldItem.content;
      // 定位到鼠标屏幕坐标
      input.style.left = `${screenX}px`;
      input.style.top = `${screenY}px`;
      input.focus();
    }
  
    // 确认编辑，销毁输入框，回调更新字段
    confirmEdit(newContent) {
      if (!this.currentField || !this.editDom) return;
      this.currentField.content = newContent;
      this.onFieldChange(); // 通知画布重新计算表格宽度、重绘
      this.editDom.style.display = 'none';
      this.currentField = null;
    }
  }