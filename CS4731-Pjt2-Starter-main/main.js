function main() {
    // Retrieve <canvas> element
    let canvas = document.getElementById('webgl');

    // Get the rendering context for WebGL
    let gl = WebGLUtils.setupWebGL(canvas, undefined);

    //Check that the return value is not null.
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    // Set viewport
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Set clear color & enable depth testing
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // Initialize shaders
    let program = initShaders(gl, "vshader", "fshader");
    resizeCanvasToDisplaySize(gl.canvas);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);

    // Get the stop sign
    let stopSign = new Model(
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/stopsign.obj",
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/stopsign.mtl");

    // Get the lamp
    let lamp = new Model(
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/lamp.obj",
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/lamp.mtl");

    // Get the car
    let car = new Model(
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/car.obj",
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/car.mtl");

    // Get the street
    let street = new Model(
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/street.obj",
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/street.mtl");

    // Get the bunny (you will not need this one until Part II)
    let bunny = new Model(
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/bunny.obj",
        "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/bunny.mtl");

    // keep track of all models so we can render them later
    let models = [
        stopSign,
        lamp,
        car,
        street,
        bunny     // not used until Part II
    ];

    // attribute locations we'll use repeatedly
    const vPositionLoc = gl.getAttribLocation(program, "vPosition");
    const vNormalLoc = gl.getAttribLocation(program, "vNormal");
    const vColorLoc = gl.getAttribLocation(program, "vColor");

    // camera / projection
    let eye = vec3(0.0, 3.0, 7.0);          // moved up and back
    let at = vec3(0.0, 0.0, 0.0);
    let up = vec3(0.0, 1.0, 0.0);
    let view = lookAt(eye, at, up);
    let proj = perspective(45, canvas.width / canvas.height, 0.1, 100.0);
    let mvp = mult(proj, view);
    let uMVPLoc = gl.getUniformLocation(program, "uMVP");
    gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvp));

    // set lighting uniforms once
    let lightDir = vec3(3.0, 1.0, 1.0);
    let uLightDirLoc = gl.getUniformLocation(program, "uLightDirection");
    gl.uniform3fv(uLightDirLoc, flatten(lightDir));
    let uLightColorLoc = gl.getUniformLocation(program, "uLightColor");
    gl.uniform4fv(uLightColorLoc, flatten([1, 1, 1, 1]));
    let uAmbientLoc = gl.getUniformLocation(program, "uAmbientColor");
    gl.uniform4fv(uAmbientLoc, flatten([0.2, 0.2, 0.2, 1]));

    // render loop
    function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        models.forEach(m => {
            if (m.objParsed && m.mtlParsed) {
                if (!m._initialized) {            // first time only
                    initModelBuffers(gl, m);
                    m._initialized = true;
                }
                // bind position buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, m.vBuffer);
                gl.vertexAttribPointer(vPositionLoc, 4, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vPositionLoc);

                // bind normal buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, m.nBuffer);
                gl.vertexAttribPointer(vNormalLoc, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vNormalLoc);

                // bind color buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, m.cBuffer);
                gl.vertexAttribPointer(vColorLoc, 4, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vColorLoc);

                gl.drawArrays(gl.TRIANGLES, 0, m.numVertices);
            }
        });

        requestAnimFrame(render, canvas);
    }
    render();
}

/**
 * Flatten the face data and create a buffer on the GPU.
 * (You can expand this to upload normals/texcoords later.)
 */
function initModelBuffers(gl, model) {
    let verts = [];
    let colors = [];
    let normals = [];

    model.faces.forEach(face => {
        // look up diffuse color for this face, fallback white
        let c = model.diffuseMap.get(face.material) || [1,1,1,1];
        // each face.faceVertices is an array of vec*’s
        face.faceVertices.forEach((v,i) => {
            verts.push(v[0], v[1], v[2], v[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            // normals may be vec3 or vec4; if absent use (0,0,1)
            let n = [0,0,1];
            if(face.faceNormals.length) {
                let raw = face.faceNormals[i];
                n = [raw[0], raw[1], raw[2]];
            }
            normals.push(n[0], n[1], n[2]);
        });
    });

    model.numVertices = verts.length / 4;
    // position buffer
    model.vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW);
    // normal buffer
    model.nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
    // color buffer
    model.cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
}

function resizeCanvasToDisplaySize(canvas) {
  // Lookup the size the browser is displaying the canvas in CSS pixels.
  const displayWidth  = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
 
  // Check if the canvas is not the same size.
  const needResize = canvas.width  !== displayWidth ||
                     canvas.height !== displayHeight;
 
  if (needResize) {
    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
 
  return needResize;
}