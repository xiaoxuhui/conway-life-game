(function exposeLifeStackRenderer(root) {
  "use strict";

  const VERTEX_SOURCE = `#version 300 es
    layout(location = 0) in vec4 vertex;
    layout(location = 1) in vec4 instance;
    uniform vec3 eye;
    uniform vec3 right;
    uniform vec3 up;
    uniform vec3 forward;
    uniform vec4 projection;
    out vec3 color;

    void main() {
      vec3 point = vertex.xyz + instance.xyz - eye;
      float depth = dot(point, forward);
      gl_Position = vec4(dot(point, right) * projection.x, dot(point, up) * projection.y,
                         depth * projection.z + projection.w, depth);
      color = mix(vec3(0.26, 0.62, 0.94), vec3(0.40, 0.96, 0.68), instance.w) * vertex.w;
    }`;

  const FRAGMENT_SOURCE = `#version 300 es
    precision mediump float;
    in vec3 color;
    out vec4 pixel;
    void main() { pixel = vec4(color, 1.0); }`;

  function createProgram(gl) {
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX_SOURCE], [gl.FRAGMENT_SHADER, FRAGMENT_SOURCE]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function cubeVertices() {
    const half = 0.43;
    const corners = [
      [-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half],
      [-half, half, -half], [half, half, -half], [half, half, half], [-half, half, half],
    ];
    const faces = [
      [0, 1, 2, 3, 0.49], [4, 7, 6, 5, 1.0],
      [0, 4, 5, 1, 0.83], [3, 2, 6, 7, 0.68],
      [0, 3, 7, 4, 0.62], [1, 5, 6, 2, 0.76],
    ];
    return faces.flatMap(([a, b, c, d, light]) => [a, b, c, a, c, d].flatMap((index) => [...corners[index], light]));
  }

  function layerVertices(columns, rows) {
    const x = columns / 2;
    const z = rows / 2;
    const corners = [[-x, -0.5, -z], [x, -0.5, -z], [x, -0.5, z], [-x, -0.5, z]];
    return [0, 1, 1, 2, 2, 3, 3, 0].flatMap((index) => [...corners[index], 0.31]);
  }

  function createMesh(gl, vertices) {
    const vao = gl.createVertexArray();
    const geometry = gl.createBuffer();
    const instances = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    return { vao, geometry, instances, vertexCount: vertices.length / 4 };
  }

  function create(canvas) {
    const gl = canvas.getContext("webgl2", { alpha: false });
    if (!gl) return null;
    const program = createProgram(gl);
    if (!program) return null;
    const uniforms = Object.fromEntries(
      ["eye", "right", "up", "forward", "projection"].map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    const cubes = createMesh(gl, cubeVertices());
    const planes = createMesh(gl, layerVertices(1, 1));
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(8 / 255, 13 / 255, 12 / 255, 1);
    let cubeCount = 0;
    let layerCount = 0;
    let radius = 1;

    function setStack(stack) {
      layerCount = stack?.layers.length ?? 0;
      cubeCount = 0;
      if (!stack) return;
      const { minRow, maxRow, minColumn, maxColumn } = stack.bounds;
      const rows = maxRow - minRow + 1;
      const columns = maxColumn - minColumn + 1;
      const layerGap = Math.max(1.12, Math.max(rows, columns) / 24);
      const rise = (layerCount - 1) * layerGap;
      radius = Math.hypot(columns, rows, rise + 1) / 2;
      const positions = new Float32Array(stack.layers.reduce((total, cells) => total + cells.length, 0) * 4);
      const levels = new Float32Array(layerCount * 4);
      stack.layers.forEach((cells, layer) => {
        const y = layer * layerGap - rise / 2;
        const age = layer / (layerCount - 1);
        levels.set([0, y, 0, age], layer * 4);
        for (const [row, column] of cells) {
          const offset = cubeCount * 4;
          positions[offset] = column - minColumn - (columns - 1) / 2;
          positions[offset + 1] = y;
          positions[offset + 2] = row - minRow - (rows - 1) / 2;
          positions[offset + 3] = age;
          cubeCount += 1;
        }
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, planes.geometry);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(layerVertices(columns, rows)), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, planes.instances);
      gl.bufferData(gl.ARRAY_BUFFER, levels, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, cubes.instances);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    }

    function draw({ yaw, tilt, x, y, z }) {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const density = Math.min(root.devicePixelRatio || 1, 2);
      const width = Math.round(clientWidth * density);
      const height = Math.round(clientHeight * density);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!layerCount) return;

      const aspect = width / height;
      const halfFov = Math.PI / 8;
      const tangent = Math.tan(halfFov);
      const halfFitAngle = Math.atan(tangent * Math.min(aspect, 1));
      const distance = radius * 1.06 / Math.sin(halfFitAngle);
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const sinTilt = Math.sin(tilt);
      const cosTilt = Math.cos(tilt);
      const backX = sinYaw * cosTilt;
      const backZ = cosYaw * cosTilt;
      const near = 0.05;
      const far = distance + Math.hypot(x, y, z) + radius * 3 + 1;
      gl.uniform3f(uniforms.eye, x + distance * backX, y + distance * sinTilt, z + distance * backZ);
      gl.uniform3f(uniforms.right, cosYaw, 0, -sinYaw);
      gl.uniform3f(uniforms.up, -sinYaw * sinTilt, cosTilt, -cosYaw * sinTilt);
      gl.uniform3f(uniforms.forward, -backX, -sinTilt, -backZ);
      gl.uniform4f(uniforms.projection, 1 / (aspect * tangent), 1 / tangent,
        (far + near) / (far - near), -2 * far * near / (far - near));
      gl.bindVertexArray(planes.vao);
      gl.drawArraysInstanced(gl.LINES, 0, planes.vertexCount, layerCount);
      if (cubeCount) {
        gl.bindVertexArray(cubes.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, cubes.vertexCount, cubeCount);
      }
    }

    return { setStack, draw, get radius() { return radius; } };
  }

  root.LifeStackRenderer = Object.freeze({ create });
})(globalThis);
