/**
 * 缓动函数集合
 */
export const Easing = {
  // 二次缓动
  quadratic: {
    in: (t) => t * t,
    out: (t) => t * (2 - t),
    inOut: (t) => {
      t *= 2;
      if (t < 1) return 0.5 * t * t;
      t--;
      return 0.5 * (1 - (--t) * t);
    }
  },

  // 三次缓动
  cubic: {
    in: (t) => t * t * t,
    out: (t) => {
      t--;
      return t * t * t + 1;
    },
    inOut: (t) => {
      t *= 2;
      if (t < 1) return 0.5 * t * t * t;
      t -= 2;
      return 0.5 * (t * t * t + 2);
    }
  },

  // 指数缓动
  exponential: {
    in: (t) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
    out: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inOut: (t) => {
      if (t === 0) return 0;
      if (t === 1) return 1;
      t *= 2;
      if (t < 1) return 0.5 * Math.pow(2, 10 * (t - 1));
      return 0.5 * (2 - Math.pow(2, -10 * (t - 1)));
    }
  },

  // 弹性缓动
  elastic: {
    in: (t) => {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    },
    out: (t) => {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
    }
  }
};

/**
 * 执行动画
 * @param {Object} options - 动画选项
 * @param {Function} options.duration - 动画时长(ms)
 * @param {Function} options.easing - 缓动函数
 * @param {Function} options.update - 更新回调，接收当前进度[0-1]
 * @param {Function} options.complete - 完成回调
 */
export function animate ({ duration = 300, easing = Easing.quadratic.out, update, complete }) {
  const startTime = performance.now();

  const tick = (currentTime) => {
    const elapsed = currentTime - startTime;
    let progress = Math.min(1, elapsed / duration);

    const easedProgress = easing(progress);
    update(easedProgress);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else if (complete) {
      complete();
    }
  };

  requestAnimationFrame(tick);
}

/**
 * 滑动动画
 * @param {HTMLElement} element - 目标元素
 * @param {Object} options - 选项
 * @param {string} options.direction - 方向 'left' | 'right' | 'up' | 'down'
 * @param {boolean} options.show - 显示或隐藏
 * @param {number} options.duration - 时长
 * @param {Function} options.onComplete - 完成回调
 */
export function slideAnimation (element, { direction = 'left', show = true, duration = 300, onComplete }) {
  if (!element) return;

  const style = getComputedStyle(element);
  const display = style.display;

  if (show) {
    element.style.display = display === 'none' ? 'block' : display;
  }

  let fromTransform = '';
  let toTransform = '';

  switch (direction) {
    case 'left':
      fromTransform = 'translateX(-100%)';
      toTransform = 'translateX(0)';
      break;
    case 'right':
      fromTransform = 'translateX(100%)';
      toTransform = 'translateX(0)';
      break;
    case 'up':
      fromTransform = 'translateY(-100%)';
      toTransform = 'translateY(0)';
      break;
    case 'down':
      fromTransform = 'translateY(100%)';
      toTransform = 'translateY(0)';
      break;
  }

  if (!show) {
    [fromTransform, toTransform] = [toTransform, fromTransform];
  }

  element.style.transform = fromTransform;
  element.style.transition = `transform ${duration}ms ease`;

  // 强制重绘
  element.offsetHeight;

  element.style.transform = toTransform;

  const onTransitionEnd = () => {
    element.style.transition = '';
    if (!show) {
      element.style.display = 'none';
    }
    if (onComplete) onComplete();
    element.removeEventListener('transitionend', onTransitionEnd);
  };

  element.addEventListener('transitionend', onTransitionEnd);
}

/**
 * 淡入淡出动画
 * @param {HTMLElement} element - 目标元素
 * @param {boolean} show - 显示或隐藏
 * @param {number} duration - 时长
 * @param {Function} onComplete - 完成回调
 */
export function fadeAnimation (element, show, duration = 200, onComplete) {
  if (!element) return;

  if (show) {
    element.style.display = 'block';
    element.style.opacity = '0';

    animate({
      duration,
      update: (progress) => {
        element.style.opacity = progress;
      },
      complete: () => {
        element.style.opacity = '';
        if (onComplete) onComplete();
      }
    });
  } else {
    animate({
      duration,
      update: (progress) => {
        element.style.opacity = 1 - progress;
      },
      complete: () => {
        element.style.display = 'none';
        element.style.opacity = '';
        if (onComplete) onComplete();
      }
    });
  }
}