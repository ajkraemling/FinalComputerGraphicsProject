function main() {
    // Retrieve <canvas> element testing
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

    // provide model view separately for lighting calculations 
    let uMVLoc = gl.getUniformLocation(program, "uMV");
    gl.uniformMatrix4fv(uMVLoc, false, flatten(view));

    // set lighting uniforms 
    let lightDirWorld = vec3(3.0, 1.0, 1.0);
    // transform direction to eye-space
    let lightDirEye4 = mult(view, vec4(lightDirWorld[0], lightDirWorld[1], lightDirWorld[2], 0.0));
    let lightDirEye = vec3(lightDirEye4[0], lightDirEye4[1], lightDirEye4[2]);
    let uLightDirLoc = gl.getUniformLocation(program, "uLightDirection");
    gl.uniform3fv(uLightDirLoc, flatten(normalize(lightDirEye)));

    gl.uniform4fv(gl.getUniformLocation(program, "lightDiffuse"), flatten([1.5, 1.5, 1.5, 1]));
    gl.uniform4fv(gl.getUniformLocation(program, "lightSpecular"), flatten([1, 1, 1, 1]));
    gl.uniform4fv(gl.getUniformLocation(program, "lightAmbient"), flatten([0.2, 0.2, 0.2, 1]));
    // ambient defaults
    gl.uniform4fv(gl.getUniformLocation(program, "materialSpecular"), flatten([0.5, 0.5, 0.5, 1]));
    gl.uniform4fv(gl.getUniformLocation(program, "materialAmbient"), flatten([0.2, 0.2, 0.2, 1]));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), 32.0);

    // Cube subdivision control 
    let cubeSubdivisions = 0;
    const maxCubeSubdivisions = 5;

    // storage per subdivision level
    let cubeFinalPointsArray = [];   // positions per level
    let cubeFinalNormalsArray = [];  // smooth normals per level
    // GPU buffers for current level
    let cubePosBuffer = null;
    let cubeNorBuffer = null;
    let cubeColBuffer = null;
    let cubeNumVertices = 0;

    // create a unit cube projected onto unit sphere 
    function makeUnitCubeTriangles() {
        const s = 0.5;
        // define 8 vertices of a cube
        const v = [
            vec4(-s, -s, s, 1.0), // 0
            vec4( s, -s, s, 1.0), // 1
            vec4( s, s, s, 1.0), // 2
            vec4(-s, s, s, 1.0), // 3
            vec4(-s, -s, -s, 1.0), // 4
            vec4( s, -s, -s, 1.0), // 5
            vec4( s, s, -s, 1.0), // 6
            vec4(-s, s, -s, 1.0) // 7
        ];

        // allow cube to refine toward sphere by normalizing vertices
        for (let i = 0; i < v.length; i++) {
            v[i] = normalize(v[i], true);
        }

        // Each face has two triangles (12 triangles total for cube, 6 x 2 = 12)
        const tris = [
            [v[0], v[1], v[2]], [v[0], v[2], v[3]],
            [v[5], v[4], v[7]], [v[5], v[7], v[6]],
            [v[1], v[5], v[6]], [v[1], v[6], v[2]],
            [v[4], v[0], v[3]], [v[4], v[3], v[7]],
            [v[3], v[2], v[6]], [v[3], v[6], v[7]],
            [v[4], v[5], v[1]], [v[4], v[1], v[0]]
        ];

        return tris;
    }

    // triangle helper for vertices
    function triangle(a, b, c, pts, nors) {
         pts.push(a);
         pts.push(b);
         pts.push(c);

         // normals are vertex positions
         nors.push(vec3(a[0],a[1], a[2]));
         nors.push(vec3(b[0],b[1], b[2]));
         nors.push(vec3(c[0],c[1], c[2]));
    }

    function divideTriangle(a, b, c, count, pts, nors) {
        if ( count > 0 ) {

            let ab = mix( a, b, 0.5);
            let ac = mix( a, c, 0.5);
            let bc = mix( b, c, 0.5);

            // Project midpoints to unit sphere for refinement toward sphere
            ab = normalize(ab, true);
            ac = normalize(ac, true);
            bc = normalize(bc, true);

            divideTriangle( a, ab, ac, count - 1, pts, nors );
            divideTriangle( ab, b, bc, count - 1, pts, nors );
            divideTriangle( bc, c, ac, count - 1, pts, nors );
            divideTriangle( ab, bc, ac, count - 1, pts, nors );
        }
        else {
            triangle( a, b, c, pts, nors );
        }
    }

    // Precompute subdivision levels 0 to maxCubeSubdivisions
    function prepareCubeSubdivisionLevels(maxLevel) {
        cubeFinalPointsArray = [];
        cubeFinalNormalsArray = [];

        const tris = makeUnitCubeTriangles();

        for (let level = 0; level <= maxLevel; level++) {
            const pts = [];
            const nors = [];

            if (level === 0) {
                for (const t of tris) {
                    triangle(t[0], t[1], t[2], pts, nors);
                }
            } else {
                for (const t of tris) {
                    divideTriangle(t[0], t[1], t[2], level, pts, nors);
                }
            }

            cubeFinalPointsArray.push(pts.slice());  // array of vec4s

            // when normals might be vec3s already
            cubeFinalNormalsArray.push(nors.slice());
        }
    }

    function createBufferForArray(data, size) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(data), gl.STATIC_DRAW);
        return buffer;
    }

    // Upload buffers for current cubeSubdivisions
    function updateCubeBuffersForSubdivision(level) {
        // free previous buffers if present on GPU
        if (cubePosBuffer) { gl.deleteBuffer(cubePosBuffer); cubePosBuffer = null; }
        if (cubeNorBuffer) { gl.deleteBuffer(cubeNorBuffer); cubeNorBuffer = null; }
        if (cubeColBuffer) { gl.deleteBuffer(cubeColBuffer); cubeColBuffer = null; }

        const pts = cubeFinalPointsArray[level];
        const nors = cubeFinalNormalsArray[level];

        cubeNumVertices = pts.length;

        // color of cube
        const color = [0.9, 0.6, 0.2, 1.0];
        const cols = [];
        for (let i = 0; i < cubeNumVertices; i++) cols.push(color);

        cubePosBuffer = createBufferForArray(pts, 4);
        // normals are vec3
        cubeNorBuffer = createBufferForArray(nors, 3);
        cubeColBuffer = createBufferForArray(cols, 4);
    }

    // prepare cube subdivision levels 
    prepareCubeSubdivisionLevels(maxCubeSubdivisions);
    // initialize buffers for level 0
    updateCubeBuffersForSubdivision(cubeSubdivisions);

    // keyboard handler
    window.addEventListener('keydown', function (e) {
        const key = e.key.toUpperCase();
        switch (key) {
            case "K": // increase subdivisions 
                if (cubeSubdivisions < maxCubeSubdivisions) {
                    cubeSubdivisions += 1;
                    updateCubeBuffersForSubdivision(cubeSubdivisions);
                }
                break;
            case "J": // decrease subdivisions
                if (cubeSubdivisions > 0) {
                    cubeSubdivisions -= 1;
                    updateCubeBuffersForSubdivision(cubeSubdivisions);
                }
                break;
        }
    });

    // render loop
    function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Draw subdividable cube to the right of center
        if (cubePosBuffer && cubeNorBuffer && cubeColBuffer) {
            // model transform
            const model = mult(translate(2.0, 1.0, 0.0), rotate(45, 0, 1, 0), scalem(1.0, 1.0, 1.0));
            const mvpModel = mult(mvp, model);         
            const mvModel = mult(view, model);         

            gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvpModel));
            gl.uniformMatrix4fv(uMVLoc, false, flatten(mvModel));

            // bind position
            gl.bindBuffer(gl.ARRAY_BUFFER, cubePosBuffer);
            gl.vertexAttribPointer(vPositionLoc, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vPositionLoc);

            // bind normals
            gl.bindBuffer(gl.ARRAY_BUFFER, cubeNorBuffer);
            gl.vertexAttribPointer(vNormalLoc, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vNormalLoc);

            // bind colors
            gl.bindBuffer(gl.ARRAY_BUFFER, cubeColBuffer);
            gl.vertexAttribPointer(vColorLoc, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vColorLoc);

            gl.drawArrays(gl.TRIANGLES, 0, cubeNumVertices);

            // restore global uMVP/uMV for the rest of the scene 
            gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvp));
            gl.uniformMatrix4fv(uMVLoc, false, flatten(view));
        }

        // Draw loaded OBJ models 
        models.forEach(m => {
            if (m.objParsed && m.mtlParsed) {
                if (!m._initialized) {            
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

//Flatten the face data and create a buffer on the GPU
function initModelBuffers(gl, model) {
    // preserved original full-resolution behavior in case code relies on it
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
            // normals may be vec3 or vec4, use (0,0,1) if not present
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
  // set the display size
  const displayWidth  = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
 
  // check if the canvas is not the same size
  const needResize = canvas.width  !== displayWidth ||
                     canvas.height !== displayHeight;
 
  if (needResize) {
    // make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
 
  return needResize;
}