export function setupKeyboardListener(handlers) {
  const handleKeyDown = (e) => {
    // Ctrl+0
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      if (handlers.onCtrl0) handlers.onCtrl0();
    }
    
    // 字母C
    if (e.key === 'c' || e.key === 'C') {
      if (!e.ctrlKey && !e.metaKey) {
        if (handlers.onC) handlers.onC();
      }
    }
    
    // 空格
    if (e.key === ' ') {
      e.preventDefault();
      if (handlers.onSpace) handlers.onSpace();
    }
    
    // 上下方向键
    if (e.key === 'ArrowUp') {
      if (handlers.onArrowUp) handlers.onArrowUp(e);
    }
    
    if (e.key === 'ArrowDown') {
      if (handlers.onArrowDown) handlers.onArrowDown(e);
    }
    
    // 左右方向键（用于K线缩放）
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (handlers.onArrowLeftRight) handlers.onArrowLeftRight(e);
    }
    
    // 回车键
    if (e.key === 'Enter') {
      if (handlers.onEnter) handlers.onEnter(e);
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}