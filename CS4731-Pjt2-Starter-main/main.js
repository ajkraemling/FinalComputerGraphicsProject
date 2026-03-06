function main() {
    let canvas = document.getElementById('webgl');
    let gl = WebGLUtils.setupWebGL(canvas, undefined);
    if (!gl) { console.log('Failed to get the rendering context for WebGL'); return; }

    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    let program = initShaders(gl, "vshader", "fshader");
    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);

    // MODELS
    let lamp = new Model("data/lamp.obj", "data/lamp.mtl");
    let character = new Model("data/hollow_knight.obj","data/hollow_knight.mtl");
    let street = new Model("data/mini_tiles.obj","data/mini_tiles.mtl");

    let models = [lamp, street, character];

    // CHARACTER STATE
    let characterPos = vec3(0.0, 0.0, 0.0);
    let characterAngle = 0.0;
    let characterVelY = 0.0;
    let characterOnGround = false;
    const CHARACTER_SPEED = 0.15;
    const CHARACTER_TURN_SPEED = 2.0;
    const CHARACTER_Y_OFFSET = 1.0;
    const GRAVITY = -0.005;
    const JUMP_FORCE = 0.15;

    const keys = {};
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);

    let mouseDown = false;
    let lastMouseX = 0;
    const MOUSE_SENSITIVITY = 0.3;

    canvas.addEventListener('mousedown', e => {
        mouseDown = true;
        lastMouseX = e.clientX;
    });
    canvas.addEventListener('mouseup', () => mouseDown = false);
    canvas.addEventListener('mouseleave', () => mouseDown = false);
    canvas.addEventListener('mousemove', e => {
        if (!mouseDown) return;
        let dx = e.clientX - lastMouseX;
        characterAngle -= dx * MOUSE_SENSITIVITY;
        lastMouseX = e.clientX;
    });

    const vPositionLoc = gl.getAttribLocation(program,"vPosition");
    const vNormalLoc = gl.getAttribLocation(program, "vNormal");
    const vColorLoc = gl.getAttribLocation(program, "vColor");
    const vTexCoordLoc = gl.getAttribLocation(program, "vTexCoord");
    const uTexturedLoc = gl.getUniformLocation(program, "uTextured");
    const uSamplerLoc = gl.getUniformLocation(program, "uSampler");
    const uMVPLoc = gl.getUniformLocation(program, "uMVP");
    const uSkyboxMVPLoc = gl.getUniformLocation(program, "uSkyboxMVP");
    const uSkySamplerLoc = gl.getUniformLocation(program, "uSkySampler");
    const isSkyboxLoc = gl.getUniformLocation(program, "isSkybox");

    let proj = perspective(45, canvas.width / canvas.height, 0.1, 1000.0);
    let view = lookAt(vec3(0, 3, 7), vec3(0, 0, 0), vec3(0, 1, 0));

    gl.uniform3fv(gl.getUniformLocation(program, "uLightDirection"), flatten(vec3(3.0, 1.0, 1.0)));
    gl.uniform4fv(gl.getUniformLocation(program, "uLightColor"), flatten([1, 1, 1, 1]));
    gl.uniform4fv(gl.getUniformLocation(program, "uAmbientColor"), flatten([0.2, 0.2, 0.2, 1]));

    const modelMatrices = new Map();

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
    skyImage.src = "data/skybox.avif";

    // Draw the skybox first
    // Depth writing is disabled so it doesnt ooclude
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
    function buildCharacterMatrix() {
        if (!character._initialized) return mat4();
        let m = mat4();
        m = mult(translate(characterPos[0], characterPos[1] + CHARACTER_Y_OFFSET, characterPos[2]), m);
        m = mult(m, rotateY(characterAngle));
        m = mult(m, scalem(0.5, 0.5, 0.5));
        return m;
    }

    function updateCharacter() {
        // Turn head instead
        // if (keys['q']) characterAngle += CHARACTER_TURN_SPEED;
        // if (keys['e']) characterAngle -= CHARACTER_TURN_SPEED;

        let rad = characterAngle * Math.PI / 180.0;
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

        if (!character._initialized || !character.bbox) return;

        let charBox = getWorldBBox(character, buildCharacterMatrix());
        let feetY = charBox.min[1];
        let centerX = (charBox.min[0] + charBox.max[0]) / 2;
        let centerZ = (charBox.min[2] + charBox.max[2]) / 2;

        models.forEach(m => {
            if (m === character || !m._initialized || !m.bbox) return;
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

        updateCharacter();

        // Follow camera
        let rad = characterAngle * Math.PI / 180.0;
        let camOffset = vec3(-Math.sin(rad) * 10.0, 4.5, -Math.cos(rad) * 10.0);
        let eye = add(characterPos, camOffset);
        let at = add(characterPos, vec3(0, 1, 0));
        view = lookAt(eye, at, vec3(0, 1, 0));

        drawSkybox(view, proj);

        models.forEach(m => {
            if (m.objParsed && m.mtlParsed) {
                if (!m._initialized) {
                    initModelBuffers(gl, m);
                    m._initialized = true;
                }

                let modelMatrix = (m === character)
                    ? buildCharacterMatrix()
                    : mat4();

                modelMatrices.set(m, modelMatrix);

                let mvp = mult(proj, mult(view, modelMatrix));
                gl.uniformMatrix4fv(uMVPLoc, false, flatten(mvp));

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
            if (model.textured && face.faceTexs && face.faceTexs[i])
                uvs.push(face.faceTexs[i][0], face.faceTexs[i][1]);
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