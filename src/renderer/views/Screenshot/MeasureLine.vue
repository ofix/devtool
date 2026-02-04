<template>
  <canvas
    ref="measureCanvas"
    class="measure-line-canvas"
    :width="canvasSize.width"
    :height="canvasSize.height"
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";

const windowOptions = ref(null);
const measureCanvas = ref(null);
const canvasSize = ref({ width: 10, height: 30 });

// WebGL核心缓存（持久化到GPU）
const glCache = ref({
  gl: null, // WebGL上下文
  program: null, // 着色器程序
  buffers: {
    // 各方向的顶点缓冲区
    top: null,
    bottom: null,
    left: null,
    right: null,
  },
  locations: {
    // 着色器变量位置
    a_position: -1,
    u_color: -1,
    u_matrix: -1,
  },
  matrix: new Float32Array(16), // 投影矩阵
});

/**
 * 获取主进程窗口配置
 */
const getWindowOptions = async () => {
  try {
    const options = await window.channel?.getWindowOptions("MeasureLineWnd");
    windowOptions.value = options;
    updateCanvasSize(options?.direction || "top");
    // 初始化WebGL（仅一次）+ 渲染对应方向
    await initWebGL();
    renderLineWithWebGL(options?.direction || "top");
    return options;
  } catch (error) {
    console.error("获取窗口选项失败:", error);
    return {};
  }
};

/**
 * 监听窗口配置更新
 */
const setupOptionsListener = () => {
  window.channel.on("window-options", (event, newOptions) => {
    windowOptions.value = newOptions;
    updateCanvasSize(newOptions?.direction || "top");
    // 仅切换渲染方向，无需重新初始化WebGL
    renderLineWithWebGL(newOptions?.direction || "top");
  });
};

/**
 * 动态更新Canvas尺寸
 */
const updateCanvasSize = (direction) => {
  if (direction === "top" || direction === "bottom") {
    canvasSize.value = { width: 10, height: 30 };
  } else {
    canvasSize.value = { width: 30, height: 10 };
  }

  if (measureCanvas.value) {
    const canvas = measureCanvas.value;
    canvas.style.width = `${canvasSize.value.width}px`;
    canvas.style.height = `${canvasSize.value.height}px`;
    canvas.width = canvasSize.value.width;
    canvas.height = canvasSize.value.height;

    // 更新WebGL视口（适配尺寸变化）
    if (glCache.value.gl) {
      glCache.value.gl.viewport(0, 0, canvas.width, canvas.height);
      updateProjectionMatrix(direction);
    }
  }
};

/**
 * 初始化WebGL（仅执行一次，上传所有数据到GPU）
 */
const initWebGL = async () => {
  if (glCache.value.program) return; // 已初始化则直接返回

  const canvas = measureCanvas.value;
  if (!canvas) return;

  // 1. 创建WebGL上下文（Electron环境兼容）
  const gl =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    console.error("当前环境不支持WebGL");
    return;
  }
  glCache.value.gl = gl;

  // 2. 编译着色器程序
  const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    `
      attribute vec2 a_position;
      uniform mat4 u_matrix;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
        gl_PointSize = 1.0;
      }
    `
  );
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `
  );
  const program = createProgram(gl, vertexShader, fragmentShader);
  glCache.value.program = program;

  // 3. 获取着色器变量位置
  glCache.value.locations.a_position = gl.getAttribLocation(
    program,
    "a_position"
  );
  glCache.value.locations.u_color = gl.getUniformLocation(program, "u_color");
  glCache.value.locations.u_matrix = gl.getUniformLocation(program, "u_matrix");

  // 4. 定义4个方向的顶点数据（与原Canvas逻辑1:1对应）
  const lineColor = [1.0, 0.0, 0.0, 1.0]; // 红色（对应#ff0000）

  // Top方向：竖线(5,0)-(5,25) + 三角形(5,25)-(0,30)-(10,30)
  const topVertices = new Float32Array([
    5,
    0,
    5,
    25, // 竖线
    5,
    25,
    0,
    30,
    10,
    30, // 三角形
  ]);
  glCache.value.buffers.top = createBuffer(gl, topVertices);

  // Bottom方向：竖线(5,5)-(5,30) + 三角形(5,5)-(0,0)-(10,0)
  const bottomVertices = new Float32Array([
    5,
    5,
    5,
    30, // 竖线
    5,
    5,
    0,
    0,
    10,
    0, // 三角形
  ]);
  glCache.value.buffers.bottom = createBuffer(gl, bottomVertices);

  // Left方向：横线(0,5)-(25,5) + 三角形(25,5)-(30,0)-(30,10)
  const leftVertices = new Float32Array([
    0,
    5,
    25,
    5, // 横线
    25,
    5,
    30,
    0,
    30,
    10, // 三角形
  ]);
  glCache.value.buffers.left = createBuffer(gl, leftVertices);

  // Right方向：横线(5,5)-(30,5) + 三角形(5,5)-(0,0)-(0,10)
  const rightVertices = new Float32Array([
    5,
    5,
    30,
    5, // 横线
    5,
    5,
    0,
    0,
    0,
    10, // 三角形
  ]);
  glCache.value.buffers.right = createBuffer(gl, rightVertices);

  // 5. 初始化WebGL状态
  gl.useProgram(program);
  gl.clearColor(0.0, 0.0, 0.0, 0.0); // 透明背景
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
};

/**
 * 更新投影矩阵（适配Canvas坐标到WebGL标准化设备坐标）
 */
const updateProjectionMatrix = (direction) => {
  const gl = glCache.value.gl;
  const { width, height } = canvasSize.value;

  // 正交投影矩阵：将Canvas像素坐标(0,0)到(width,height)映射到WebGL的(-1,-1)到(1,1)
  const matrix = glCache.value.matrix;
  matrix.set([
    2 / width,
    0,
    0,
    0,
    0,
    -2 / height,
    0,
    0,
    0,
    0,
    1,
    0,
    -1,
    1,
    0,
    1,
  ]);

  gl.uniformMatrix4fv(glCache.value.locations.u_matrix, false, matrix);
};

/**
 * 渲染指定方向的游标线（仅切换GPU缓存的顶点数据，无重复上传）
 */
const renderLineWithWebGL = (direction) => {
  const gl = glCache.value.gl;
  if (!gl || !glCache.value.buffers[direction]) return;

  // 1. 清空画布
  gl.clear(gl.COLOR_BUFFER_BIT);

  // 2. 更新投影矩阵（适配当前尺寸）
  updateProjectionMatrix(direction);

  // 3. 绑定对应方向的顶点缓冲区（GPU缓存复用）
  const buffer = glCache.value.buffers[direction];
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(glCache.value.locations.a_position);
  gl.vertexAttribPointer(
    glCache.value.locations.a_position,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );

  // 4. 设置颜色（与原代码一致）
  gl.uniform4fv(glCache.value.locations.u_color, [1.0, 0.0, 0.0, 1.0]);

  // 5. 绘制：先绘线条（2个顶点=1条线），再绘三角形（3个顶点=1个面）
  const { width, height } = canvasSize.value;
  if (direction === "top" || direction === "bottom") {
    gl.drawArrays(gl.LINES, 0, 2); // 竖线
    gl.drawArrays(gl.TRIANGLES, 2, 3); // 三角形
  } else {
    gl.drawArrays(gl.LINES, 0, 2); // 横线
    gl.drawArrays(gl.TRIANGLES, 2, 3); // 三角形
  }
};

// ========== WebGL工具函数 ==========
/**
 * 创建并编译着色器
 */
const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("着色器编译失败:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

/**
 * 创建着色器程序
 */
const createProgram = (gl, vertexShader, fragmentShader) => {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("程序链接失败:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

/**
 * 创建GPU顶点缓冲区（数据永久缓存）
 */
const createBuffer = (gl, data) => {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); // STATIC_DRAW：数据仅上传一次，多次绘制
  return buffer;
};

onMounted(async () => {
  await getWindowOptions();
  setupOptionsListener();
});

onUnmounted(() => {
  // 释放WebGL资源（Electron内存管理）
  const gl = glCache.value.gl;
  if (gl) {
    Object.values(glCache.value.buffers).forEach((buffer) => {
      if (buffer) gl.deleteBuffer(buffer);
    });
    if (glCache.value.program) gl.deleteProgram(glCache.value.program);
  }

  // 清理事件监听
  if (window.channel) window.channel.off("window-options");

  // 重置缓存
  glCache.value = {
    gl: null,
    program: null,
    buffers: { top: null, bottom: null, left: null, right: null },
    locations: { a_position: -1, u_color: -1, u_matrix: -1 },
    matrix: new Float32Array(16),
  };
  measureCanvas.value = null;
});
</script>

<style type="scss" scoped>
.measure-line-canvas {
  display: block;
  border: none;
  outline: none;
  background: transparent;
  pointer-events: none;
  cursor: none !important;
}
</style>
