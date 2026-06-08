// Avatar engine — wraps all Three.js / GLB logic for the AI teacher avatar.
// Adapted from test2/app.js; refactored as a factory for React integration.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TEACHING_CLIPS } from "./teaching-animations.js";

/**
 * Create a self-contained avatar engine bound to a canvas element.
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ onStatus?: (s:string)=>void }} [options]
 * @returns {{ start: ()=>Promise<void>, stop: ()=>void, playAnimation: (name:string,opts?:object)=>void, stopAnimation: ()=>void, playCountingAnimation: (n?:number,cb?:()=>void)=>void }}
 */
export function createAvatarEngine(canvasEl, options = {}) {
  const { onStatus } = options;
  function setStatus(t) { if (onStatus) onStatus(t); }

  // ── Renderer / Scene / Camera ──────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  let W = canvasEl.clientWidth  || 400;
  let H = canvasEl.clientHeight || 440;
  renderer.setSize(W, H, false);

  const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 1000);
  camera.position.set(0, 1.5, 2.5);

  const controls = new OrbitControls(camera, canvasEl);
  controls.target.set(0, 1.4, 0);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = false;
  controls.update();

  const CAM_VIEW = {
    minPolarAngle:    THREE.MathUtils.degToRad(40),
    maxPolarAngle:    THREE.MathUtils.degToRad(100),
    minAzimuthAngle:  THREE.MathUtils.degToRad(-120),
    maxAzimuthAngle:  THREE.MathUtils.degToRad(120),
  };

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(2, 3, 2);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  // ── Mutable state ──────────────────────────────────────────────────────────
  let morphMeshes = [];
  let talkMode = false;
  let speechIsActive = false;
  let selectedEmotion = "neutral";
  let lessonController = null;
  let avatarRoot = null;
  let teacherRigReady = false;
  let lastAvatarCameraFrame = null;

  const smoothTargets = new Map();
  const morphGroupCache = new Map();

  const LIPSYNC_CONFIG = { jawScale: 0.9, attackSpeed: 14.0, releaseSpeed: 8.0 };

  const rigBones = {
    hips: null, spine: null, spine1: null, chest: null,
    neck: null, head: null,
    leftShoulder: null, rightShoulder: null,
    leftUpperArm: null, rightUpperArm: null,
    leftForeArm: null, rightForeArm: null,
    leftHand: null, rightHand: null,
    leftFoot: null, rightFoot: null,
    leftToe: null, rightToe: null,
  };

  const allResolvedLeftArmBones = [];
  const allResolvedArmBones = [];

  const ARM_DEBUG_CONFIG = { freezeArms: false };

  const ARM_SAFETY_BASE_DELTA_RAD = {
    shoulder: 0.042, upperArm: 0.055, foreArm: 0.048, hand: 0.042, default: 0.05,
  };

  const teacherAnim = {
    speaking: false, speechType: "explaining",
    armMotionScale: 0, emphasisLeadArm: "L",
    phrasePhase: 0, elapsed: 0, blinkTimer: 0, debugLogTimer: 0,
    activeClip: null, clipElapsed: 0,
  };

  const gestureSmoothed = {
    spineX: 0, spineZ: 0, headX: 0, headZ: 0,
    lArmX: 0, lArmY: 0, lArmZ: 0,
    rArmX: 0, rArmY: 0, rArmZ: 0,
    lForeX: 0, rForeX: 0,
    lHandX: 0, rHandX: 0, lHandZ: 0, rHandZ: 0,
    lFingerCurl: 0, rFingerCurl: 0,
    lIndexOpen: 0, rIndexOpen: 0,
    lMiddleOpen: 0, rMiddleOpen: 0,
    lRingOpen: 0, rRingOpen: 0,
    lPinkyOpen: 0, rPinkyOpen: 0,
    mouthOpen: 0, countHeadNod: 0,
  };

  const TEACHER_GESTURE_CONFIG = {
    maxArmOffsetRad: 0.038, maxForeOffsetRad: 0.04,
    armAxisOffsetRad: { x: 0.038, y: 0.028, z: 0.032 },
    maxHandZOffsetRad: 0.018,
    maxHeadOffsetRad: THREE.MathUtils.degToRad(10),
    maxSpineOffsetRad: THREE.MathUtils.degToRad(5),
    lerpSpeed: 5.6, armReturnLerpFactor: 1.55,
    idleBreathingAmp: 0.004, debugIntervalSec: 30,
    voiceToBodyCoupling: 1.65,
    lessonIdleEngagementRad: THREE.MathUtils.degToRad(2.2),
    handShoulderHeightMargin: 0.035, elbowHeightMarginScale: 0.65,
    handHeightCorrectMaxRounds: 18, skipArmGestureChance: 0.08,
  };

  const _armDownQ   = { L: null, R: null };
  const _foreDownQ  = { L: null, R: null };
  const _handDownQ  = { L: null, R: null };
  const _foreArmBone = { L: null, R: null };
  const _handBone   = { L: null, R: null };
  const _realArmBone = { L: null, R: null };
  const _fingerBones = { L: [], R: [] };
  const _fingerBaseQ = new Map();
  const _fistArmQ   = { L: null, R: null };
  let _countingClipActive = false;

  const _armDebugRotPrev = new Map();

  // Reusable temporaries
  const _rigWorldShoulder = new THREE.Vector3();
  const _rigWorldHand     = new THREE.Vector3();
  const _rigWorldElbow    = new THREE.Vector3();
  const _rigWorldTmp      = new THREE.Vector3();
  const _fafQ = new THREE.Quaternion();
  const _fafE = new THREE.Euler();

  // ── Utility ────────────────────────────────────────────────────────────────
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function lerpToward(cur, tgt, dt, speed) {
    return THREE.MathUtils.lerp(cur, tgt, Math.min(1, dt * speed));
  }

  // ── Placement / framing ────────────────────────────────────────────────────
  function snapAvatarPlacementToWorldAxis(placement, tag = "snap") {
    const rigSnapRanAlready =
      tag.includes("bbox") &&
      (rigBones.leftFoot || rigBones.rightFoot || rigBones.leftToe || rigBones.rightToe);
    const eps = 0.008;
    for (let pass = 0; pass < 6; pass++) {
      placement.updateWorldMatrix(true, true);
      let groundY = null;
      if (!rigSnapRanAlready) {
        const footBones = [rigBones.leftFoot, rigBones.rightFoot, rigBones.leftToe, rigBones.rightToe].filter(Boolean);
        if (footBones.length) {
          let minF = Infinity;
          for (const b of footBones) { b.getWorldPosition(_rigWorldTmp); if (_rigWorldTmp.y < minF) minF = _rigWorldTmp.y; }
          if (Number.isFinite(minF)) groundY = minF;
        }
      }
      const box = new THREE.Box3().setFromObject(placement);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const dx = c.x, dz = c.z;
      const dy = rigSnapRanAlready ? 0 : (groundY !== null ? groundY : box.min.y);
      const xOk = Math.abs(dx) <= eps, zOk = Math.abs(dz) <= eps;
      const yOk = rigSnapRanAlready || Math.abs(dy) <= eps;
      if (xOk && zOk && yOk) return;
      placement.position.x -= dx;
      if (!rigSnapRanAlready) placement.position.y -= dy;
      placement.position.z -= dz;
    }
  }

  function snapAvatarPlacementFromRig(placement, tag = "rig", maxPasses = 5) {
    const eps = 0.018;
    const footRefs = [rigBones.leftFoot, rigBones.rightFoot, rigBones.leftToe, rigBones.rightToe].filter(Boolean);
    if (!footRefs.length && !rigBones.hips) return false;
    for (let p = 0; p < maxPasses; p++) {
      placement.updateWorldMatrix(true, true);
      let moved = false;
      if (footRefs.length) {
        let minF = Infinity;
        for (const b of footRefs) { b.getWorldPosition(_rigWorldTmp); minF = Math.min(minF, _rigWorldTmp.y); }
        if (Number.isFinite(minF) && Math.abs(minF) > eps) { placement.position.y -= minF; moved = true; }
      }
      if (rigBones.hips) {
        rigBones.hips.getWorldPosition(_rigWorldTmp);
        if (Math.abs(_rigWorldTmp.x) > eps || Math.abs(_rigWorldTmp.z) > eps) {
          placement.position.x -= _rigWorldTmp.x;
          placement.position.z -= _rigWorldTmp.z;
          moved = true;
        }
      }
      if (!moved) return true;
    }
    return true;
  }

  function snapAvatarPlacementFull(placement, tag) {
    const rigRan = snapAvatarPlacementFromRig(placement, `${tag}-rig`);
    snapAvatarPlacementToWorldAxis(placement, `${tag}-bbox`);
    return rigRan;
  }

  function expandAvatarCameraBoundsY(box) {
    const bmin = box.min.clone(), bmax = box.max.clone();
    if (rigBones.head) { rigBones.head.getWorldPosition(_rigWorldTmp); bmax.y = Math.max(bmax.y, _rigWorldTmp.y + 0.18); }
    for (const bone of [rigBones.leftFoot, rigBones.rightFoot, rigBones.leftToe, rigBones.rightToe]) {
      if (!bone) continue; bone.getWorldPosition(_rigWorldTmp); bmin.y = Math.min(bmin.y, _rigWorldTmp.y);
    }
    const size = new THREE.Vector3(Math.max(0.04, bmax.x - bmin.x), Math.max(0.2, bmax.y - bmin.y), Math.max(0.04, bmax.z - bmin.z));
    const center = new THREE.Vector3((bmin.x + bmax.x) * 0.5, (bmin.y + bmax.y) * 0.5, (bmin.z + bmax.z) * 0.5);
    return { bmin, bmax, size, center };
  }

  function reframeCameraFromAvatarRoot(reason = "reframe") {
    if (!avatarRoot) return;
    avatarRoot.updateWorldMatrix(true, true);
    const rawBox = new THREE.Box3().setFromObject(avatarRoot);
    if (rawBox.isEmpty()) return;
    const { bmin, bmax, size, center } = expandAvatarCameraBoundsY(rawBox);
    const distZ = THREE.MathUtils.clamp(size.y * 1.55, 1.8, 5.0);
    const camY = bmin.y + size.y * 0.62;
    const targetY = bmin.y + size.y * 0.52;
    const target = new THREE.Vector3(center.x, targetY, center.z);
    lastAvatarCameraFrame = {
      boxMin: bmin.clone(), boxMax: bmax.clone(), center: center.clone(), size: size.clone(),
      camX: center.x, camY, camZ: center.z + distZ,
      targetX: target.x, targetY: target.y, targetZ: target.z,
      distZ, sizeY: size.y,
    };
    resetTeacherCameraView(reason, lastAvatarCameraFrame);
  }

  function resetTeacherCameraView(reason = "manual", overrides = null) {
    const f = overrides || lastAvatarCameraFrame;
    const target = f ? new THREE.Vector3(f.targetX, f.targetY, f.targetZ) : new THREE.Vector3(0, 1.3, 0);
    const camX = f ? f.camX : 0, camY = f ? f.camY : 1.5, camZ = f ? f.camZ : 2.5;
    camera.position.set(camX, camY, camZ);
    camera.rotation.set(0, 0, 0);
    const vFovDeg = f
      ? THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(f.sizeY / (2 * Math.max(0.01, f.distZ)))) * 1.12, 28, 42)
      : 33;
    camera.fov = vFovDeg;
    camera.near = 0.01; camera.far = 1000;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    controls.target.copy(target);
    const dist = f ? f.distZ : 2.5;
    controls.minDistance = THREE.MathUtils.clamp(dist * 0.55, 1.0, 2.5);
    controls.maxDistance = THREE.MathUtils.clamp(dist * 1.85, 2.5, 6.0);
    controls.minPolarAngle = CAM_VIEW.minPolarAngle;
    controls.maxPolarAngle = CAM_VIEW.maxPolarAngle;
    controls.minAzimuthAngle = CAM_VIEW.minAzimuthAngle;
    controls.maxAzimuthAngle = CAM_VIEW.maxAzimuthAngle;
    controls.update();
  }

  // ── Bone detection ─────────────────────────────────────────────────────────
  function detectTeacherBones(root) {
    const bones = [];
    root.traverse(o => { if (o.isBone) bones.push(o); });
    const pick = (predicates) => {
      for (const pred of predicates)
        for (const b of bones) { const n = String(b.name || "").toLowerCase(); if (pred(n, b)) return b; }
      return null;
    };
    rigBones.hips        = pick([(n) => /^(mixamorig:)?hips$/i.test(n), (n) => /hips/i.test(n)]);
    rigBones.spine       = pick([(n) => /^(mixamorig:)?spine$/i.test(n) || /spine0|spine_00/i.test(n)]);
    rigBones.spine1      = pick([(n) => /^(mixamorig:)?spine1$/i.test(n) || /spine1|spine_01/i.test(n)]);
    rigBones.chest       = pick([(n) => /^(mixamorig:)?spine2$/i.test(n) || /chest|upperchest|spine2/i.test(n)]);
    rigBones.neck        = pick([(n) => /^(mixamorig:)?neck$/i.test(n) || (/neck/i.test(n) && !/head/i.test(n))]);
    rigBones.head        = pick([(n) => /^(mixamorig:)?head$/i.test(n), (n) => /head/i.test(n) && !/tail|end/i.test(n)]);
    rigBones.leftShoulder  = pick([(n) => /^(mixamorig:)?leftshoulder$/i.test(n) || /leftshoulder|l_clavicle/i.test(n)]);
    rigBones.rightShoulder = pick([(n) => /^(mixamorig:)?rightshoulder$/i.test(n) || /rightshoulder|r_clavicle/i.test(n)]);
    rigBones.leftUpperArm  = pick([(n) => /^(mixamorig:)?leftarm$/i.test(n) && !/twist|roll|ik/i.test(n), (n) => /left/.test(n) && /arm/.test(n) && !/fore|lower|hand|twist|roll|ik/i.test(n)]);
    rigBones.rightUpperArm = pick([(n) => /^(mixamorig:)?rightarm$/i.test(n) && !/twist|roll|ik/i.test(n), (n) => /right/.test(n) && /arm/.test(n) && !/fore|lower|hand|twist|roll|ik/i.test(n)]);
    rigBones.leftForeArm   = pick([(n) => /^(mixamorig:)?leftforearm$/i.test(n) && !/twist|roll|ik/i.test(n), (n) => /leftforearm|leftlowerarm|forearm_l/i.test(n) && !/twist|roll|ik/i.test(n)]);
    rigBones.rightForeArm  = pick([(n) => /^(mixamorig:)?rightforearm$/i.test(n) && !/twist|roll|ik/i.test(n), (n) => /rightforearm|rightlowerarm|forearm_r/i.test(n) && !/twist|roll|ik/i.test(n)]);
    rigBones.leftHand  = pick([(n) => /^(mixamorig:)?lefthand$/i.test(n) || /lefthand|hand_l/i.test(n)]);
    rigBones.rightHand = pick([(n) => /^(mixamorig:)?righthand$/i.test(n) || /righthand|hand_r/i.test(n)]);
    rigBones.leftFoot  = pick([(n) => /^(mixamorig:)?leftfoot$/i.test(n) && !/twist|ik|end/i.test(n), (n) => /left.*foot$/i.test(n) && !/toe|twist|ik/i.test(n)]);
    rigBones.rightFoot = pick([(n) => /^(mixamorig:)?rightfoot$/i.test(n) && !/twist|ik|end/i.test(n), (n) => /right.*foot$/i.test(n) && !/toe|twist|ik/i.test(n)]);
    rigBones.leftToe   = pick([(n) => /^(mixamorig:)?lefttoebase$/i.test(n), (n) => /left.*toe/i.test(n) && !/twist|ik/i.test(n)]);
    rigBones.rightToe  = pick([(n) => /^(mixamorig:)?righttoebase$/i.test(n), (n) => /right.*toe/i.test(n) && !/twist|ik/i.test(n)]);
  }

  function alignRigBonesToSkinnedSkeleton(root) {
    const skinned = [];
    root.traverse(o => { if (o.isSkinnedMesh && o.skeleton && Array.isArray(o.skeleton.bones)) skinned.push(o); });
    if (!skinned.length) return;
    let selected = skinned[0], bestScore = -1;
    for (const mesh of skinned) {
      const set = new Set(mesh.skeleton.bones.map(b => String(b.name || "").toLowerCase()));
      const score = ["mixamorig:leftarm","mixamorig:leftforearm","mixamorig:lefthand","mixamorig:rightarm","mixamorig:rightforearm","mixamorig:righthand","leftarm","leftforearm","lefthand","rightarm","rightforearm","righthand"].reduce((a, n) => a + (set.has(n) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; selected = mesh; }
    }
    const bones = selected.skeleton.bones;
    const map = new Map(bones.map(b => [String(b.name || "").toLowerCase(), b]));
    const use = (cur, ...aliases) => { for (const a of aliases) { const h = map.get(String(a).toLowerCase()); if (h) return h; } return cur; };

    allResolvedLeftArmBones.length = 0; allResolvedArmBones.length = 0;
    for (const b of bones) {
      const n = String(b.name || "").toLowerCase();
      if (/left/.test(n) && /(shoulder|clavicle|upperarm|arm|fore|lowerarm|hand|wrist)/.test(n)) allResolvedLeftArmBones.push(b);
      if (/(shoulder|clavicle|upperarm|forearm|lowerarm|hand|wrist|arm)/.test(n) && !/armature/.test(n)) allResolvedArmBones.push(b);
    }

    const parentBone = b => (b?.parent && b.parent.isBone ? b.parent : null);
    const resolveLeft = () => {
      const lh = bones.find(b => /left.*hand|hand.*left|lefthand|hand_l/i.test(b.name));
      if (!lh) return null;
      const fore = parentBone(lh), upper = parentBone(fore), shoulder = parentBone(upper);
      const valid = (n, rx) => (n && rx.test(String(n.name || "").toLowerCase()) ? n : null);
      return { hand: valid(lh, /hand|wrist/), fore: valid(fore, /fore|lowerarm|arm/), upper: valid(upper, /arm|upperarm/), shoulder: valid(shoulder, /shoulder|clavicle|arm/) };
    };
    const resolveWorldSide = (side) => {
      if (avatarRoot) avatarRoot.updateMatrixWorld(true);
      const chestRef = rigBones.chest || rigBones.spine1 || rigBones.spine || bones[0];
      if (!chestRef) return null;
      chestRef.getWorldPosition(_rigWorldTmp);
      const chestX = _rigWorldTmp.x;
      let bestLeaf = null, bestSc = -Infinity;
      for (const b of bones) {
        const hasBoneChild = Array.isArray(b.children) && b.children.some(c => c.isBone);
        if (hasBoneChild) continue;
        b.getWorldPosition(_rigWorldHand);
        const sideOk = side === "L" ? _rigWorldHand.x < chestX : _rigWorldHand.x > chestX;
        if (!sideOk) continue;
        const sc = Math.abs(_rigWorldHand.x - chestX) * 1.8 + _rigWorldHand.y * 0.2;
        if (sc > bestSc) { bestSc = sc; bestLeaf = b; }
      }
      if (!bestLeaf) return null;
      const fore = parentBone(bestLeaf), upper = parentBone(fore), shoulder = parentBone(upper);
      return { hand: bestLeaf, fore, upper, shoulder, score: bestSc };
    };

    rigBones.leftShoulder  = use(rigBones.leftShoulder,  "LeftShoulder",  "mixamorig:LeftShoulder");
    rigBones.rightShoulder = use(rigBones.rightShoulder, "RightShoulder", "mixamorig:RightShoulder");
    rigBones.leftUpperArm  = use(rigBones.leftUpperArm,  "LeftArm",       "mixamorig:LeftArm");
    rigBones.rightUpperArm = use(rigBones.rightUpperArm, "RightArm",      "mixamorig:RightArm");
    rigBones.leftForeArm   = use(rigBones.leftForeArm,   "LeftForeArm",   "mixamorig:LeftForeArm");
    rigBones.rightForeArm  = use(rigBones.rightForeArm,  "RightForeArm",  "mixamorig:RightForeArm");
    rigBones.leftHand      = use(rigBones.leftHand,      "LeftHand",      "mixamorig:LeftHand");
    rigBones.rightHand     = use(rigBones.rightHand,     "RightHand",     "mixamorig:RightHand");
    rigBones.hips          = use(rigBones.hips,          "Hips",          "mixamorig:Hips");
    rigBones.leftFoot      = use(rigBones.leftFoot,      "LeftFoot",      "mixamorig:LeftFoot");
    rigBones.rightFoot     = use(rigBones.rightFoot,     "RightFoot",     "mixamorig:RightFoot");
    rigBones.leftToe       = use(rigBones.leftToe,       "LeftToeBase",   "mixamorig:LeftToeBase");
    rigBones.rightToe      = use(rigBones.rightToe,      "RightToeBase",  "mixamorig:RightToeBase");

    const lc = resolveLeft();
    if (lc) {
      rigBones.leftHand      = lc.hand      || rigBones.leftHand;
      rigBones.leftForeArm   = lc.fore      || rigBones.leftForeArm;
      rigBones.leftUpperArm  = lc.upper     || rigBones.leftUpperArm;
      rigBones.leftShoulder  = lc.shoulder  || rigBones.leftShoulder;
    }
    const sl = resolveWorldSide("L"), sr = resolveWorldSide("R");
    if (sl?.upper) { rigBones.leftHand = sl.hand || rigBones.leftHand; rigBones.leftForeArm = sl.fore || rigBones.leftForeArm; rigBones.leftUpperArm = sl.upper || rigBones.leftUpperArm; rigBones.leftShoulder = sl.shoulder || rigBones.leftShoulder; }
    if (sr?.upper) { rigBones.rightHand = sr.hand || rigBones.rightHand; rigBones.rightForeArm = sr.fore || rigBones.rightForeArm; rigBones.rightUpperArm = sr.upper || rigBones.rightUpperArm; rigBones.rightShoulder = sr.shoulder || rigBones.rightShoulder; }
  }

  function findRealArmBonesSpatially() {
    if (!avatarRoot) return;
    avatarRoot.updateMatrixWorld(true);
    const byName = {};
    avatarRoot.traverse(o => { if (o.isBone) byName[o.name] = o; });
    _realArmBone.L = byName["RightArm"]     || null;
    _realArmBone.R = byName["LeftArm"]      || null;
    _foreArmBone.L = byName["RightForeArm"] || null;
    _foreArmBone.R = byName["LeftForeArm"]  || null;
  }

  function getShoulderReferenceWorldY(side) {
    let maxY = -Infinity;
    const list = side === "L" ? [rigBones.leftShoulder, rigBones.leftUpperArm] : [rigBones.rightShoulder, rigBones.rightUpperArm];
    for (const b of list) { if (!b) continue; b.getWorldPosition(_rigWorldShoulder); if (_rigWorldShoulder.y > maxY) maxY = _rigWorldShoulder.y; }
    return Number.isFinite(maxY) ? maxY : null;
  }

  function getTeacherAnimatedBones() {
    return [rigBones.spine, rigBones.spine1, rigBones.chest, rigBones.neck, rigBones.head, rigBones.leftShoulder, rigBones.rightShoulder, rigBones.leftUpperArm, rigBones.rightUpperArm, rigBones.leftForeArm, rigBones.rightForeArm, rigBones.leftHand, rigBones.rightHand].filter(Boolean);
  }

  // ── Arm posing ─────────────────────────────────────────────────────────────
  function poseArmsAtSide() {
    if (!avatarRoot) return;
    avatarRoot.updateMatrixWorld(true);
    const rotateToDown = (bone, endBone, side, label, targetDir = new THREE.Vector3(0, -1, 0)) => {
      if (!bone || !endBone) return null;
      const bp = new THREE.Vector3(); bone.getWorldPosition(bp);
      const ep = new THREE.Vector3(); endBone.getWorldPosition(ep);
      const currentDir = ep.clone().sub(bp).normalize();
      if (currentDir.angleTo(targetDir) < THREE.MathUtils.degToRad(1)) return bone.quaternion.clone();
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);
      const curWorldQ = new THREE.Quaternion(); bone.getWorldQuaternion(curWorldQ);
      const newWorldQ = worldDelta.clone().multiply(curWorldQ);
      const parentWorldQ = new THREE.Quaternion(); bone.parent.getWorldQuaternion(parentWorldQ);
      const localQ = parentWorldQ.clone().invert().multiply(newWorldQ);
      bone.quaternion.copy(localQ);
      avatarRoot.updateMatrixWorld(true);
      return localQ;
    };
    const byName = {};
    avatarRoot.traverse(o => { if (o.isBone) byName[o.name] = o; });
    const aPoseAngle = THREE.MathUtils.degToRad(15);
    const sinA = Math.sin(aPoseAngle), cosA = Math.cos(aPoseAngle);
    const armPairs = [
      { upperArm: byName["LeftArm"],  hand: byName["LeftHand"],  side: "L_avatar" },
      { upperArm: byName["RightArm"], hand: byName["RightHand"], side: "R_avatar" },
    ];
    armPairs.forEach(({ upperArm, hand }) => {
      if (!upperArm) return;
      const wp = new THREE.Vector3(); upperArm.getWorldPosition(wp);
      const worldSide = (wp.x >= 0) ? "R" : "L";
      const outward = (worldSide === "R") ? sinA : -sinA;
      const armTarget = new THREE.Vector3(outward, -cosA, 0).normalize();
      const q = rotateToDown(upperArm, hand, worldSide, "upperArm→hand", armTarget);
      if (q) { _armDownQ[worldSide] = q; _realArmBone[worldSide] = upperArm; }
      if (hand) {
        const middleFinger = hand.children.find(c => c.isBone && /middle/i.test(c.name)) || hand.children.find(c => c.isBone);
        if (middleFinger) {
          const hq = rotateToDown(hand, middleFinger, worldSide, "hand→finger");
          if (hq) {
            const hwp = new THREE.Vector3(); hand.getWorldPosition(hwp);
            const ws = (hwp.x >= 0) ? "R" : "L";
            _handDownQ[ws] = hq; _handBone[ws] = hand;
          }
        }
      }
    });
    avatarRoot.updateMatrixWorld(true);
  }

  function captureFingerBasePose() {
    if (!avatarRoot) return;
    avatarRoot.updateMatrixWorld(true);
    _fingerBones.L = []; _fingerBones.R = []; _fingerBaseQ.clear();
    const byName = {};
    avatarRoot.traverse(o => { if (o.isBone) byName[o.name] = o; });
    for (const boneName of ["LeftHand", "RightHand"]) {
      const handBone = byName[boneName];
      if (!handBone) continue;
      const hwp = new THREE.Vector3(); handBone.getWorldPosition(hwp);
      const side = hwp.x >= 0 ? "R" : "L";
      handBone.traverse(o => {
        if (!o.isBone || o === handBone) return;
        if (!/thumb|index|middle|ring|pinky|finger/i.test(o.name)) return;
        const isThumb = /thumb/i.test(o.name), isIndex = /index/i.test(o.name);
        const isMiddle = /middle/i.test(o.name), isRing = /ring/i.test(o.name), isPinky = /pinky|little/i.test(o.name);
        _fingerBones[side].push({ bone: o, isThumb, isIndex, isMiddle, isRing, isPinky });
        _fingerBaseQ.set(o.uuid, o.quaternion.clone());
      });
    }
  }

  function computeFistArmQuaternions() {
    if (!avatarRoot) return;
    avatarRoot.updateMatrixWorld(true);
    const targets = {
      L: new THREE.Vector3(-0.12, -0.60, 0.78).normalize(),
      R: new THREE.Vector3( 0.12, -0.60, 0.78).normalize(),
    };
    ["L", "R"].forEach(side => {
      const arm = _realArmBone[side], fore = _foreArmBone[side];
      if (!arm || !fore) return;
      const base = arm.userData?.baseRotation;
      if (base) { arm.rotation.order = base.order; arm.rotation.copy(base); }
      avatarRoot.updateMatrixWorld(true);
      const armPos = new THREE.Vector3(); arm.getWorldPosition(armPos);
      const forePos = new THREE.Vector3(); fore.getWorldPosition(forePos);
      const currentDir = forePos.clone().sub(armPos).normalize();
      if (currentDir.lengthSq() < 1e-6) return;
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(currentDir, targets[side]);
      const curWorldQ = new THREE.Quaternion(); arm.getWorldQuaternion(curWorldQ);
      const newWorldQ = worldDelta.clone().multiply(curWorldQ);
      const parentWorldQ = new THREE.Quaternion(); arm.parent.getWorldQuaternion(parentWorldQ);
      _fistArmQ[side] = parentWorldQ.clone().invert().multiply(newWorldQ);
    });
  }

  function captureArmChainBaseRotations() {
    const chain = [rigBones.leftShoulder, rigBones.rightShoulder, rigBones.leftUpperArm, rigBones.rightUpperArm, rigBones.leftForeArm, rigBones.rightForeArm, rigBones.leftHand, rigBones.rightHand, rigBones.spine, rigBones.neck, ...allResolvedLeftArmBones, ...allResolvedArmBones].filter(Boolean);
    for (const bone of chain) bone.userData.baseRotation = bone.rotation.clone();
    return chain.length;
  }

  function captureTeacherBaseRotations() {
    teacherRigReady = false;
    captureArmChainBaseRotations();
    const list = getTeacherAnimatedBones();
    for (const bone of list) bone.userData.baseRotation = bone.rotation.clone();
    teacherRigReady = list.length > 0;
    if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  }

  // ── Per-frame arm forcing ─────────────────────────────────────────────────
  function forceArmDownEveryFrame() {
    if (!avatarRoot || !teacherRigReady) return;
    ["L", "R"].forEach(side => {
      const upperArm = _realArmBone[side];
      const armBaseQ = (_countingClipActive && _fistArmQ[side]) ? _fistArmQ[side] : _armDownQ[side];
      if (upperArm && armBaseQ) {
        upperArm.quaternion.copy(armBaseQ);
        const ox = side === "L" ? gestureSmoothed.lArmX : gestureSmoothed.rArmX;
        const oy = side === "L" ? gestureSmoothed.lArmY : gestureSmoothed.rArmY;
        const oz = side === "L" ? gestureSmoothed.lArmZ : gestureSmoothed.rArmZ;
        if (!_countingClipActive && (ox !== 0 || oy !== 0 || oz !== 0)) {
          _fafE.set(ox, oy, oz, upperArm.rotation.order || "XYZ");
          _fafQ.setFromEuler(_fafE); upperArm.quaternion.multiply(_fafQ);
        } else if (_countingClipActive && ox !== 0) {
          _fafE.set(ox, 0, 0, upperArm.rotation.order || "XYZ");
          _fafQ.setFromEuler(_fafE); upperArm.quaternion.multiply(_fafQ);
        }
      }
      const foreArm = _foreArmBone[side];
      if (foreArm) {
        if (_foreDownQ[side]) { foreArm.quaternion.copy(_foreDownQ[side]); }
        else { const fb = foreArm.userData?.baseRotation; if (fb) { foreArm.rotation.order = fb.order; foreArm.rotation.copy(fb); } }
        const fx = side === "L" ? gestureSmoothed.lForeX : gestureSmoothed.rForeX;
        if (Math.abs(fx) > 0.001) { _fafE.set(fx, 0, 0, foreArm.rotation.order || "XYZ"); _fafQ.setFromEuler(_fafE); foreArm.quaternion.multiply(_fafQ); }
      }
      const hand = _handBone[side];
      if (hand && _handDownQ[side]) {
        hand.quaternion.copy(_handDownQ[side]);
        const hx = side === "L" ? gestureSmoothed.lHandX : gestureSmoothed.rHandX;
        const hz = side === "L" ? gestureSmoothed.lHandZ : gestureSmoothed.rHandZ;
        if (hx !== 0 || hz !== 0) { _fafE.set(hx, 0, hz, hand.rotation.order || "XYZ"); _fafQ.setFromEuler(_fafE); hand.quaternion.multiply(_fafQ); }
      }
      const curlRaw = side === "L" ? gestureSmoothed.lFingerCurl : gestureSmoothed.rFingerCurl;
      const idxOpen  = side === "L" ? gestureSmoothed.lIndexOpen  : gestureSmoothed.rIndexOpen;
      const midOpen  = side === "L" ? gestureSmoothed.lMiddleOpen : gestureSmoothed.rMiddleOpen;
      const ringOpen = side === "L" ? gestureSmoothed.lRingOpen   : gestureSmoothed.rRingOpen;
      const pinkyOpen = side === "L" ? gestureSmoothed.lPinkyOpen : gestureSmoothed.rPinkyOpen;
      const fingerList = _fingerBones[side];
      const anyFinger = curlRaw !== 0 || idxOpen !== 0 || midOpen !== 0 || ringOpen !== 0 || pinkyOpen !== 0;
      if (fingerList.length > 0 && anyFinger) {
        const MAX_CURL_RAD = THREE.MathUtils.degToRad(70);
        for (const { bone, isThumb, isIndex, isMiddle, isRing, isPinky } of fingerList) {
          const baseQ = _fingerBaseQ.get(bone.uuid);
          if (!baseQ) continue;
          bone.quaternion.copy(baseQ);
          let openOverride = 0;
          if (isIndex) openOverride = idxOpen;
          else if (isMiddle) openOverride = midOpen;
          else if (isRing) openOverride = ringOpen;
          else if (isPinky) openOverride = pinkyOpen;
          const effectiveCurl = curlRaw * (1 - openOverride);
          if (Math.abs(effectiveCurl) < 0.001) continue;
          const angle = effectiveCurl * MAX_CURL_RAD;
          if (isThumb) { _fafE.set(angle * 0.4, angle * 0.5, 0, bone.rotation.order || "XYZ"); }
          else { _fafE.set(angle, 0, 0, bone.rotation.order || "XYZ"); }
          _fafQ.setFromEuler(_fafE); bone.quaternion.multiply(_fafQ);
        }
      }
    });
  }

  function forceNeutralTeacherArmPoseEveryFrame() {
    if (!teacherRigReady) return;
    const armChain = [rigBones.leftShoulder, rigBones.rightShoulder, rigBones.leftUpperArm, rigBones.rightUpperArm, rigBones.leftForeArm, rigBones.rightForeArm, rigBones.leftHand, rigBones.rightHand].filter(Boolean);
    for (const bone of armChain) { const b = bone?.userData?.baseRotation; if (!b) continue; bone.rotation.order = b.order; bone.rotation.copy(b); }
    for (const b of allResolvedLeftArmBones) { const base = b?.userData?.baseRotation; if (!base) continue; b.rotation.order = base.order; b.rotation.copy(base); }
    for (const b of allResolvedArmBones) { const base = b?.userData?.baseRotation; if (!base) continue; b.rotation.order = base.order; b.rotation.copy(base); }
  }

  function armSafetyHardLockBeforeRender() {} // no-op — native GLB pose used

  function applyMandatoryArmSafetyEulerClamp(bone, _label, silent) {
    const b = bone?.userData?.baseRotation;
    if (!bone || !b) return { clamped: false, logs: [] };
    const n = String(bone.name || "").toLowerCase();
    let d = ARM_SAFETY_BASE_DELTA_RAD.default;
    if (/shoulder|clavicle/.test(n)) d = ARM_SAFETY_BASE_DELTA_RAD.shoulder;
    else if (/fore|lowerarm/.test(n)) d = ARM_SAFETY_BASE_DELTA_RAD.foreArm;
    else if (/hand|wrist/.test(n)) d = ARM_SAFETY_BASE_DELTA_RAD.hand;
    else if (/arm/.test(n) && !/fore|lower|hand/.test(n)) d = ARM_SAFETY_BASE_DELTA_RAD.upperArm;
    bone.rotation.order = b.order || bone.rotation.order || "XYZ";
    bone.rotation.set(
      THREE.MathUtils.clamp(bone.rotation.x, b.x - d, b.x + d),
      THREE.MathUtils.clamp(bone.rotation.y, b.y - d, b.y + d),
      THREE.MathUtils.clamp(bone.rotation.z, b.z - d, b.z + d),
    );
    return { clamped: false, logs: [] };
  }

  // ── Body animation ─────────────────────────────────────────────────────────
  function getActiveAudio()           { return null; }
  function getMaxJawInfluenceForBody() { return 0; }

  function updateTeacherBodyAnimation(dt) {
    if (!teacherRigReady) return;
    teacherAnim.elapsed += dt;
    teacherAnim.blinkTimer += dt;
    teacherAnim.debugLogTimer -= dt;

    if (ARM_DEBUG_CONFIG.freezeArms) {
      const fb = [rigBones.spine, rigBones.spine1, rigBones.chest, rigBones.neck, rigBones.head].filter(Boolean);
      for (const b of fb) { const base = b?.userData?.baseRotation; if (!base) continue; b.rotation.order = base.order; b.rotation.copy(base); }
      Object.keys(gestureSmoothed).forEach(k => { gestureSmoothed[k] = 0; });
      forceNeutralTeacherArmPoseEveryFrame();
      if (teacherAnim.blinkTimer > 2.6) { teacherAnim.blinkTimer = 0; blinkOnce(); }
      return;
    }

    const cfg = TEACHER_GESTURE_CONFIG;
    const t = teacherAnim.elapsed;
    const breath = Math.sin(t * 1.7) * cfg.idleBreathingAmp;
    const idleSway = Math.sin(t * 0.85) * (cfg.idleBreathingAmp * 0.6);

    const activeAudio = getActiveAudio();
    const liveLesson = false;
    const liveVoice = speechIsActive && activeAudio ? 1 : (teacherAnim.speaking ? 0.28 : 0);
    const jaw = speechIsActive ? getMaxJawInfluenceForBody() : 0;
    const audioT = 0;
    const audioPulse = 0;
    const voiceEngage = THREE.MathUtils.clamp(jaw * cfg.voiceToBodyCoupling * liveVoice + audioPulse * 0.26 * liveVoice, 0, 1);

    const speakWave = teacherAnim.speaking ? Math.sin(t * 3.2 + teacherAnim.phrasePhase) : 0;
    const ph = teacherAnim.phrasePhase;

    const lessonIdle = liveLesson && !speechIsActive && !teacherAnim.speaking;
    const idleEng = lessonIdle ? cfg.lessonIdleEngagementRad : 0;
    const tgtSpineX = breath + idleSway * 0.35 + idleEng * Math.sin(t * 0.88 + ph) * 0.35;
    const tgtSpineZ = idleSway * 0.5 + idleEng * Math.sin(t * 0.62 + ph * 1.3) * 0.55;
    const headBob = teacherAnim.speaking ? speakWave * THREE.MathUtils.degToRad(5) : Math.sin(t * 0.75) * THREE.MathUtils.degToRad(1.2);
    const headTiltZ = teacherAnim.speechType === "asking" ? THREE.MathUtils.degToRad(4) : 0;
    const jawNod = speechIsActive ? jaw * THREE.MathUtils.degToRad(3.2) : 0;
    const tgtHeadX = headBob * 0.35 + jawNod * 0.55 + gestureSmoothed.countHeadNod;
    const tgtHeadZ = headTiltZ * (teacherAnim.speaking ? 1 : 0.25) + idleEng * Math.sin(t * 0.5 + ph) * 0.45;

    const sp = cfg.lerpSpeed;
    gestureSmoothed.spineX = lerpToward(gestureSmoothed.spineX, tgtSpineX, dt, sp);
    gestureSmoothed.spineZ = lerpToward(gestureSmoothed.spineZ, tgtSpineZ, dt, sp);
    gestureSmoothed.headX  = lerpToward(gestureSmoothed.headX,  tgtHeadX,  dt, sp);
    gestureSmoothed.headZ  = lerpToward(gestureSmoothed.headZ,  tgtHeadZ,  dt, sp);

    const clip = teacherAnim.activeClip;
    if (clip && teacherAnim.speaking) {
      teacherAnim.clipElapsed += dt;
      if (!clip.loop && clip.duration != null && teacherAnim.clipElapsed > clip.duration) {
        teacherAnim.activeClip = null; teacherAnim.clipElapsed = 0;
        Object.keys(gestureSmoothed).forEach(k => { if (k !== "spineX" && k !== "spineZ" && k !== "headX" && k !== "headZ") gestureSmoothed[k] = 0; });
      } else {
        const off = clip.update(teacherAnim.clipElapsed) || {};
        gestureSmoothed.lArmX      = lerpToward(gestureSmoothed.lArmX,      off.lArmX      ?? 0, dt, sp);
        gestureSmoothed.lArmY      = lerpToward(gestureSmoothed.lArmY,      off.lArmY      ?? 0, dt, sp);
        gestureSmoothed.lArmZ      = lerpToward(gestureSmoothed.lArmZ,      off.lArmZ      ?? 0, dt, sp);
        gestureSmoothed.rArmX      = lerpToward(gestureSmoothed.rArmX,      off.rArmX      ?? 0, dt, sp);
        gestureSmoothed.rArmY      = lerpToward(gestureSmoothed.rArmY,      off.rArmY      ?? 0, dt, sp);
        gestureSmoothed.rArmZ      = lerpToward(gestureSmoothed.rArmZ,      off.rArmZ      ?? 0, dt, sp);
        gestureSmoothed.lForeX     = lerpToward(gestureSmoothed.lForeX,     off.lForeX     ?? 0, dt, sp);
        gestureSmoothed.rForeX     = lerpToward(gestureSmoothed.rForeX,     off.rForeX     ?? 0, dt, sp);
        gestureSmoothed.lHandX     = lerpToward(gestureSmoothed.lHandX,     off.lHandX     ?? 0, dt, sp);
        gestureSmoothed.rHandX     = lerpToward(gestureSmoothed.rHandX,     off.rHandX     ?? 0, dt, sp);
        gestureSmoothed.lHandZ     = lerpToward(gestureSmoothed.lHandZ,     off.lHandZ     ?? 0, dt, sp);
        gestureSmoothed.rHandZ     = lerpToward(gestureSmoothed.rHandZ,     off.rHandZ     ?? 0, dt, sp);
        gestureSmoothed.lFingerCurl  = lerpToward(gestureSmoothed.lFingerCurl,  off.lFingerCurl  ?? 0, dt, sp);
        gestureSmoothed.rFingerCurl  = lerpToward(gestureSmoothed.rFingerCurl,  off.rFingerCurl  ?? 0, dt, sp);
        gestureSmoothed.lIndexOpen   = lerpToward(gestureSmoothed.lIndexOpen,   off.lIndexOpen   ?? 0, dt, sp);
        gestureSmoothed.rIndexOpen   = lerpToward(gestureSmoothed.rIndexOpen,   off.rIndexOpen   ?? 0, dt, sp);
        gestureSmoothed.lMiddleOpen  = lerpToward(gestureSmoothed.lMiddleOpen,  off.lMiddleOpen  ?? 0, dt, sp);
        gestureSmoothed.rMiddleOpen  = lerpToward(gestureSmoothed.rMiddleOpen,  off.rMiddleOpen  ?? 0, dt, sp);
        gestureSmoothed.lRingOpen    = lerpToward(gestureSmoothed.lRingOpen,    off.lRingOpen    ?? 0, dt, sp);
        gestureSmoothed.rRingOpen    = lerpToward(gestureSmoothed.rRingOpen,    off.rRingOpen    ?? 0, dt, sp);
        gestureSmoothed.lPinkyOpen   = lerpToward(gestureSmoothed.lPinkyOpen,   off.lPinkyOpen   ?? 0, dt, sp);
        gestureSmoothed.rPinkyOpen   = lerpToward(gestureSmoothed.rPinkyOpen,   off.rPinkyOpen   ?? 0, dt, sp);
        gestureSmoothed.mouthOpen    = lerpToward(gestureSmoothed.mouthOpen,    off.mouthOpen    ?? 0, dt, sp * 1.5);
        gestureSmoothed.countHeadNod = lerpToward(gestureSmoothed.countHeadNod, off.countHeadNod ?? 0, dt, sp);
      }
    } else {
      gestureSmoothed.lArmX = lerpToward(gestureSmoothed.lArmX, 0, dt, sp);
      gestureSmoothed.lArmY = lerpToward(gestureSmoothed.lArmY, 0, dt, sp);
      gestureSmoothed.lArmZ = lerpToward(gestureSmoothed.lArmZ, 0, dt, sp);
      gestureSmoothed.rArmX = lerpToward(gestureSmoothed.rArmX, 0, dt, sp);
      gestureSmoothed.rArmY = lerpToward(gestureSmoothed.rArmY, 0, dt, sp);
      gestureSmoothed.rArmZ = lerpToward(gestureSmoothed.rArmZ, 0, dt, sp);
      gestureSmoothed.lForeX = lerpToward(gestureSmoothed.lForeX, 0, dt, sp);
      gestureSmoothed.rForeX = lerpToward(gestureSmoothed.rForeX, 0, dt, sp);
      gestureSmoothed.lHandX = lerpToward(gestureSmoothed.lHandX, 0, dt, sp);
      gestureSmoothed.rHandX = lerpToward(gestureSmoothed.rHandX, 0, dt, sp);
      gestureSmoothed.lHandZ = lerpToward(gestureSmoothed.lHandZ, 0, dt, sp);
      gestureSmoothed.rHandZ = lerpToward(gestureSmoothed.rHandZ, 0, dt, sp);
      gestureSmoothed.mouthOpen    = lerpToward(gestureSmoothed.mouthOpen,    0, dt, sp * 1.5);
      gestureSmoothed.countHeadNod = lerpToward(gestureSmoothed.countHeadNod, 0, dt, sp);
      const it = t, idleSp = sp * 0.35;
      const idleCurl = 0.06 + Math.sin(it * 0.75) * 0.03;
      gestureSmoothed.lFingerCurl = lerpToward(gestureSmoothed.lFingerCurl, idleCurl, dt, idleSp);
      gestureSmoothed.rFingerCurl = lerpToward(gestureSmoothed.rFingerCurl, idleCurl + Math.sin(it * 0.58) * 0.015, dt, idleSp);
      gestureSmoothed.lIndexOpen  = lerpToward(gestureSmoothed.lIndexOpen,  Math.max(0, 0.07 + Math.sin(it * 0.72 + 0.0) * 0.04), dt, idleSp);
      gestureSmoothed.rIndexOpen  = lerpToward(gestureSmoothed.rIndexOpen,  Math.max(0, 0.07 + Math.sin(it * 0.72 + 0.8) * 0.04), dt, idleSp);
      gestureSmoothed.lMiddleOpen = lerpToward(gestureSmoothed.lMiddleOpen, Math.max(0, 0.06 + Math.sin(it * 0.68 + 1.5) * 0.04), dt, idleSp);
      gestureSmoothed.rMiddleOpen = lerpToward(gestureSmoothed.rMiddleOpen, Math.max(0, 0.06 + Math.sin(it * 0.68 + 2.2) * 0.04), dt, idleSp);
      gestureSmoothed.lRingOpen   = lerpToward(gestureSmoothed.lRingOpen,   Math.max(0, 0.05 + Math.sin(it * 0.81 + 2.8) * 0.03), dt, idleSp);
      gestureSmoothed.rRingOpen   = lerpToward(gestureSmoothed.rRingOpen,   Math.max(0, 0.05 + Math.sin(it * 0.81 + 3.5) * 0.03), dt, idleSp);
      gestureSmoothed.lPinkyOpen  = lerpToward(gestureSmoothed.lPinkyOpen,  Math.max(0, 0.04 + Math.sin(it * 0.91 + 4.0) * 0.03), dt, idleSp);
      gestureSmoothed.rPinkyOpen  = lerpToward(gestureSmoothed.rPinkyOpen,  Math.max(0, 0.04 + Math.sin(it * 0.91 + 4.7) * 0.03), dt, idleSp);
    }

    const spineBone = rigBones.spine || rigBones.spine1 || rigBones.chest;
    const headBone  = rigBones.head  || rigBones.neck;

    for (const bone of getTeacherAnimatedBones()) {
      const b = bone?.userData?.baseRotation;
      if (!bone || !b) continue;
      bone.rotation.order = b.order; bone.rotation.copy(b);
    }

    if (spineBone) {
      const b = spineBone.userData?.baseRotation;
      if (b) {
        spineBone.rotation.order = b.order;
        spineBone.rotation.set(
          b.x + THREE.MathUtils.clamp(gestureSmoothed.spineX, -cfg.maxSpineOffsetRad, cfg.maxSpineOffsetRad),
          b.y,
          b.z + THREE.MathUtils.clamp(gestureSmoothed.spineZ, -cfg.maxSpineOffsetRad, cfg.maxSpineOffsetRad),
        );
      }
    }
    if (headBone) {
      const b = headBone.userData?.baseRotation;
      if (b) {
        headBone.rotation.order = b.order;
        headBone.rotation.set(
          b.x + THREE.MathUtils.clamp(gestureSmoothed.headX, -cfg.maxHeadOffsetRad, cfg.maxHeadOffsetRad),
          b.y,
          b.z + THREE.MathUtils.clamp(gestureSmoothed.headZ, -cfg.maxHeadOffsetRad, cfg.maxHeadOffsetRad),
        );
      }
    }

    if (gestureSmoothed.mouthOpen > 0.01) addTarget(groups.mouthOpen(), gestureSmoothed.mouthOpen);

    forceNeutralTeacherArmPoseEveryFrame();
    applyMandatoryArmSafetyEulerClamp(rigBones.leftShoulder,  "LeftShoulder",  true);
    applyMandatoryArmSafetyEulerClamp(rigBones.rightShoulder, "RightShoulder", true);
    applyMandatoryArmSafetyEulerClamp(rigBones.leftUpperArm,  "LeftArm",       true);
    applyMandatoryArmSafetyEulerClamp(rigBones.rightUpperArm, "RightArm",      true);
    applyMandatoryArmSafetyEulerClamp(rigBones.leftForeArm,   "LeftFore",      true);
    applyMandatoryArmSafetyEulerClamp(rigBones.rightForeArm,  "RightFore",     true);
    applyMandatoryArmSafetyEulerClamp(rigBones.leftHand,      "LeftHand",      true);
    applyMandatoryArmSafetyEulerClamp(rigBones.rightHand,     "RightHand",     true);

    if (teacherAnim.blinkTimer > (teacherAnim.speaking ? 3.6 : 2.6)) {
      teacherAnim.blinkTimer = 0; blinkOnce();
    }
  }

  // ── Morph targets ──────────────────────────────────────────────────────────
  function discoverMorphMeshes(root) {
    morphMeshes = []; morphGroupCache.clear();
    root.traverse(o => { if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) morphMeshes.push(o); });
  }

  function collectByRegex(regexList) {
    const out = [];
    for (const mesh of morphMeshes) {
      for (const [name, idx] of Object.entries(mesh.morphTargetDictionary || {}))
        if (regexList.some(rx => rx.test(name))) out.push({ mesh, name, idx });
    }
    return out;
  }

  function collectByNames(nameList) {
    const out = [], wanted = new Set(nameList.map(n => String(n).toLowerCase()));
    for (const mesh of morphMeshes)
      for (const [name, idx] of Object.entries(mesh.morphTargetDictionary || {}))
        if (wanted.has(String(name).toLowerCase())) out.push({ mesh, name, idx });
    return out;
  }

  function getMorphGroupCached(name) {
    const key = String(name || "").toLowerCase();
    if (!key) return [];
    if (morphGroupCache.has(key)) return morphGroupCache.get(key);
    const g = collectByNames([name]); morphGroupCache.set(key, g); return g;
  }

  function mergeGroups(...gs) {
    const merged = [], seen = new Set();
    for (const g of gs) for (const item of g) {
      const k = `${item.mesh.uuid}:${item.idx}`;
      if (!seen.has(k)) { seen.add(k); merged.push(item); }
    }
    return merged;
  }

  function setMorphGroup(group, value) {
    for (const item of group) item.mesh.morphTargetInfluences[item.idx] = clamp01(value);
  }

  function addTarget(group, value) {
    for (const item of group) {
      const key = `${item.mesh.uuid}:${item.idx}`;
      smoothTargets.set(key, { mesh: item.mesh, idx: item.idx, value: clamp01(value) });
    }
  }

  function clearTargets() { smoothTargets.clear(); }

  const groups = {
    mouthOpen: () => mergeGroups(collectByNames(["jawOpen"]), collectByRegex([/mouthopen/i, /jawopen/i])),
    mouthClose: () => collectByNames(["mouthClose", "sil"]),
    smile: () => mergeGroups(collectByNames(["mouthSmileLeft", "mouthSmileRight"]), collectByRegex([/smile/i, /mouthsmile/i, /happy/i])),
    blink: () => mergeGroups(collectByNames(["eyeBlinkLeft", "eyeBlinkRight"]), collectByRegex([/blink/i, /eyeclose/i, /eyelid/i])),
    browUp: () => mergeGroups(collectByNames(["browInnerUp", "browOuterUpLeft", "browOuterUpRight"]), collectByRegex([/browup/i, /eyebrowup/i, /surprise/i])),
    browDown: () => mergeGroups(collectByNames(["browDownLeft", "browDownRight"]), collectByRegex([/browdown/i, /frown/i, /angry/i])),
    sad: () => mergeGroups(collectByNames(["mouthFrownLeft", "mouthFrownRight"]), collectByRegex([/sad/i, /mouthfrown/i])),
    pucker: () => collectByNames(["mouthPucker"]),
    press: () => collectByNames(["mouthPressLeft", "mouthPressRight", "PP"]),
  };

  function neutralFace() {
    clearTargets();
    for (const mesh of morphMeshes) {
      const infl = mesh.morphTargetInfluences || [];
      for (let i = 0; i < infl.length; i++) infl[i] = infl[i] * 0.6;
    }
  }

  function blinkOnce() {
    const blinkGroup = groups.blink();
    setMorphGroup(blinkGroup, 1.0);
    setTimeout(() => setMorphGroup(blinkGroup, 0.0), 120);
  }

  function applyEmotionTargets(mode, intensity = 1) {
    const k = clamp01(intensity);
    if (mode === "happy") { addTarget(groups.smile(), 0.85 * k); addTarget(groups.browUp(), 0.28 * k); return; }
    if (mode === "sad") { addTarget(groups.sad(), 0.9 * k); addTarget(collectByNames(["browInnerUp"]), 0.5 * k); return; }
    if (mode === "angry") { addTarget(groups.browDown(), 0.95 * k); addTarget(groups.press(), 0.55 * k); return; }
    if (mode === "surprised") { addTarget(groups.browUp(), 0.88 * k); addTarget(groups.mouthOpen(), 0.35 * k); return; }
  }

  function applySmoothTargets(dt) {
    const attackAlpha  = Math.min(1, dt * LIPSYNC_CONFIG.attackSpeed);
    const releaseAlpha = Math.min(1, dt * LIPSYNC_CONFIG.releaseSpeed);
    for (const target of smoothTargets.values()) {
      const cur = target.mesh.morphTargetInfluences[target.idx] || 0;
      const alpha = target.value > cur ? attackAlpha : releaseAlpha;
      target.mesh.morphTargetInfluences[target.idx] = THREE.MathUtils.lerp(cur, target.value, alpha);
    }
  }

  function applyIdleMouthPose(dt) {
    const relaxToZero = collectByNames(["mouthSmileLeft","mouthSmileRight","mouthFrownLeft","mouthFrownRight","mouthDimpleLeft","mouthDimpleRight","mouthStretchLeft","mouthStretchRight","mouthUpperUpLeft","mouthUpperUpRight","mouthLowerDownLeft","mouthLowerDownRight","mouthLeft","mouthRight","mouthPucker","mouthPressLeft","mouthPressRight","mouthRollLower","mouthRollUpper","mouthShrugLower","mouthShrugUpper","jawOpen","aa","E","oh","ou","PP","FF","TH","DD","CH","SS","RR"]);
    const gentleClose = collectByNames(["mouthClose","sil"]);
    const alpha = Math.min(1, dt * 6);
    for (const item of relaxToZero) { const c = item.mesh.morphTargetInfluences[item.idx] || 0; item.mesh.morphTargetInfluences[item.idx] = THREE.MathUtils.lerp(c, 0, alpha); }
    for (const item of gentleClose) { const c = item.mesh.morphTargetInfluences[item.idx] || 0; item.mesh.morphTargetInfluences[item.idx] = THREE.MathUtils.lerp(c, 0.02, alpha); }
  }

  // ── Gesture trigger ────────────────────────────────────────────────────────
  function triggerTeacherGesture(type) {
    teacherAnim.speaking = true;
    teacherAnim.speechType = type || "explaining";
    teacherAnim.elapsed = 0;
    teacherAnim.phrasePhase = Math.random() * Math.PI * 2;
    teacherAnim.emphasisLeadArm = Math.random() < 0.5 ? "L" : "R";
    teacherAnim.armMotionScale = 1;
    teacherAnim.activeClip = TEACHING_CLIPS[teacherAnim.speechType] ?? TEACHING_CLIPS["explaining"] ?? null;
    teacherAnim.clipElapsed = 0;
  }

  function onSpeechAnimationEnded() {
    teacherAnim.speaking = false;
    teacherAnim.speechType = "explaining";
    teacherAnim.armMotionScale = 0;
    teacherAnim.activeClip = null;
    teacherAnim.clipElapsed = 0;
    _countingClipActive = false;
    selectedEmotion = "neutral";
    neutralFace();
  }

  // ── Fist / counting ────────────────────────────────────────────────────────
  const FIST_POSE = Object.freeze({
    rArmX: -0.62, lArmX: -0.52, rForeX: 0.78, lForeX: 0.68,
    rHandX: 0.22, lHandX: 0.22, fingerCurl: 0.85,
  });

  function applyClosedFistPose() {
    if (!teacherRigReady) return;
    computeFistArmQuaternions();
    _countingClipActive = true;
    for (const bone of getTeacherAnimatedBones()) {
      const b = bone?.userData?.baseRotation;
      if (!bone || !b) continue;
      bone.rotation.order = b.order; bone.rotation.copy(b);
    }
    for (const side of ["L", "R"]) {
      for (const { bone } of _fingerBones[side]) {
        const baseQ = _fingerBaseQ.get(bone.uuid);
        if (baseQ) bone.quaternion.copy(baseQ);
      }
    }
    gestureSmoothed.rArmX = FIST_POSE.rArmX; gestureSmoothed.lArmX = FIST_POSE.lArmX;
    gestureSmoothed.rArmY = 0; gestureSmoothed.lArmY = 0;
    gestureSmoothed.rArmZ = 0; gestureSmoothed.lArmZ = 0;
    gestureSmoothed.rForeX = FIST_POSE.rForeX; gestureSmoothed.lForeX = FIST_POSE.lForeX;
    gestureSmoothed.rHandX = FIST_POSE.rHandX; gestureSmoothed.lHandX = FIST_POSE.lHandX;
    gestureSmoothed.rHandZ = 0; gestureSmoothed.lHandZ = 0;
    gestureSmoothed.rFingerCurl = FIST_POSE.fingerCurl; gestureSmoothed.lFingerCurl = FIST_POSE.fingerCurl;
    gestureSmoothed.rIndexOpen = 0; gestureSmoothed.lIndexOpen = 0;
    gestureSmoothed.rMiddleOpen = 0; gestureSmoothed.lMiddleOpen = 0;
    gestureSmoothed.rRingOpen = 0; gestureSmoothed.lRingOpen = 0;
    gestureSmoothed.rPinkyOpen = 0; gestureSmoothed.lPinkyOpen = 0;
    gestureSmoothed.mouthOpen = 0; gestureSmoothed.countHeadNod = 0;
    forceArmDownEveryFrame();
  }

  function playCountingAnimation(countTo = 5, onDone = null) {
    countTo = Math.max(1, Math.min(10, Math.round(countTo)));
    applyClosedFistPose();

    const FIST_RISE = 0.05, FIST_HOLD = 0.75, PER_COUNT = 1.2, FIST_OUTRO = 0.5, RAMP_OUT = 0.8;
    const COUNT_START = FIST_RISE + FIST_HOLD;
    const COUNT_END   = COUNT_START + countTo * PER_COUNT;
    const OUTRO_END   = COUNT_END   + FIST_OUTRO;
    const TOTAL       = OUTRO_END   + RAMP_OUT;

    const FIST_R_ARM_X = FIST_POSE.rArmX, FIST_L_ARM_X = FIST_POSE.lArmX;
    const FIST_R_FORE_X = FIST_POSE.rForeX, FIST_L_FORE_X = FIST_POSE.lForeX;
    const FIST_WRIST = FIST_POSE.rHandX, FIST_CURL = FIST_POSE.fingerCurl;
    const COUNT_R_ARM_X = FIST_POSE.rArmX - 0.14;

    const smooth = (x, lo, hi) => { const s = Math.max(0, Math.min(1, (x - lo) / (hi - lo))); return s * s * (3 - 2 * s); };

    const clip = {
      loop: false, duration: TOTAL,
      update(t) {
        const inFistRise = t < FIST_RISE;
        const inFistHold = t >= FIST_RISE  && t < COUNT_START;
        const inCounting = t >= COUNT_START && t < COUNT_END;
        const inOutro    = t >= COUNT_END   && t < OUTRO_END;
        const inRampOut  = t >= OUTRO_END;

        let showing = 0, withinT = 0;
        if (inCounting) {
          const phase = t - COUNT_START;
          const countIdx = Math.min(Math.floor(phase / PER_COUNT), countTo - 1);
          withinT = (phase - countIdx * PER_COUNT) / PER_COUNT;
          showing = countIdx + 1;
        }

        let rArmX, lArmX, rForeX, lForeX, rHandX, lHandX;
        if (inFistRise || inFistHold) {
          rArmX = FIST_R_ARM_X; lArmX = FIST_L_ARM_X;
          rForeX = FIST_R_FORE_X; lForeX = FIST_L_FORE_X;
          rHandX = FIST_WRIST; lHandX = FIST_WRIST;
        } else if (inCounting) {
          rArmX = COUNT_R_ARM_X; lArmX = FIST_L_ARM_X;
          rForeX = FIST_R_FORE_X; lForeX = FIST_L_FORE_X;
          rHandX = 0.10 + showing * 0.02; lHandX = FIST_WRIST;
        } else if (inOutro) {
          rArmX = FIST_R_ARM_X; lArmX = FIST_L_ARM_X;
          rForeX = FIST_R_FORE_X; lForeX = FIST_L_FORE_X;
          rHandX = FIST_WRIST; lHandX = FIST_WRIST;
        } else {
          rArmX = 0; lArmX = 0; rForeX = 0; lForeX = 0; rHandX = 0; lHandX = 0;
        }

        const countBounce = inCounting ? Math.sin(Math.min(withinT * 2.0, Math.PI)) * 0.025 : 0;
        const symBounce   = inCounting ? Math.sin((t - COUNT_START) * Math.PI / PER_COUNT) * 0.018 : 0;
        const leftCurl = inRampOut ? 0 : FIST_CURL;

        let rightCurl, rIdx = 0, rMid = 0, rRing = 0, rPinky = 0;
        if (inFistRise || inFistHold || inOutro) { rightCurl = FIST_CURL; }
        else if (inRampOut) { rightCurl = 0; }
        else if (showing >= 5) { rightCurl = 0; rIdx = rMid = rRing = rPinky = 1; }
        else {
          const snapEase = smooth(withinT, 0, 0.35);
          rightCurl = FIST_CURL;
          rIdx   = showing >= 1 ? snapEase : 0;
          rMid   = showing >= 2 ? snapEase : 0;
          rRing  = showing >= 3 ? snapEase : 0;
          rPinky = showing >= 4 ? snapEase : 0;
        }

        const nodPulse   = showing > 0 ? Math.sin(Math.min(withinT * 2.5, Math.PI)) * THREE.MathUtils.degToRad(6) : 0;
        const mouthPulse = showing > 0 ? Math.sin(Math.min(withinT * 3.5, Math.PI)) * 0.48 : 0;

        return {
          rArmX: rArmX - countBounce, rForeX, rHandX,
          lArmX: lArmX + symBounce,   lForeX, lHandX,
          rFingerCurl: rightCurl, rIndexOpen: rIdx, rMiddleOpen: rMid, rRingOpen: rRing, rPinkyOpen: rPinky,
          lFingerCurl: leftCurl, lIndexOpen: 0, lMiddleOpen: 0, lRingOpen: 0, lPinkyOpen: 0,
          countHeadNod: nodPulse, mouthOpen: mouthPulse,
        };
      },
    };

    teacherAnim.speaking = true;
    teacherAnim.speechType = "counting";
    teacherAnim.activeClip = clip;
    teacherAnim.clipElapsed = 0;
    addTarget(groups.smile(), 0.75);
    addTarget(groups.browUp(), 0.22);

    setTimeout(() => {
      _countingClipActive = false;
      if (typeof onDone === "function") onDone();
    }, (TOTAL + 0.5) * 1000);
  }

  // ── Public animation API ───────────────────────────────────────────────────
  function playAnimation(name, opts = {}) {
    const VALID = ["explaining", "asking", "emphasis", "pointing", "counting", "list", "vocab"];
    if (!VALID.includes(name)) { console.warn(`[avatar] Unknown animation "${name}"`); return; }
    if (name === "counting") {
      const countTo = (opts && opts.countTo != null) ? opts.countTo : 5;
      playCountingAnimation(countTo, opts.onDone || null);
      return;
    }
    triggerTeacherGesture(name);
    const clip = TEACHING_CLIPS[name];
    if (clip && !clip.loop && clip.duration && typeof opts.onDone === "function") {
      setTimeout(opts.onDone, (clip.duration + 0.3) * 1000);
    }
  }

  function stopAnimation() { onSpeechAnimationEnded(); }

  // ── Init and animate ───────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let rafId;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    updateTeacherBodyAnimation(dt);
    applyIdleMouthPose(dt);
    if (selectedEmotion && selectedEmotion !== "neutral") applyEmotionTargets(selectedEmotion, 1.0);
    applySmoothTargets(dt);
    for (const item of groups.pucker()) {
      const v = item.mesh.morphTargetInfluences[item.idx] || 0;
      item.mesh.morphTargetInfluences[item.idx] = Math.min(v, 0.28);
    }
    armSafetyHardLockBeforeRender();
    forceArmDownEveryFrame();
    controls.update();
    renderer.render(scene, camera);
  }

  async function init() {
    const loader = new GLTFLoader();
    setStatus("Loading avatar...");
    let gltf;
    try {
      gltf = await new Promise((resolve, reject) =>
        loader.load("/avatar.glb", resolve, null, reject)
      );
    } catch (e) {
      setStatus("Failed to load avatar");
      throw e;
    }

    const avatarPlacement = new THREE.Group();
    avatarPlacement.name = "AvatarPlacement";
    scene.add(avatarPlacement);
    avatarPlacement.add(gltf.scene);
    avatarRoot = avatarPlacement;

    gltf.scene.position.set(0, 0, 0);
    gltf.scene.rotation.order = "XYZ";
    gltf.scene.rotation.set(0, Math.PI * 2, 0);
    gltf.scene.scale.set(1, 1, 1);
    gltf.scene.visible = true;
    avatarRoot.updateWorldMatrix(true, true);
    gltf.scene.updateWorldMatrix(true, true);

    avatarRoot.visible = true;
    avatarRoot.traverse(o => { if (o.isMesh) { o.visible = true; o.frustumCulled = false; } });

    discoverMorphMeshes(gltf.scene);
    detectTeacherBones(gltf.scene);
    alignRigBonesToSkinnedSkeleton(gltf.scene);
    avatarRoot.updateWorldMatrix(true, true);

    const rigGroundOk = snapAvatarPlacementFull(avatarRoot, "init");
    if (!rigGroundOk) {
      avatarRoot.updateWorldMatrix(true, true);
      const fbbox = new THREE.Box3().setFromObject(avatarRoot);
      if (!fbbox.isEmpty()) {
        avatarRoot.position.y -= fbbox.min.y;
        avatarRoot.position.x -= (fbbox.min.x + fbbox.max.x) / 2;
        avatarRoot.position.z -= (fbbox.min.z + fbbox.max.z) / 2;
      }
    }

    findRealArmBonesSpatially();
    poseArmsAtSide();
    captureFingerBasePose();
    avatarRoot.updateMatrixWorld(true);
    gltf.scene.updateMatrixWorld(true);
    captureTeacherBaseRotations();

    const armBoneList = [rigBones.leftShoulder, rigBones.rightShoulder, rigBones.leftUpperArm, rigBones.rightUpperArm, rigBones.leftForeArm, rigBones.rightForeArm, rigBones.leftHand, rigBones.rightHand].filter(Boolean);
    for (const bone of armBoneList) bone.userData.baseRotation = bone.rotation.clone();

    avatarRoot.updateWorldMatrix(true, true);
    reframeCameraFromAvatarRoot("init");

    Object.keys(gestureSmoothed).forEach(k => { gestureSmoothed[k] = 0; });
    teacherAnim.speaking = false; teacherAnim.armMotionScale = 0; teacherAnim.elapsed = 0;

    for (const mesh of morphMeshes) { if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0); }
    talkMode = false;

    setStatus("Avatar ready");
  }

  // ── Resize handling ────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const el = canvasEl.parentElement || canvasEl;
    W = el.clientWidth  || el.offsetWidth  || 400;
    H = el.clientHeight || el.offsetHeight || 440;
    if (W < 1 || H < 1) return;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    if (avatarRoot) reframeCameraFromAvatarRoot("resize");
  });
  ro.observe(canvasEl.parentElement || canvasEl);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async function start() {
    await init();
    animate();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
  }

  return { start, stop, playAnimation, stopAnimation, playCountingAnimation };
}
