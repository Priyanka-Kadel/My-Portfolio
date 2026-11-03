/* =========================================================
   Hanging 3D ID pass on a fabric lanyard.
   - Strap: verlet rope pinned above the viewport (gravity + damping)
   - Card: 4 corner particles held rigid by constraints, hung off the rope end
   - Drag anywhere on the card to fling it; click (no drag) flips it
   - Card faces are CanvasTextures so text stays crisp
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- Dimensions (world units) ---------- */
const CW = 1.6, CH = 2.4, CT = 0.022, CR = 0.075;   // card width / height / thickness / corner radius
const HOLE_Y = CH / 2 - 0.12;                       // slot centre in card-local Y
const CLIP_UP = 0.36;                               // strap end sits this far above the card's top edge
const STRAP_W = 0.27;
const HINGE = Math.hypot(CW / 2, CLIP_UP);
const TEX_W = 1024, TEX_H = 1536;                   // card face texture (2:3)

/* ---------- Physics ---------- */
const N = 12;                                       // rope segments
const G = -15, DT = 1 / 120, ITER = 12;

export async function createLanyard(canvas, cfg) {
  const reduce = !!cfg.reduceMotion;
  const DAMP = reduce ? 0.94 : 0.987;

  /* ---------- Renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 60;
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // invisible "page" that only receives the soft shadow of the pass + strap
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.085 }));
  shadowPlane.position.z = -0.7;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  /* ---------- Textures ---------- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const makeTex = c => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  await fontsReady();
  let portrait = null;
  try { portrait = await loadImage(cfg.portrait); } catch { portrait = null; }

  /* ---------- Card mesh ---------- */
  const shape = cardShape();
  const faceMat = map => new THREE.MeshPhysicalMaterial({
    map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3,
    roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.15, metalness: 0,
  });
  const cardGroup = new THREE.Group();
  cardGroup.matrixAutoUpdate = false;
  scene.add(cardGroup);

  const front = new THREE.Mesh(faceGeo(shape), faceMat(makeTex(frontCanvas(cfg, portrait))));
  front.position.z = CT / 2 + 0.0005;
  const back = new THREE.Mesh(faceGeo(shape), faceMat(makeTex(backCanvas(cfg))));
  back.rotation.y = Math.PI;
  back.position.z = -CT / 2 - 0.0005;
  const edgeGeo = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 12 });
  edgeGeo.translate(0, 0, -CT / 2);
  const edge = new THREE.Mesh(edgeGeo, [
    new THREE.MeshBasicMaterial({ visible: false }),
    new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.5 }),
  ]);
  [front, back, edge].forEach(m => { m.castShadow = true; cardGroup.add(m); });
  const pickables = [front, back, edge];

  /* ---------- Clip hardware ---------- */
  const metal = new THREE.MeshStandardMaterial({ color: 0xd2d2d0, metalness: 1, roughness: 0.28 });
  const clip = new THREE.Group();
  clip.matrixAutoUpdate = false;
  const ringR = 0.07;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.016, 16, 48), metal);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1, 0.024), metal);
  const plate = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.3, 6, 16), metal);
  plate.rotation.z = Math.PI / 2;
  [ring, bar, plate].forEach(m => { m.castShadow = true; clip.add(m); });
  scene.add(clip);

  /* ---------- Strap ribbon ---------- */
  const SAMPLES = 96;
  const strapGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SAMPLES * 2 * 3), sUv = new Float32Array(SAMPLES * 2 * 2);
  const idx = [];
  for (let i = 0; i < SAMPLES - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  strapGeo.setIndex(idx);
  strapGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  strapGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  const st = strapTextures(makeTex, newCanvas);
  const strapMat = new THREE.MeshStandardMaterial({
    map: st.map, bumpMap: st.bump, bumpScale: 0.8, roughness: 0.95, side: THREE.DoubleSide,
  });
  const strap = new THREE.Mesh(strapGeo, strapMat);
  strap.castShadow = true;
  strap.frustumCulled = false;
  scene.add(strap);
  const TEX_LEN = STRAP_W * st.aspect;   // world length of one texture repeat

  /* ---------- Verlet particles & constraints ---------- */
  const P = [], PREV = [], INV = [];
  const add = inv => { P.push(new THREE.Vector3()); PREV.push(new THREE.Vector3()); INV.push(inv); return P.length - 1; };
  const rope = [];
  for (let i = 0; i <= N; i++) rope.push(add(i === 0 ? 0 : 1));
  const TL = add(0.22), TR = add(0.22), BR = add(0.22), BL = add(0.22);
  const corners = [TL, TR, BR, BL];
  const END = rope[N];

  const cons = [];
  const link = (a, b, len, k = 1) => { const c = { a, b, len, k }; cons.push(c); return c; };
  const ropeCons = [], ropeBend = [];
  for (let i = 0; i < N; i++) ropeCons.push(link(rope[i], rope[i + 1], 0.1));
  for (let i = 0; i < N - 1; i++) ropeBend.push(link(rope[i], rope[i + 2], 0.2, 0.05));
  link(END, TL, HINGE); link(END, TR, HINGE);
  const diag = Math.hypot(CW, CH);
  link(TL, TR, CW); link(TR, BR, CH); link(BR, BL, CW); link(BL, TL, CH);
  link(TL, BR, diag); link(TR, BL, diag);

  const anchor = new THREE.Vector3();
  let view = { w: 1, h: 1 };
  let placed = false;

  function layout() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    const aspect = W / H;
    const desktop = W > 760;
    // card takes ~50% of the viewport height on desktop, ~42% on phones
    const worldH = desktop ? Math.max(CH / 0.5, CW / (0.3 * aspect)) : Math.max(CH / 0.42, CW / (0.5 * aspect));
    const worldW = worldH * aspect;
    const D = worldH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = aspect;
    camera.position.set(0, 0, D);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    sun.position.set(-2.2, 4.5, D * 0.7);
    sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera, half = Math.max(worldW, worldH) * 0.6;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.far = D * 2;
    sc.updateProjectionMatrix();

    view = { w: worldW, h: worldH };
    const ax = desktop ? (Math.min(0.7, 0.5 + 0.18 * Math.min(1, aspect / 1.4)) - 0.5) * worldW : 0;
    const restY = desktop ? -0.03 * worldH : 0.19 * worldH;
    const prevAnchor = anchor.clone();
    anchor.set(ax, worldH / 2 + 0.8, 0);
    const ropeLen = anchor.y - (restY + CH / 2 + CLIP_UP);
    ropeCons.forEach(c => { c.len = ropeLen / N; });
    ropeBend.forEach(c => { c.len = (ropeLen / N) * 2; });

    if (!placed) { placeInitial(restY); placed = true; }
    else {
      // keep the pass hanging where it was relative to the new anchor
      const d = anchor.clone().sub(prevAnchor);
      for (let i = 0; i < P.length; i++) { P[i].add(d); PREV[i].add(d); }
    }
  }

  function placeInitial(cy) {
    const theta = reduce ? 0 : 0.6;   // enters mid-swing, then settles
    const pts = [];
    const top = new THREE.Vector3(anchor.x, cy + CH / 2 + CLIP_UP, 0);
    for (let i = 0; i <= N; i++) pts[rope[i]] = new THREE.Vector3().lerpVectors(anchor, top, i / N);
    pts[TL] = new THREE.Vector3(anchor.x - CW / 2, cy + CH / 2, 0.02);
    pts[TR] = new THREE.Vector3(anchor.x + CW / 2, cy + CH / 2, -0.02);
    pts[BR] = new THREE.Vector3(anchor.x + CW / 2, cy - CH / 2, -0.02);
    pts[BL] = new THREE.Vector3(anchor.x - CW / 2, cy - CH / 2, 0.02);
    const c = Math.cos(theta), s = Math.sin(theta);
    pts.forEach((p, i) => {
      const dx = p.x - anchor.x, dy = p.y - anchor.y;
      p.set(anchor.x + dx * c - dy * s, anchor.y + dx * s + dy * c, p.z);
      P[i].copy(p); PREV[i].copy(p);
    });
  }

  /* ---------- Card frame from its corners ---------- */
  const fx = new THREE.Vector3(), fy = new THREE.Vector3(), fz = new THREE.Vector3(), fc = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function cardFrame() {
    fc.copy(P[TL]).add(P[TR]).add(P[BR]).add(P[BL]).multiplyScalar(0.25);
    fx.copy(P[TR]).sub(P[TL]).add(tmp.copy(P[BR]).sub(P[BL])).normalize();
    fy.copy(P[TL]).sub(P[BL]).add(tmp.copy(P[TR]).sub(P[BR]));
    fy.addScaledVector(fx, -fx.dot(fy)).normalize();
    fz.crossVectors(fx, fy);
  }

  /* ---------- Simulation step ---------- */
  const drag = { on: false, w: [0, 0, 0, 0], target: new THREE.Vector3(), z0: 0, lift: 0, downAt: 0, sx: 0, sy: 0, moved: false, id: null };
  let targetYaw = 0, lastYaw = 0, simTime = 0;
  const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  function step() {
    simTime += DT;
    P[rope[0]].copy(anchor); PREV[rope[0]].copy(anchor);
    // a whisper of air so the pass is never perfectly still
    const breeze = (reduce || drag.on) ? 0 : Math.sin(simTime * 0.9) * 0.18 + Math.sin(simTime * 0.37 + 1.3) * 0.1;
    for (let i = 0; i < P.length; i++) {
      if (!INV[i]) continue;
      const p = P[i], q = PREV[i];
      const vx = (p.x - q.x) * DAMP, vy = (p.y - q.y) * DAMP, vz = (p.z - q.z) * DAMP;
      q.copy(p);
      p.x += vx + breeze * DT * DT;
      p.y += vy + G * DT * DT;
      p.z += vz;
    }
    // yaw spring: turns the chosen face toward the viewer (drives the flip)
    cardFrame();
    const yaw = Math.atan2(fz.x, fz.z);
    const rate = wrap(yaw - lastYaw) / DT; lastYaw = yaw;
    const k = drag.on ? 6 : 26, c = drag.on ? 3 : 4.4;
    const dw = (wrap(targetYaw - yaw) * k - rate * c) * DT;
    for (const i of corners) {
      const rx = P[i].x - fc.x, rz = P[i].z - fc.z;
      P[i].x += rz * dw * DT;
      P[i].z += -rx * dw * DT;
    }
    if (drag.on) drag.lift = Math.min(1, drag.lift + DT * 4);

    for (let it = 0; it < ITER; it++) {
      for (const cn of cons) {
        const a = P[cn.a], b = P[cn.b], wa = INV[cn.a], wb = INV[cn.b], ws = wa + wb;
        if (!ws) continue;
        tmp.subVectors(b, a);
        const d = tmp.length() || 1e-6;
        const diff = (d - cn.len) / d * cn.k / ws;
        a.addScaledVector(tmp, diff * wa);
        b.addScaledVector(tmp, -diff * wb);
      }
      if (drag.on) {
        // pull the grabbed point (bilinear blend of the corners) toward the pointer
        const w = drag.w;
        tmp.set(0, 0, 0);
        for (let j = 0; j < 4; j++) tmp.addScaledVector(P[corners[j]], w[j]);
        tmp2.copy(drag.target); tmp2.z = drag.z0 + 0.35 * drag.lift;
        tmp2.sub(tmp);
        const s2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3];
        for (let j = 0; j < 4; j++) P[corners[j]].addScaledVector(tmp2, (w[j] / s2) * 0.6);
      }
      P[rope[0]].copy(anchor);
    }
  }

  /* ---------- Sync meshes to particles ---------- */
  const ropeVecs = rope.map(() => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(ropeVecs, false, 'centripetal');
  const samples = Array.from({ length: SAMPLES }, () => new THREE.Vector3());
  const hole = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3();
  const T = new THREE.Vector3(), X = new THREE.Vector3(), bx = new THREE.Vector3(), bz = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  function sync() {
    cardFrame();
    m4.makeBasis(fx, fy, fz).setPosition(fc);
    cardGroup.matrix.copy(m4);
    cardGroup.matrixWorldNeedsUpdate = true;

    // clip: ring at the strap end, bar down to the slot, clamp plate at the slot
    hole.copy(fc).addScaledVector(fy, HOLE_Y);
    up.subVectors(P[END], hole);
    const span = up.length();
    up.normalize();
    bx.copy(fx).addScaledVector(up, -fx.dot(up)).normalize();
    bz.crossVectors(bx, up);
    const ringC = tmp.copy(P[END]).addScaledVector(up, -ringR * 0.6);
    clip.matrix.makeBasis(bx, up, bz).setPosition(ringC);
    clip.matrixWorldNeedsUpdate = true;
    const barLen = Math.max(0.05, span - ringR * 1.6);
    bar.scale.set(1, barLen, 1);
    bar.position.set(0, -ringR - barLen / 2 + 0.01, 0);
    plate.position.set(0, -ringR - barLen + 0.01, 0);

    // ribbon along a smooth curve through the rope; twists to match the card at its end
    rope.forEach((r, i) => ropeVecs[i].copy(P[r]));
    ropeVecs[N].copy(P[END]).addScaledVector(up, -ringR * 0.25);
    for (let i = 0; i < SAMPLES; i++) curve.getPoint(i / (SAMPLES - 1), samples[i]);
    let along = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(SAMPLES - 1, i + 1)];
      T.subVectors(b, a).normalize();
      if (i > 0) along += samples[i].distanceTo(samples[i - 1]);
      const t = i / (SAMPLES - 1), e = t * t * (3 - 2 * t);
      X.set(1, 0, 0).multiplyScalar(1 - e).addScaledVector(fx, e);
      if (X.lengthSq() < 1e-4) X.set(0, 0, 1);
      side.copy(X).addScaledVector(T, -X.dot(T));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize().multiplyScalar(STRAP_W / 2);
      const s = samples[i], o = i * 6;
      sPos[o] = s.x - side.x; sPos[o + 1] = s.y - side.y; sPos[o + 2] = s.z - side.z;
      sPos[o + 3] = s.x + side.x; sPos[o + 4] = s.y + side.y; sPos[o + 5] = s.z + side.z;
      const u = -along / TEX_LEN;
      sUv[i * 4] = u; sUv[i * 4 + 1] = 1; sUv[i * 4 + 2] = u; sUv[i * 4 + 3] = 0;
    }
    strapGeo.attributes.position.needsUpdate = true;
    strapGeo.attributes.uv.needsUpdate = true;
    strapGeo.computeVertexNormals();
  }

  /* ---------- Pointer ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(e) { setNdc(e); cardGroup.updateMatrixWorld(true); return ray.intersectObjects(pickables, false)[0]; }
  function planePoint(z, out) {
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = (z - o.z) / (d.z || -1e-6);
    return out.copy(o).addScaledVector(d, t);
  }

  canvas.addEventListener('pointerdown', e => {
    const hit = pick(e);
    if (!hit) return;
    const local = cardGroup.worldToLocal(hit.point.clone());
    const u = THREE.MathUtils.clamp((local.x + CW / 2) / CW, 0, 1);
    const v = THREE.MathUtils.clamp((CH / 2 - local.y) / CH, 0, 1);
    drag.w = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
    drag.z0 = hit.point.z; drag.lift = 0;
    drag.target.copy(hit.point);
    Object.assign(drag, { on: true, id: e.pointerId, downAt: performance.now(), sx: e.clientX, sy: e.clientY, moved: false });
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (drag.on && e.pointerId === drag.id) {
      setNdc(e);
      planePoint(drag.z0, drag.target);
      drag.target.x = THREE.MathUtils.clamp(drag.target.x, -view.w / 2, view.w / 2);
      drag.target.y = THREE.MathUtils.clamp(drag.target.y, -view.h / 2, view.h / 2);
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    } else if (e.pointerType === 'mouse') {
      canvas.style.cursor = pick(e) ? 'grab' : 'default';
    }
  });
  function release(e) {
    if (!drag.on || e.pointerId !== drag.id) return;
    drag.on = false;
    if (!drag.moved && performance.now() - drag.downAt < 350) flip();
    canvas.style.cursor = e.pointerType === 'mouse' ? 'grab' : 'default';
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });

  function flip() {
    targetYaw = wrap(targetYaw + Math.PI);
    // nudge so the spin direction is decided, plus a small hop
    cardFrame();
    for (const i of corners) {
      const rx = P[i].x - fc.x;
      PREV[i].z += rx * 0.06;
      PREV[i].y -= 0.012;
    }
  }

  /* ---------- Loop (paused when hidden / off Home) ---------- */
  layout();
  new ResizeObserver(layout).observe(canvas);
  cardFrame();
  lastYaw = Math.atan2(fz.x, fz.z);

  let raf = 0, running = false, acc = 0, last = 0;
  function frame(now) {
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    let n = 0;
    while (acc >= DT && n < 8) { step(); acc -= DT; n++; }
    sync();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    layout();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    canvas.classList.add('ready');
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    drag.on = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (running) { cancelAnimationFrame(raf); } }
    else if (running) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  return { start, stop, flip };
}

/* =========================================================
   Helpers
   ========================================================= */
async function fontsReady() {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 100px "Schibsted Grotesk"'),
        document.fonts.load('800 100px "Schibsted Grotesk"'),
        document.fonts.load('400 40px "Courier Prime"'),
      ]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch {}
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// punched slot near the top edge where the clip goes through
function drawSlot(ctx, W, H) {
  const sw = W * 0.2, sh = W * 0.034, sx = (W - sw) / 2;
  const cy = ((CH / 2 - HOLE_Y) / CH) * H;
  roundRect(ctx, sx, cy - sh / 2, sw, sh, sh / 2);
  const g = ctx.createLinearGradient(0, cy - sh / 2, 0, cy + sh / 2);
  g.addColorStop(0, '#bdbbb5');
  g.addColorStop(1, '#e4e2dc');
  ctx.fillStyle = g;
  ctx.fill();
}

// shrink a font until the text fits the width
function fitFont(ctx, text, weight, size, family, maxW) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 20) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

const GROTESK = '"Schibsted Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Courier Prime", "Courier New", monospace';

function frontCanvas(cfg, img) {
  const W = TEX_W, H = TEX_H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#141414';
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';

  // name
  fitFont(x, cfg.name, 700, 92, GROTESK, W - 180);
  x.fillText(cfg.name, W / 2, 262);

  // portrait box
  const box = { x: 150, y: 318, w: W - 300, h: 760 };
  if (img) drawPortrait(x, img, box);
  else drawSilhouette(x, box);

  // title
  const lines = cfg.title;
  let size = 108;
  lines.forEach(l => { size = Math.min(size, fitFont(x, l, 700, 108, GROTESK, W - 150)); });
  x.font = `700 ${size}px ${GROTESK}`;
  const lh = size * 0.98;
  const top = 1110 + size * 0.82;
  lines.forEach((l, i) => x.fillText(l, W / 2, top + i * lh));

  // city
  x.fillStyle = '#6f6d69';
  x.font = `400 32px ${MONO}`;
  x.fillText(cfg.city, W / 2, top + (lines.length - 1) * lh + 84);

  drawSlot(x, W, H);
  return c;
}

// black-and-white cut-out, bottom-aligned in its box
function drawPortrait(ctx, img, box) {
  const s = Math.min(box.w / img.width, box.h / img.height);
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.drawImage(img, 0, 0, w, h);
  try {
    const d = t.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      let l = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      l = Math.max(0, Math.min(255, (l - 128) * 1.18 + 128));   // a touch of contrast
      p[i] = p[i + 1] = p[i + 2] = l;
    }
    t.putImageData(d, 0, 0);
  } catch {}
  ctx.drawImage(tmp, box.x + (box.w - w) / 2, box.y + box.h - h);
}

// placeholder until /assets/me-bw.png exists: halftone head-and-shoulders
function drawSilhouette(ctx, box) {
  const cx = box.x + box.w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, box.y + box.h * 0.32, box.w * 0.2, box.h * 0.22, 0, 0, Math.PI * 2);
  ctx.moveTo(cx - box.w * 0.42, box.y + box.h);
  ctx.bezierCurveTo(cx - box.w * 0.42, box.y + box.h * 0.66, cx - box.w * 0.2, box.y + box.h * 0.58, cx, box.y + box.h * 0.58);
  ctx.bezierCurveTo(cx + box.w * 0.2, box.y + box.h * 0.58, cx + box.w * 0.42, box.y + box.h * 0.66, cx + box.w * 0.42, box.y + box.h);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  for (let yy = box.y; yy < box.y + box.h; yy += 12) {
    for (let xx = box.x; xx < box.x + box.w; xx += 12) {
      const t = (yy - box.y) / box.h;
      const r = 2.2 + 3.4 * t;
      ctx.beginPath(); ctx.arc(xx + ((yy / 12) % 2) * 6, yy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function backCanvas(cfg) {
  const W = TEX_W, H = TEX_H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);

  // halftone field: dense at the top, dissolving downward
  x.fillStyle = '#121212';
  for (let yy = 260; yy < 660; yy += 18) {
    for (let xx = 74; xx < W - 64; xx += 18) {
      const t = (yy - 260) / 400;
      const n = Math.sin(xx * 0.013 + yy * 0.005) * 0.5 + 0.5;
      const r = Math.max(0, (1 - t) * 7.6 * (0.35 + 0.65 * n));
      if (r < 0.6) continue;
      x.beginPath(); x.arc(xx, yy, r, 0, Math.PI * 2); x.fill();
    }
  }

  x.font = `400 32px ${MONO}`;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillText(cfg.backHeader[0], 80, 190);
  x.textAlign = 'right';
  x.fillText(cfg.backHeader[1], W - 80, 190);

  const L = 76, maxW = W - 160;
  x.textAlign = 'left';

  // name + role
  x.fillStyle = '#141414';
  fitFont(x, cfg.name, 700, 96, GROTESK, maxW);
  x.fillText(cfg.name, L, 770);
  x.fillStyle = '#4a4743';
  fitFont(x, cfg.backRole, 500, 46, GROTESK, maxW);
  x.fillText(cfg.backRole, L, 840);

  // skills, big and bold
  x.fillStyle = '#141414';
  let size = 66;
  cfg.backSkills.forEach(l => { size = Math.min(size, fitFont(x, l, 700, 66, GROTESK, maxW)); });
  x.font = `700 ${size}px ${GROTESK}`;
  cfg.backSkills.forEach((l, i) => x.fillText(l, L, 990 + i * size * 1.12));

  // education, small mono at the foot
  x.strokeStyle = 'rgba(20,20,20,0.18)';
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(L, 1300); x.lineTo(W - 80, 1300); x.stroke();
  x.fillStyle = '#6f6d69';
  x.font = `400 32px ${MONO}`;
  cfg.backEdu.forEach((l, i) => x.fillText(l, L, 1372 + i * 46));

  drawSlot(x, W, H);
  return c;
}


/* Olive woven strap with a small mountain motif printed into the weave.
   Texture X runs along the strap, Y across it. */
function strapTextures(makeTex, newCanvas) {
  const W = 2048, H = 128;
  const c = newCanvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });

  x.fillStyle = '#6C7023';
  x.fillRect(0, 0, W, H);

  // twill: fine diagonal ribs
  x.lineWidth = 2;
  for (let i = -H; i < W + H; i += 5) {
    x.strokeStyle = (i / 5) % 2 ? 'rgba(255,250,210,0.07)' : 'rgba(20,22,0,0.12)';
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H * 0.55, H); x.stroke();
  }
  // woven edges
  x.fillStyle = 'rgba(30,32,8,0.28)';
  x.fillRect(0, 0, W, 6); x.fillRect(0, H - 6, W, 6);
  x.strokeStyle = 'rgba(235,230,190,0.28)';
  x.lineWidth = 2;
  x.setLineDash([10, 7]);
  [12, H - 12].forEach(yy => { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); });
  x.setLineDash([]);

  // grain (also used as the bump map)
  const g = newCanvas(W, H);
  const gx = g.getContext('2d');
  const gd = gx.createImageData(W, H);
  for (let i = 0; i < gd.data.length; i += 4) {
    const px = (i / 4) % W, py = Math.floor(i / 4 / W);
    const rib = ((px - py * 0.55) % 5 + 5) % 5 < 2.5 ? 30 : 0;
    const v = 110 + rib + Math.random() * 40;
    gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v;
    gd.data[i + 3] = 255;
  }
  gx.putImageData(gd, 0, 0);
  x.globalAlpha = 0.18;
  x.globalCompositeOperation = 'overlay';
  x.drawImage(g, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;

  // motif: mountain range + sun, rotated so it reads upright on the hanging strap
  const count = 12, step = W / count, s = H * 0.56;
  x.fillStyle = 'rgba(40, 54, 36, 0.9)';
  for (let k = 0; k < count; k++) {
    x.save();
    x.translate(k * step + step / 2, H / 2);
    x.rotate(Math.PI / 2);
    x.beginPath();
    x.moveTo(-s * 0.5, s * 0.3);
    x.lineTo(-s * 0.14, -s * 0.24);
    x.lineTo(0.0, -s * 0.04);
    x.lineTo(s * 0.17, -s * 0.36);
    x.lineTo(s * 0.5, s * 0.3);
    x.closePath();
    x.fill();
    x.beginPath();
    x.arc(-s * 0.3, -s * 0.3, s * 0.075, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }

  const map = makeTex(c);
  map.wrapS = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(g);
  bump.wrapS = THREE.RepeatWrapping;
  bump.anisotropy = map.anisotropy;
  return { map, bump, aspect: W / H };
}

function cardShape() {
  const s = new THREE.Shape(), w = CW / 2, h = CH / 2, r = CR;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

function faceGeo(shape) {
  const g = new THREE.ShapeGeometry(shape, 12);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + CW / 2) / CW, (p.getY(i) + CH / 2) / CH);
  uv.needsUpdate = true;
  return g;
}
