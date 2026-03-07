// EXTRA CREDIT
// Our jumping decelerates the character after setting an initial upward jump force
// Our character collides with the floor and the top of objects, preventing him from falling infinitely
function main() {
    let canvas = document.getElementById('webgl');
    let gl = WebGLUtils.setupWebGL(canvas, undefined);
    if (!gl) { console.log('Failed to get the rendering context for WebGL'); return; }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let program = initShaders(gl, "vshader", "fshader");
    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);

    // MODELS
    let lamp = new Model("data/street_light.obj", "data/street_light.mtl");
    let body = new Model("data/knight_body.obj",  "data/knight_body.mtl");
    let head = new Model("data/knight_head.obj",  "data/knight_head.mtl");
    let sword = new Model("data/knight_sword.obj", "data/knight_sword.mtl");
    let dog = new Model("data/dog.obj", "data/dog.mtl");
    dog.textured = true;
    dog.imagePath = "data/dogtexture.png";
    let street = new Model("data/mini_tiles.obj","data/mini_tiles.mtl");
    let dirtmouthBuildings = new Model("data/dirtmouth_buildings_blend.obj", "data/dirtmouth_buildings_blend.mtl");
    let models = [lamp, street, body, head, sword, dirtmouthBuildings, dog];

    // CHARACTER STATE
    let characterPos = vec3(0.0, 0.0, 0.0);
    let bodyAngle = 0.0;           
    let headTilt = 0.0; 
    let characterVelY = 0.0;
    let characterOnGround = false;
    const CHARACTER_SPEED = 0.15;
    const CHARACTER_TURN_SPEED = 2.0;
    const CHARACTER_Y_OFFSET = 1.0;
    const GRAVITY = -0.005;
    const JUMP_FORCE = 0.25;
    let swordPointing = false;
    // head tilt parameters
    const HEAD_TILT_SPEED = 5.0;        // degrees per frame when Q/E held
    const HEAD_TILT_LIMIT = 30.0;       // max tilt left/right

    const keys = {};
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);

    // CAMERA CONTROLS (pointer lock)
    let cameraAzimuth = 180.0;      // horizontal rotation around character (degrees)
    let cameraElevation = 20.0;     // vertical angle (degrees)
    let cameraDistance = Math.sqrt(34); // distance from character
    let isPointerLocked = false;
    let pointerLockInfo = document.getElementById('pointerLockInfo');

    // Request pointer lock on canvas click
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();
    });

    // Pan camera with locked mouse movement
    canvas.addEventListener('mousemove', (e) => {
        if (!isPointerLocked) return;
        let sensitivity = 0.75;
        cameraAzimuth   += e.movementX * sensitivity;
        cameraElevation += e.movementY * sensitivity;
        // clamp elevation to prevent flipping
        cameraElevation = Math.max(-80, Math.min(80, cameraElevation));
        e.preventDefault();
    });

    // Track pointer lock state
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = (document.pointerLockElement === canvas ||
                           document.mozPointerLockElement === canvas);
        if (pointerLockInfo) {
            pointerLockInfo.classList.toggle('locked', isPointerLocked);
        }
    });
    document.addEventListener('mozpointerlockchange', () => {
        isPointerLocked = (document.pointerLockElement === canvas ||
                           document.mozPointerLockElement === canvas);
        if (pointerLockInfo) {
            pointerLockInfo.classList.toggle('locked', isPointerLocked);
        }
    });

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // sword-pointing toggle on left click
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) swordPointing = true;
    });
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) swordPointing = false;
    });

    let view = lookAt(vec3(0, 3, 7), vec3(0, 0, 0), vec3(0, 1, 0));
    let proj = perspective(45, canvas.width / canvas.height, 0.1, 1000.0);
    let mvp = mult(proj, view);

    const vPositionLoc = gl.getAttribLocation(program, "vPosition");
    const vNormalLoc = gl.getAttribLocation(program, "vNormal");
    const vColorLoc = gl.getAttribLocation(program, "vColor");
    const vTexCoordLoc = gl.getAttribLocation(program, "vTexCoord");
    const uTexturedLoc = gl.getUniformLocation(program, "uTextured");
    const uSamplerLoc = gl.getUniformLocation(program, "uSampler");
    let uMVPLoc = gl.getUniformLocation(program, "uMVP");
    const uSkyboxMVPLoc = gl.getUniformLocation(program, "uSkyboxMVP");
    const uSkySamplerLoc = gl.getUniformLocation(program, "uSkySampler");
    const isSkyboxLoc = gl.getUniformLocation(program, "isSkybox");
    const uMVLoc = gl.getUniformLocation(program, "uMV");
    gl.uniformMatrix4fv(uMVLoc, false, flatten(view));
    gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvp));

    // set lighting uniforms 
    let lightDirWorld = vec3(3.0, 1.0, 1.0);
    // transform direction to eye-space
    let lightDirEye4 = mult(view, vec4(lightDirWorld[0], lightDirWorld[1], lightDirWorld[2], 0.0));
    let lightDirEye = vec3(lightDirEye4[0], lightDirEye4[1], lightDirEye4[2]);
    let uLightDirLoc = gl.getUniformLocation(program, "uLightDirection");
    gl.uniform3fv(uLightDirLoc, flatten(normalize(lightDirEye)));

    gl.uniform3fv(gl.getUniformLocation(program, "uLightDirection"), flatten(vec3(3.0, 1.0, 1.0)));
    gl.uniform4fv(gl.getUniformLocation(program, "uLightColor"), flatten([1, 1, 1, 1]));
    gl.uniform4fv(gl.getUniformLocation(program, "uAmbientColor"), flatten([0.2, 0.2, 0.2, 1]));

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

    const modelMatrices = new Map();

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

    // Sky box
    // Sphere is centered at the origin with radius 1, and scaled by MVP
    function buildSkybox(latBands, longBands) {
        let verts = [];
        for (let lat = 0; lat < latBands; lat++) {
            let theta1 = (lat / latBands) * Math.PI;
            let theta2 = ((lat + 1) / latBands) * Math.PI;
            for (let lon = 0; lon < longBands; lon++) {
                let phi1 = (lon / longBands) * 2 * Math.PI;
                let phi2 = ((lon + 1) / longBands) * 2 * Math.PI;

                // Four corners of the quad
                let p = (t, p) => [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
                let p1 = p(theta1, phi1), p2 = p(theta2, phi1);
                let p3 = p(theta2, phi2), p4 = p(theta1, phi2);

                // Two triangles, normals inward
                [p1, p3, p2,  p1, p4, p3].forEach(v => {
                    verts.push(v[0], v[1], v[2], 1.0);
                });
            }
        }
        let buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        return { buffer: buf, count: verts.length / 4 };
    }

    const skybox = buildSkybox(32, 32);

    // Load the skybox texture into TEXTURE1
    let skyTextureReady = false;
    let skyTexture = gl.createTexture();
    let skyImage = new Image();
    skyImage.onload = () => {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, skyTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, skyImage);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        skyTextureReady = true;
    };
    skyImage.src = "data/skybox.jpg";

    // Draw the skybox first
    // Depth writing is disabled so it doesnt occlude
    function drawSkybox(view, proj) {
        if (!skyTextureReady) return;

        let rotOnlyView = mat4(
            vec4(view[0][0], view[0][1], view[0][2], 0.0),
            vec4(view[1][0], view[1][1], view[1][2], 0.0),
            vec4(view[2][0], view[2][1], view[2][2], 0.0),
            vec4(0.0, 0.0, 0.0, 1.0)
        );

        // Scale to be big
        let skyScale = scalem(50, 50, 50);
        let skyMVP = mult(proj, mult(rotOnlyView, skyScale));
        gl.uniformMatrix4fv(uSkyboxMVPLoc, false, flatten(skyMVP));

        gl.uniform1i(isSkyboxLoc, 1);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, skyTexture);
        gl.uniform1i(uSkySamplerLoc, 1);

        gl.depthMask(false);

        gl.bindBuffer(gl.ARRAY_BUFFER, skybox.buffer);
        gl.vertexAttribPointer(vPositionLoc, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPositionLoc);

        gl.disableVertexAttribArray(vNormalLoc);
        gl.disableVertexAttribArray(vColorLoc);
        gl.disableVertexAttribArray(vTexCoordLoc);

        gl.drawArrays(gl.TRIANGLES, 0, skybox.count);

        gl.depthMask(true);
        gl.uniform1i(isSkyboxLoc, 0);
    }

    // CHARACTER HELPERS 
    function buildBodyMatrix() {
        if (!body._initialized) return mat4();
        let m = mat4();
        m = mult(translate(characterPos[0], characterPos[1] + CHARACTER_Y_OFFSET, characterPos[2]), m);
        m = mult(m, rotateY(bodyAngle));
        m = mult(m, scalem(0.3, 0.3, 0.3));
        return m;
    }

    // head matrix
    function buildHeadMatrix() {
        if (!head._initialized) return mat4();
        let m = buildBodyMatrix();
        // position 
        m = mult(m, translate(0, 0, 0));
        // rotate
        m = mult(m, rotateY(-headTilt));
        // size
        m = mult(m, scalem(1.0, 1.0, 1.0));
        return m;
    }

    function buildSwordMatrix() {
        if (!sword._initialized) return mat4();
        let m = buildBodyMatrix();
        if (swordPointing) {
            // orient the sword away from the body with rotations reversed (FIX THIS PLUH)
            m = mult(m, rotateZ(180));  
            m = mult(m, translate(0, -4.5, 0)); 
            m = mult(m, rotateY(-90))    
            m = mult(m, translate(2.0, 0, 0));
            m = mult(m, rotateY(headTilt)); // depending on head tilt, sword should point in the direction the head is facing
        }
        // size
        m = mult(m, scalem(1.0, 1.0, 1.0));
        return m;
    }

    function updateCharacter() {
        // handle turning head
        if (keys['q']) {
            if (headTilt > -HEAD_TILT_LIMIT) {
                headTilt -= HEAD_TILT_SPEED;        // tilt right when Q
            } else {
                bodyAngle += CHARACTER_TURN_SPEED;
            }
        } else if (keys['e']) {
            if (headTilt < HEAD_TILT_LIMIT) {
                headTilt += HEAD_TILT_SPEED;            // tilt left when E
            } else {
                bodyAngle -= CHARACTER_TURN_SPEED;
            }
        } else {
            // return head to center
            if (headTilt > 0) headTilt = Math.max(0, headTilt - HEAD_TILT_SPEED);
            if (headTilt < 0) headTilt = Math.min(0, headTilt + HEAD_TILT_SPEED);
        }

        let rad = bodyAngle * Math.PI / 180.0;
        let forward = vec3( Math.sin(rad), 0,  Math.cos(rad));
        let right = vec3( Math.cos(rad), 0, -Math.sin(rad));

        if (keys['w']) characterPos = add(characterPos, scale(CHARACTER_SPEED, forward));
        if (keys['s']) characterPos = subtract(characterPos, scale(CHARACTER_SPEED, forward));
        if (keys['a']) characterPos = add(characterPos, scale(CHARACTER_SPEED, right));
        if (keys['d']) characterPos = subtract(characterPos, scale(CHARACTER_SPEED, right));

        if (keys[' '] && characterOnGround) {
            characterVelY = JUMP_FORCE;
            characterOnGround = false;
        }

        characterVelY += GRAVITY;
        characterPos[1] += characterVelY;
        characterOnGround = false;

        if (!body._initialized || !body.bbox) return;

        let charBox = getWorldBBox(body, buildBodyMatrix());
        let feetY = charBox.min[1];
        let centerX = (charBox.min[0] + charBox.max[0]) / 2;
        let centerZ = (charBox.min[2] + charBox.max[2]) / 2;

        models.forEach(m => {
            // ignore own parts for collision
            if (m === body || m === head || m === sword || !m._initialized || !m.bbox) return;
            let mMatrix = modelMatrices.get(m);
            if (!mMatrix) return;

            let box = getWorldBBox(m, mMatrix);
            let xOverlap = centerX >= box.min[0] && centerX <= box.max[0];
            let zOverlap = centerZ >= box.min[2] && centerZ <= box.max[2];

            if (xOverlap && zOverlap) {
                let surfaceY = box.max[1];
                if (feetY <= surfaceY && feetY >= surfaceY - 0.5 && characterVelY <= 0) {
                    characterPos[1] += (surfaceY - feetY);
                    characterVelY = 0;
                    characterOnGround = true;
                }
            }
        });

        if (characterPos[1] < -20) {
            characterPos[1] = 5.0;
            characterVelY = 0;
        }
    }

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

        updateCharacter();

        // Follow camera with pointer lock mouse controls
        let azimuthRad   = (bodyAngle + cameraAzimuth) * Math.PI / 180.0;
        let elevationRad = cameraElevation * Math.PI / 180.0;

        let camX = cameraDistance * Math.sin(azimuthRad) * Math.cos(elevationRad);
        let camY = cameraDistance * Math.sin(elevationRad);
        let camZ = cameraDistance * Math.cos(azimuthRad) * Math.cos(elevationRad);

        let eye = add(characterPos, vec3(camX, camY, camZ));
        let at  = add(characterPos, vec3(0, 1.5, 0));
        view = lookAt(eye, at, vec3(0, 1, 0));

        const uModelLoc      = gl.getUniformLocation(program, "uModel");
        const uNormalMatLoc  = gl.getUniformLocation(program, "uNormalMatrix");
        const uLightPosLoc   = gl.getUniformLocation(program, "lightPosition");

        // Pass light as world-space point (above the lamp)
        gl.uniform4fv(uLightPosLoc, flatten(vec4(0.0, 5.0, 0.0, 1.0)));

        drawSkybox(view, proj);

        models.forEach(m => {
            if (m.objParsed && m.mtlParsed) {
                if (!m._initialized) {
                    initModelBuffers(gl, m);
                    m._initialized = true;
                }

                // Build model matrix
                let modelMatrix;
                if (m === body) {
                    modelMatrix = buildBodyMatrix();
                } else if (m === head) {
                    modelMatrix = buildHeadMatrix();
                } else if (m === sword) {
                    modelMatrix = buildSwordMatrix();
                } else if (m === dog) {
                    modelMatrix = mult(
                        translate(3.0, 1.5, 0.0),
                        scalem(1, 1, 1)
                    );
                } else if (m === lamp) {
                    modelMatrix = mult(
                        translate(0.0, 0.5, 0.0),
                        scalem(0.1, 0.1, 0.1)
                    );
                } else {
                    modelMatrix = mat4();
                }

                modelMatrices.set(m, modelMatrix);

                mvp = mult(proj, mult(view, modelMatrix));
                gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvp));

                let norm = transpose(inverse(modelMatrix));
                let normalMatrix = [
                    vec3(norm[0][0], norm[0][1], norm[0][2]),
                    vec3(norm[1][0], norm[1][1], norm[1][2]),
                    vec3(norm[2][0], norm[2][1], norm[2][2])
                ];
                gl.uniformMatrix4fv(uModelLoc,     false, flatten(modelMatrix));
                gl.uniformMatrix3fv(uNormalMatLoc, false, flatten(normalMatrix));

                gl.bindBuffer(gl.ARRAY_BUFFER, m.vBuffer);
                gl.vertexAttribPointer(vPositionLoc, 4, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vPositionLoc);

                gl.bindBuffer(gl.ARRAY_BUFFER, m.nBuffer);
                gl.vertexAttribPointer(vNormalLoc, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vNormalLoc);

                gl.bindBuffer(gl.ARRAY_BUFFER, m.cBuffer);
                gl.vertexAttribPointer(vColorLoc, 4, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(vColorLoc);

                if (m.textured && m.uvBuffer && m.textureReady) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, m.uvBuffer);
                    gl.vertexAttribPointer(vTexCoordLoc, 2, gl.FLOAT, false, 0, 0);
                    gl.enableVertexAttribArray(vTexCoordLoc);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, m.texture);
                    gl.uniform1i(uSamplerLoc, 0);
                    gl.uniform1i(uTexturedLoc, 1);
                } else {
                    gl.disableVertexAttribArray(vTexCoordLoc);
                    gl.uniform1i(uTexturedLoc, 0);
                }

                gl.drawArrays(gl.TRIANGLES, 0, m.numVertices);
            }
        });

        requestAnimFrame(render);
    }

    render();
}

function getWorldBBox(model, modelMatrix) {
    let mn = model.bbox.min;
    let mx = model.bbox.max;
    let corners = [
        vec4(mn[0], mn[1], mn[2], 1), vec4(mx[0], mn[1], mn[2], 1),
        vec4(mn[0], mx[1], mn[2], 1), vec4(mx[0], mx[1], mn[2], 1),
        vec4(mn[0], mn[1], mx[2], 1), vec4(mx[0], mn[1], mx[2], 1),
        vec4(mn[0], mx[1], mx[2], 1), vec4(mx[0], mx[1], mx[2], 1),
    ];
    let wMin = [ Infinity,  Infinity,  Infinity];
    let wMax = [-Infinity, -Infinity, -Infinity];
    corners.forEach(c => {
        let t = mult(modelMatrix, c);
        for (let i = 0; i < 3; i++) {
            wMin[i] = Math.min(wMin[i], t[i]);
            wMax[i] = Math.max(wMax[i], t[i]);
        }
    });
    return { min: wMin, max: wMax };
}

function initModelBuffers(gl, model) {
    let verts = [], colors = [], normals = [], uvs = [];
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    model.faces.forEach(face => {
        let c = model.diffuseMap.get(face.material) || [1, 1, 1, 1];
        let a = face.faceVertices[0];
        let b = face.faceVertices[1];
        let cV = face.faceVertices[2];
        let normal = normalize(cross(subtract(b, a), subtract(cV, a)));

        face.faceVertices.forEach((vtx, i) => {
            verts.push(vtx[0], vtx[1], vtx[2], 1.0);
            colors.push(c[0], c[1], c[2], c[3]);
            normals.push(normal[0], normal[1], normal[2]);
            if (model.textured && face.faceTexCoords && face.faceTexCoords[i])
                uvs.push(face.faceTexCoords[i][0], face.faceTexCoords[i][1]);
            else
                uvs.push(0.0, 0.0);

            for (let j = 0; j < 3; j++) {
                min[j] = Math.min(min[j], vtx[j]);
                max[j] = Math.max(max[j], vtx[j]);
            }
        });
    });

    model.center = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
    model.scale = 6.0 / Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
    model.bbox = { min: [...min], max: [...max] };
    model.numVertices = verts.length / 4;

    model.vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW);

    model.nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

    model.cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);

    if (model.textured) {
        model.uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, model.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        model.textureReady = false;
        model.texture = gl.createTexture();
        let img = new Image();
        img.onload = () => {
            console.log("Dog texture loaded:", model.imagePath);
            console.log("Dog UVs sample:", uvs.slice(0, 10));

            gl.bindTexture(gl.TEXTURE_2D, model.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            model.textureReady = true;
        };
        img.onerror = () => console.error("Failed to load texture:", model.imagePath);
        img.src = model.imagePath;
    }
}

function resizeCanvasToDisplaySize(canvas) {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
}