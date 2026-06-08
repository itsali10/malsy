import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ARM_FIX_BUILD = "armfix-20260509-camera-safety-v2";
console.log("[rig] build", ARM_FIX_BUILD);

const statusEl = document.getElementById("status");
const morphListEl = document.getElementById("morphTargets");
const apiUrlEl = document.getElementById("apiUrl");
const studentIdEl = document.getElementById("studentId");
const chapterIdEl = document.getElementById("chapterId");
const textInputEl = document.getElementById("textInput");
const audioDebugEl = document.getElementById("audioDebug");
const strictCheckEl = document.getElementById("strictCheck");

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
const initialViewW = Math.max(320, window.innerWidth - 360);
renderer.setSize(initialViewW, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151515);
scene.add(new THREE.GridHelper(4, 8, 0x444444, 0x2a2a2a));
scene.add(new THREE.AxesHelper(0.8));

const camera = new THREE.PerspectiveCamera(35, initialViewW / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 2.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.4, 0);
controls.enablePan = true;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enabled = true;
controls.autoRotate = false;
controls.update();

const CAMERA_TEACHER_VIEW = {
  minDistance: 1.7,
  maxDistance: 3.4,
  // Keep camera in a natural front-facing range (no top-down / no under-floor).
  minPolarAngle: THREE.MathUtils.degToRad(40),
  maxPolarAngle: THREE.MathUtils.degToRad(100),
  minAzimuthAngle: THREE.MathUtils.degToRad(-120),
  maxAzimuthAngle: THREE.MathUtils.degToRad(120),
};

/** Last bbox + computed camera; used by resetTeacherCameraView on resize / buttons / post-pose. */
let lastAvatarCameraFrame = null;

/**
 * Stand the avatar on the grid (min Y ~ 0) and center on world XZ (axes origin).
 * Must run on {@link THREE.Group} placement with identity rotation under the scene, so position is a uniform world shift.
 * Multi-pass handles skinned bounds that update after each shift.
 */
function snapAvatarPlacementToWorldAxis(placement, tag = "snap") {
  // If this is the bbox pass after rig-based foot snap already ran, skip Y correction
  // to avoid fighting the bone-based placement. Only fix XZ drift.
  const rigSnapRanAlready =
    tag.includes("bbox") &&
    (rigBones.leftFoot || rigBones.rightFoot || rigBones.leftToe || rigBones.rightToe);

  const eps = 0.008;

  for (let pass = 0; pass < 6; pass += 1) {
    placement.updateWorldMatrix(true, true);

    // For Y grounding: prefer foot/toe bone world positions over skinned mesh bbox,
    // because skinned AABBs in bind pose are notoriously unreliable.
    let groundY = null;
    if (!rigSnapRanAlready) {
      const footBones = [
        rigBones.leftFoot,
        rigBones.rightFoot,
        rigBones.leftToe,
        rigBones.rightToe,
      ].filter(Boolean);
      if (footBones.length > 0) {
        let minFootY = Infinity;
        for (const b of footBones) {
          b.getWorldPosition(_rigWorldTmp);
          if (_rigWorldTmp.y < minFootY) minFootY = _rigWorldTmp.y;
        }
        if (Number.isFinite(minFootY)) groundY = minFootY;
      }
    }

    // Fallback to bbox if no foot bones resolved or rig snap already handled Y.
    const box = new THREE.Box3().setFromObject(placement);
    if (box.isEmpty()) return;

    const c = box.getCenter(new THREE.Vector3());
    const bboxMinY = box.min.y;

    const dx = c.x;
    const dz = c.z;
    // Use foot-bone ground Y when available; otherwise fall back to bbox minY.
    // If rig snap already ran, set dy=0 so we only correct XZ drift.
    const dy = rigSnapRanAlready ? 0 : (groundY !== null ? groundY : bboxMinY);

    const xOk = Math.abs(dx) <= eps;
    const zOk = Math.abs(dz) <= eps;
    const yOk = rigSnapRanAlready || Math.abs(dy) <= eps;

    if (xOk && zOk && yOk) {
      console.log(
        `[frameAvatar] axis OK (${tag}) pass=${pass}` +
        ` centerXZ=(${dx.toFixed(4)},${dz.toFixed(4)})` +
        ` groundY=${dy.toFixed(4)}` +
        ` source=${groundY !== null && !rigSnapRanAlready ? "foot-bone" : rigSnapRanAlready ? "rig-snap-skip" : "bbox"}`,
      );
      return;
    }

    placement.position.x -= dx;
    if (!rigSnapRanAlready) placement.position.y -= dy;
    placement.position.z -= dz;

    console.log(`[frameAvatar] axis shift (${tag}) pass=${pass}`, {
      dx: dx.toFixed(4),
      dy: dy.toFixed(4),
      dz: dz.toFixed(4),
      ySource: groundY !== null && !rigSnapRanAlready ? "foot-bone" : rigSnapRanAlready ? "skipped" : "bbox",
    });
  }

  // Final residual report — not an error, just diagnostic.
  placement.updateWorldMatrix(true, true);
  const finalBox = new THREE.Box3().setFromObject(placement);
  const fc = finalBox.getCenter(new THREE.Vector3());
  const footBonesFinal = [rigBones.leftFoot, rigBones.rightFoot, rigBones.leftToe, rigBones.rightToe].filter(Boolean);
  let finalFootY = null;
  if (footBonesFinal.length) {
    let mfy = Infinity;
    for (const b of footBonesFinal) { b.getWorldPosition(_rigWorldTmp); if (_rigWorldTmp.y < mfy) mfy = _rigWorldTmp.y; }
    finalFootY = Number.isFinite(mfy) ? mfy : null;
  }
  console.warn("[frameAvatar] axis snap: residual after passes", {
    bboxMinY: finalBox.min.y.toFixed(4),
    footBoneMinY: finalFootY !== null ? finalFootY.toFixed(4) : "n/a",
    centerXZ: { x: fc.x.toFixed(4), z: fc.z.toFixed(4) },
    tag,
  });
}

/**
 * Ground + center using skeleton feet/toes (world Y) and hips (world XZ). Works when skinned mesh AABBs lie.
 */
function snapAvatarPlacementFromRig(placement, tag = "rig", maxPasses = 5) {
  const eps = 0.018;
  const footRefs = [
    rigBones.leftFoot,
    rigBones.rightFoot,
    rigBones.leftToe,
    rigBones.rightToe,
  ].filter(Boolean);
  if (!footRefs.length && !rigBones.hips) {
    console.log(`[frameAvatar] rig snap skipped (${tag}): no feet/toes/hips`);
    return false;
  }
  for (let p = 0; p < maxPasses; p += 1) {
    placement.updateWorldMatrix(true, true);
    let moved = false;
    if (footRefs.length) {
      let minF = Infinity;
      for (const b of footRefs) {
        b.getWorldPosition(_rigWorldTmp);
        minF = Math.min(minF, _rigWorldTmp.y);
      }
      if (Number.isFinite(minF) && Math.abs(minF) > eps) {
        placement.position.y -= minF;
        moved = true;
        console.log(`[frameAvatar] rig foot Y (${tag}) pass=${p} minFootY=${minF.toFixed(4)}`);
      }
    }
    if (rigBones.hips) {
      rigBones.hips.getWorldPosition(_rigWorldTmp);
      const hx = _rigWorldTmp.x;
      const hz = _rigWorldTmp.z;
      if (Math.abs(hx) > eps || Math.abs(hz) > eps) {
        placement.position.x -= hx;
        placement.position.z -= hz;
        moved = true;
        console.log(`[frameAvatar] rig hips XZ (${tag}) pass=${p}`, { hx: hx.toFixed(4), hz: hz.toFixed(4) });
      }
    }
    if (!moved) {
      console.log(`[frameAvatar] rig snap OK (${tag}) pass=${p}`);
      return true;
    }
  }
  return true;
}

/** Bbox residual snap after rig (or alone if no feet). Returns true if rig grounding ran. */
function snapAvatarPlacementFull(placement, tag) {
  const rigRan = snapAvatarPlacementFromRig(placement, `${tag}-rig`);
  snapAvatarPlacementToWorldAxis(placement, `${tag}-bbox`);
  return rigRan;
}

/**
 * Skinned mesh AABBs often miss head or shoes; grow Y extents using rig so framing is not “feet only”.
 */
function expandAvatarCameraBoundsY(box) {
  const bmin = box.min.clone();
  const bmax = box.max.clone();
  if (rigBones.head) {
    rigBones.head.getWorldPosition(_rigWorldTmp);
    bmax.y = Math.max(bmax.y, _rigWorldTmp.y + 0.18); // add ~18cm above head bone for top of skull
  }
  for (const bone of [rigBones.leftFoot, rigBones.rightFoot, rigBones.leftToe, rigBones.rightToe]) {
    if (!bone) continue;
    bone.getWorldPosition(_rigWorldTmp);
    bmin.y = Math.min(bmin.y, _rigWorldTmp.y);
  }
  const size = new THREE.Vector3(
    Math.max(0.04, bmax.x - bmin.x),
    Math.max(0.2, bmax.y - bmin.y),
    Math.max(0.04, bmax.z - bmin.z),
  );
  const center = new THREE.Vector3(
    (bmin.x + bmax.x) * 0.5,
    (bmin.y + bmax.y) * 0.5,
    (bmin.z + bmax.z) * 0.5,
  );
  return { bmin, bmax, size, center };
}

/**
 * Compute world bounding box of avatar root and set front camera + orbit target.
 * Does not move the root (call from frameAvatar after placement, or after pose changes).
 */
function reframeCameraFromAvatarRoot(reason = "reframe") {
  if (!avatarRoot) return;
  avatarRoot.updateWorldMatrix(true, true);
  const rawBox = new THREE.Box3().setFromObject(avatarRoot);
  if (rawBox.isEmpty()) {
    console.warn("[camera] reframe: empty bounding box");
    return;
  }

  const { bmin, bmax, size, center } = expandAvatarCameraBoundsY(rawBox);

  console.log(`[camera] bbox (${reason})`, {
    rawMinY: rawBox.min.y,
    rawMaxY: rawBox.max.y,
    boxMin: { x: bmin.x, y: bmin.y, z: bmin.z },
    boxMax: { x: bmax.x, y: bmax.y, z: bmax.z },
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
  });

  const distZ = THREE.MathUtils.clamp(size.y * 1.55, 1.8, 5.0);
  // Camera Y should be at roughly chest height (not vertical center which is too low when feet are at 0)
  const camY = bmin.y + size.y * 0.62;
  // Target slightly below chest — upper body focus
  const targetY = bmin.y + size.y * 0.52;
  const target = new THREE.Vector3(center.x, targetY, center.z);

  lastAvatarCameraFrame = {
    boxMin: bmin.clone(),
    boxMax: bmax.clone(),
    center: center.clone(),
    size: size.clone(),
    camX: center.x,
    camY,
    camZ: center.z + distZ,
    targetX: target.x,
    targetY: target.y,
    targetZ: target.z,
    distZ,
    sizeY: size.y,
  };

  resetTeacherCameraView(reason, lastAvatarCameraFrame);
}

scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.2));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(2, 3, 2);
scene.add(dir);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

let morphMeshes = [];
let audioEl = null;
let talkMode = false;
let visemeTimeline = [];
let visemeIndex = 0;
let lastAudioTimeMs = 0;
let isPaused = false;
let cachedSpeechKey = "";
let cachedAudioUrl = "";
let cachedVisemes = [];
let sentenceQueue = [];
let currentSentenceIndex = -1;
let preloadedNext = null;
let currentTeachingStyle = { emotion: "neutral", speed: 0.95, pauseMs: 200 };
let selectedEmotion = "neutral";
let speechIsActive = false;
let audioPlaying = false;
let queuedNextSentenceTimer = null;
let lessonController = null;
let spokenHistory = [];
let lastSpokenSentence = "";
const MAX_SPOKEN_HISTORY = 80;
const ttsResponseCache = new Map();
const pendingTtsRequests = new Map();
const morphGroupCache = new Map();
let fallbackJawOnlyMode = false;
let lastVisemeDebugLabel = "";
let lastVisemeDebugTimeBucket = -1;
const LESSON_CHUNK_CONFIG = {
  targetMinWords: 8,
  targetMaxWords: 20,
  hardMaxWords: 26,
};

const smoothTargets = new Map();
const LIPSYNC_CONFIG = {
  jawScale: 0.9,
  visemeIntensity: 1.0,
  attackSpeed: 14.0,
  releaseSpeed: 8.0,
};
const VISEME_TUNING = {
  eeStretchBoost: 1.18,
  ooRoundBoost: 1.22,
  bmpClosureBoost: 1.18,
};
// Tune this if you observe tiny lead/lag between voice and mouth.
const LIPSYNC_OFFSET_MS = 0;

/** Resolved humanoid bones for subtle idle + speech gestures (local euler, radians). */
const rigBones = {
  hips: null,
  spine: null,
  spine1: null,
  chest: null,
  neck: null,
  head: null,
  leftShoulder: null,
  rightShoulder: null,
  leftUpperArm: null,
  rightUpperArm: null,
  leftForeArm: null,
  rightForeArm: null,
  leftHand: null,
  rightHand: null,
  leftFoot: null,
  rightFoot: null,
  leftToe: null,
  rightToe: null,
};
/** True after baseRotation captured on animated bones (post rest-pose). */
let teacherRigReady = false;
/** Placement group under scene (identity rotation); GLB is child. Used for bbox, camera, and arm world checks. */
let avatarRoot = null;
const _rigWorldShoulder = new THREE.Vector3();
const _rigWorldHand = new THREE.Vector3();
const _rigWorldElbow = new THREE.Vector3();
const _rigWorldTmp = new THREE.Vector3();
const _armDebugRotPrev = new Map();
const _armDebugFreezeLocked = new Map();
const allResolvedLeftArmBones = [];
const allResolvedArmBones = [];
const ARM_DEBUG_CONFIG = {
  freezeArms: false,
  printHierarchyOnLoad: true,
};

/**
 * ARM SAFETY — mandatory euler clamp is **base-relative** (±rad from bone.userData.baseRotation).
 * Absolute boxes fight Mixamo “arms down” poses (large |x|); this cannot be overridden by gesture code.
 */
const ARM_SAFETY_BASE_DELTA_RAD = {
  shoulder: 0.042,
  upperArm: 0.055,
  foreArm: 0.048,
  hand: 0.042,
  default: 0.05,
};
const teacherAnim = {
  speaking: false,
  speechType: "explaining",
  /** 0 = calm “no arm gesture” this utterance; otherwise scales small classroom motion. */
  armMotionScale: 0,
  /** For emphasis: only one arm leads (no bilateral “big” pose). */
  emphasisLeadArm: "L",
  /** Random phase so repeated sentences don’t look identical. */
  phrasePhase: 0,
  elapsed: 0,
  blinkTimer: 0,
  debugLogTimer: 0,
  /** Active teaching gesture clip from TEACHING_CLIPS, or null when idle. */
  activeClip: null,
  /** Seconds elapsed since the current clip started. */
  clipElapsed: 0,
};
/** Smoothed gesture euler offsets (radians) — applied each frame as baseRotation + offset (never += on bone across frames). */
const gestureSmoothed = {
  spineX: 0,
  spineZ: 0,
  headX: 0,
  headZ: 0,
  lArmX: 0,
  lArmY: 0,
  lArmZ: 0,
  rArmX: 0,
  rArmY: 0,
  rArmZ: 0,
  lForeX: 0,
  rForeX: 0,
  /** Wrist flex (X = forward/back bend). */
  lHandX: 0,
  rHandX: 0,
  lHandZ: 0,
  rHandZ: 0,
  /** Finger curl 0–1 (0 = open palm, 1 = fist). */
  lFingerCurl: 0,
  rFingerCurl: 0,
  /** Per-finger extension override: 1 = fully extended (overrides curl for that finger). */
  lIndexOpen:  0,  rIndexOpen:  0,
  lMiddleOpen: 0,  rMiddleOpen: 0,
  lRingOpen:   0,  rRingOpen:   0,
  lPinkyOpen:  0,  rPinkyOpen:  0,
  /** Mouth jaw open (0–1) — driven by clips that include voice-like movement. */
  mouthOpen: 0,
  /** Additional head nod offset (rad) added on top of normal head motion. */
  countHeadNod: 0,
};
const TEACHER_GESTURE_CONFIG = {
  /** Small upper-arm offsets (rad); world height + euler clamps still enforce safety. */
  maxArmOffsetRad: 0.038,
  maxForeOffsetRad: 0.04,
  armAxisOffsetRad: { x: 0.038, y: 0.028, z: 0.032 },
  maxHandZOffsetRad: 0.018,
  maxHeadOffsetRad: THREE.MathUtils.degToRad(10),
  maxSpineOffsetRad: THREE.MathUtils.degToRad(5),
  lerpSpeed: 5.6,
  /** Extra multiplier when lerping arm targets back to rest (smooth return, no hang). */
  armReturnLerpFactor: 1.55,
  idleBreathingAmp: 0.004,
  debugIntervalSec: 1.35,
  /** Probability this utterance uses reduced (but still visible) arm motion. */
  skipArmGestureChance: 0.08,
  /** How much jaw opening (lip sync) drives head / arm micro-motion while audio plays. */
  voiceToBodyCoupling: 1.65,
  /** Subtle spine/head motion while a lesson is running but TTS is idle (“listening”). */
  lessonIdleEngagementRad: THREE.MathUtils.degToRad(2.2),
  /** World Y: hand/elbow must not sit above shoulder reference (meters). */
  handShoulderHeightMargin: 0.035,
  elbowHeightMarginScale: 0.65,
  handHeightCorrectMaxRounds: 18,
};
// ============================================================================
// DISABLED ARM GESTURE SECTION (temporary hard lock)
// Arms are forced to a neutral teacher pose every frame.
// ============================================================================
const ARM_GESTURES_DISABLED = false;

function frameAvatar(placementRoot) {
  placementRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(placementRoot);
  if (box.isEmpty()) {
    setStatus("Avatar loaded, but bounding box is empty.");
    return;
  }

  const sizeBefore = box.getSize(new THREE.Vector3());
  const centerBefore = box.getCenter(new THREE.Vector3());

  console.log("[frameAvatar] initial bbox (before axis snap)", {
    boxMin: { x: box.min.x, y: box.min.y, z: box.min.z },
    boxMax: { x: box.max.x, y: box.max.y, z: box.max.z },
    sizeY: sizeBefore.y,
    center: { x: centerBefore.x, y: centerBefore.y, z: centerBefore.z },
  });

  snapAvatarPlacementToWorldAxis(placementRoot, "frameAvatar");

  placementRoot.updateWorldMatrix(true, true);
  const boxAfter = new THREE.Box3().setFromObject(placementRoot);
  if (boxAfter.isEmpty()) {
    setStatus("Avatar loaded, but bounding box is empty after placement.");
    return;
  }

  const size = boxAfter.getSize(new THREE.Vector3());
  const center = boxAfter.getCenter(new THREE.Vector3());

  console.log("[frameAvatar] after axis snap (feet on grid, centered on XZ)", {
    boxMin: { x: boxAfter.min.x, y: boxAfter.min.y, z: boxAfter.min.z },
    boxMax: { x: boxAfter.max.x, y: boxAfter.max.y, z: boxAfter.max.z },
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
  });

  reframeCameraFromAvatarRoot("frameAvatar");
}

/**
 * PART 1 — CAMERA FIX:
 * Stable front teacher camera. Uses bbox from frameAvatar when available; otherwise defaults.
 * @param {string} reason
 * @param {object} [overrides] — optional { camX, camY, camZ, targetX, targetY, targetZ, boxMin, boxMax, center, size, distZ, sizeY }
 */
function resetTeacherCameraView(reason = "manual", overrides = null) {
  const f = overrides || lastAvatarCameraFrame;
  const target = f
    ? new THREE.Vector3(f.targetX, f.targetY, f.targetZ)
    : new THREE.Vector3(0, 1.3, 0);
  const camX = f ? f.camX : 0;
  const camY = f ? f.camY : 1.5;
  const camZ = f ? f.camZ : 2.5;

  camera.position.set(camX, camY, camZ);
  camera.rotation.set(0, 0, 0);
  // FOV tuned from height + distance so full body stays in frame (head to ~mid-thigh).
  const vFovDeg = f
    ? THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(f.sizeY / (2 * Math.max(0.01, f.distZ)))) * 1.12,
      28,
      42,
    )
    : 33;
  camera.fov = vFovDeg;
  camera.near = 0.01;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  camera.lookAt(target);

  controls.target.copy(target);
  const dist = f ? f.distZ : 2.5;
  controls.minDistance = THREE.MathUtils.clamp(dist * 0.55, 1.0, 2.5);
  controls.maxDistance = THREE.MathUtils.clamp(dist * 1.85, 2.5, 6.0);
  controls.minPolarAngle = CAMERA_TEACHER_VIEW.minPolarAngle;
  controls.maxPolarAngle = CAMERA_TEACHER_VIEW.maxPolarAngle;
  controls.minAzimuthAngle = CAMERA_TEACHER_VIEW.minAzimuthAngle;
  controls.maxAzimuthAngle = CAMERA_TEACHER_VIEW.maxAzimuthAngle;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enabled = true;
  controls.autoRotate = false;
  controls.update();

  if (f && (reason === "frameAvatar" || reason === "post-load" || reason === "post-arm-pose")) {
    console.log("[camera] bbox used for framing", {
      reason,
      boxMin: f.boxMin ? { x: f.boxMin.x, y: f.boxMin.y, z: f.boxMin.z } : null,
      boxMax: f.boxMax ? { x: f.boxMax.x, y: f.boxMax.y, z: f.boxMax.z } : null,
      center: f.center ? { x: f.center.x, y: f.center.y, z: f.center.z } : null,
      size: f.size ? { x: f.size.x, y: f.size.y, z: f.size.z } : null,
      distZ: f.distZ,
      sizeY: f.sizeY,
    });
  }
  console.log("[camera] reset teacher view", {
    reason,
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: target.x, y: target.y, z: target.z },
    fov: camera.fov,
  });
}

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

/** Attach listener only if the element exists (HTML may omit optional controls). */
function bindDom(id, type, listener) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(type, listener);
}

function updateStrictCheck(lines) {
  if (!strictCheckEl) return;
  strictCheckEl.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function sanitizeSpeechText(input) {
  return String(input || "")
    .replace(/\*+/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isForbiddenTeacherPhrase(text) {
  const t = String(text || "").toLowerCase();
  return [
    /what do you think so far/,
    /let'?s embark on (a )?journey/,
    /\bgreat job\b/,
    /\byou are doing great\b/,
    /\bfascinating world\b/,
    /\bengineering marvels?\b/,
    /\bamazing structures?\b/,
    /\bamazing\b/,
    /\bexcellent\b/,
    /\bwell done\b/,
    /\bnice work\b/,
    /\byou can do it\b/,
    /\bwhat do you think\b/,
    /\bjourney\b/,
    /\bpuzzle\b/,
    /\bexciting\b/,
    /\bfascinating\b/,
  ].some((rx) => rx.test(t));
}

function splitSentences(text) {
  const parts = String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text || "").trim()].filter(Boolean);
}

function sanitizeDirectReadText(input) {
  // Keep original wording; only normalize whitespace for stable TTS chunks.
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLessonFaithfulChunk(text) {
  const t = sanitizeDirectReadText(text).toLowerCase();
  if (!t) return false;
  if (isForbiddenTeacherPhrase(t)) return false;
  const bannedTransitions = [
    /today we'?re starting/,
    /let'?s begin by exploring/,
    /let'?s get ready to explore/,
    /now[, ]+let'?s delve/,
    /roadmap/,
    /learning journey/,
    /journey together/,
    /it'?s exciting to think about/,
  ];
  if (bannedTransitions.some((rx) => rx.test(t))) return false;
  return true;
}

function cleanLessonText(rawText) {
  const paragraphs = String(rawText || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned = [];
  const seen = new Set();
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph).map((s) => sanitizeDirectReadText(s)).filter(Boolean);
    const keptSentences = [];
    for (const sentence of sentences) {
      if (!isLessonFaithfulChunk(sentence)) continue;
      const key = normalizeSentence(sentence);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keptSentences.push(sentence);
    }
    if (keptSentences.length) cleaned.push(keptSentences.join(" "));
  }
  return cleaned.join("\n");
}

function inferSentenceStyle(sentence) {
  const s = String(sentence || "");
  const low = s.toLowerCase();
  const isQuestion = s.includes("?");
  const instructionWords = /(let's|now|try|read|listen|remember|look|repeat|answer|practice)/i.test(low);
  const empathyWords = /(don't worry|it's okay|you can do it|take your time)/i.test(low);

  if (isQuestion) {
    return { emotion: "surprised", speed: 0.92, pauseMs: 300 };
  }
  if (empathyWords) {
    return { emotion: "sad", speed: 0.88, pauseMs: 320 };
  }
  if (instructionWords) {
    return { emotion: "neutral", speed: 0.9, pauseMs: 240 };
  }
  return { emotion: "neutral", speed: 0.95, pauseMs: 220 };
}

function buildTeachingQueue(text) {
  return splitSentences(text).map((sentence) => ({
    text: sentence,
    style: inferSentenceStyle(sentence),
  }));
}

function discoverMorphMeshes(root) {
  morphMeshes = [];
  morphGroupCache.clear();
  root.traverse((obj) => {
    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
      morphMeshes.push(obj);
    }
  });
  const hasEE = getMorphGroupCached("E").length > 0 || getMorphGroupCached("ih").length > 0;
  const hasOO = getMorphGroupCached("ou").length > 0 || getMorphGroupCached("oh").length > 0;
  const hasBMP = getMorphGroupCached("PP").length > 0 || getMorphGroupCached("mouthClose").length > 0;
  console.log("[lipsync] avatar profile", { hasEE, hasOO, hasBMP, morphMeshCount: morphMeshes.length });
}

/**
 * ========================= DETECT BONES SECTION =========================
 * Collect bones once; pick by priority so we do not match forearm as "arm".
 */
function detectTeacherBones(root) {
  const bones = [];
  root.traverse((obj) => {
    if (obj.isBone) bones.push(obj);
  });
  const pick = (predicates) => {
    for (const pred of predicates) {
      for (const b of bones) {
        const n = String(b.name || "").toLowerCase();
        if (pred(n, b)) return b;
      }
    }
    return null;
  };

  rigBones.hips = pick([
    (n) => n === "hips" || n.endsWith(":hips") || n === "mixamorig:hips",
    (n) => /^hips$/i.test(n),
    (n) => /hips/i.test(n),
  ]);
  rigBones.spine = pick([
    (n) => n === "spine" || n.endsWith(":spine") || n === "mixamorig:spine",
    (n) => /^spine$/i.test(n) || /spine0|spine_00/i.test(n),
  ]);
  rigBones.spine1 = pick([
    (n) => n === "spine1" || n.endsWith(":spine1") || n === "mixamorig:spine1",
    (n) => /spine1|spine_01/i.test(n),
  ]);
  rigBones.chest = pick([
    (n) => n === "spine2" || n.endsWith(":spine2") || n === "mixamorig:spine2",
    (n) => /chest|upperchest|spine2/i.test(n),
  ]);
  rigBones.neck = pick([
    (n) => n === "neck" || n.endsWith(":neck") || n === "mixamorig:neck",
    (n) => /^neck1$/i.test(n),
    (n) => /neck/i.test(n) && !/head/i.test(n),
  ]);
  rigBones.head = pick([
    (n) => n === "head" || n.endsWith(":head") || n === "mixamorig:head",
    (n) => /^headend$/i.test(n),
    (n) => /head/i.test(n) && !/tail|end/i.test(n),
  ]);
  rigBones.leftShoulder = pick([
    (n) => n === "leftshoulder" || n === "mixamorig:leftshoulder",
    (n) => n.endsWith(":leftshoulder"),
    (n) => /leftshoulder|l_clavicle|left_clavicle/i.test(n),
  ]);
  rigBones.rightShoulder = pick([
    (n) => n === "rightshoulder" || n === "mixamorig:rightshoulder",
    (n) => n.endsWith(":rightshoulder"),
    (n) => /rightshoulder|r_clavicle|right_clavicle/i.test(n),
  ]);
  rigBones.leftUpperArm = pick([
    (n) => n === "mixamorig:leftarm" || n === "leftarm",
    (n) => /^(mixamorig:)?leftarm$/i.test(n) && !/twist|roll|ik|pole|share|end|index/i.test(n),
    (n) => /leftupperarm|upperarm_l|^l_arm$/i.test(n) && !/twist|roll|ik/i.test(n),
    (n) => /left/.test(n) && /arm/.test(n) && !/fore|lower|hand|twist|roll|ik|pole|end/i.test(n),
  ]);
  rigBones.rightUpperArm = pick([
    (n) => n === "mixamorig:rightarm" || n === "rightarm",
    (n) => /^(mixamorig:)?rightarm$/i.test(n) && !/twist|roll|ik|pole|share|end|index/i.test(n),
    (n) => /rightupperarm|upperarm_r|^r_arm$/i.test(n) && !/twist|roll|ik/i.test(n),
    (n) => /right/.test(n) && /arm/.test(n) && !/fore|lower|hand|twist|roll|ik|pole|end/i.test(n),
  ]);
  rigBones.leftForeArm = pick([
    (n) => n === "mixamorig:leftforearm" || n === "leftforearm",
    (n) => /^(mixamorig:)?leftforearm$/i.test(n) && !/twist|roll|ik/i.test(n),
    (n) =>
      /leftforearm|leftlowerarm|forearm_l|lowerarm_l/i.test(n)
      && !/(forearm|lowerarm)\d/i.test(n)
      && !/twist|roll|ik/i.test(n),
  ]);
  rigBones.rightForeArm = pick([
    (n) => n === "mixamorig:rightforearm" || n === "rightforearm",
    (n) => /^(mixamorig:)?rightforearm$/i.test(n) && !/twist|roll|ik/i.test(n),
    (n) =>
      /rightforearm|rightlowerarm|forearm_r|lowerarm_r/i.test(n)
      && !/(forearm|lowerarm)\d/i.test(n)
      && !/twist|roll|ik/i.test(n),
  ]);
  rigBones.leftHand = pick([
    (n) => n === "mixamorig:lefthand" || n === "lefthand",
    (n) => /^(mixamorig:)?lefthand$/i.test(n),
    (n) => /lefthand|hand_l|l_hand$/i.test(n),
  ]);
  rigBones.rightHand = pick([
    (n) => n === "mixamorig:righthand" || n === "righthand",
    (n) => /^(mixamorig:)?righthand$/i.test(n),
    (n) => /righthand|hand_r|r_hand$/i.test(n),
  ]);
  rigBones.leftFoot = pick([
    (n) => n === "mixamorig:leftfoot" || n === "leftfoot",
    (n) => /^(mixamorig:)?leftfoot$/i.test(n) && !/twist|ik|end/i.test(n),
    (n) => /left.*foot$/i.test(n) && !/toe|twist|ik/i.test(n),
  ]);
  rigBones.rightFoot = pick([
    (n) => n === "mixamorig:rightfoot" || n === "rightfoot",
    (n) => /^(mixamorig:)?rightfoot$/i.test(n) && !/twist|ik|end/i.test(n),
    (n) => /right.*foot$/i.test(n) && !/toe|twist|ik/i.test(n),
  ]);
  rigBones.leftToe = pick([
    (n) => n === "mixamorig:lefttoebase" || n === "lefttoebase",
    (n) => /^(mixamorig:)?lefttoebase$/i.test(n),
    (n) => /left.*toe/i.test(n) && !/twist|ik/i.test(n),
  ]);
  rigBones.rightToe = pick([
    (n) => n === "mixamorig:righttoebase" || n === "righttoebase",
    (n) => /^(mixamorig:)?righttoebase$/i.test(n),
    (n) => /right.*toe/i.test(n) && !/twist|ik/i.test(n),
  ]);

  console.log("[rig] detectTeacherBones", {
    leftShoulder: rigBones.leftShoulder?.name,
    rightShoulder: rigBones.rightShoulder?.name,
    leftUpperArm: rigBones.leftUpperArm?.name,
    rightUpperArm: rigBones.rightUpperArm?.name,
    leftForeArm: rigBones.leftForeArm?.name,
    rightForeArm: rigBones.rightForeArm?.name,
    leftHand: rigBones.leftHand?.name,
    rightHand: rigBones.rightHand?.name,
    hips: rigBones.hips?.name,
    leftFoot: rigBones.leftFoot?.name,
    rightFoot: rigBones.rightFoot?.name,
    leftToe: rigBones.leftToe?.name,
    rightToe: rigBones.rightToe?.name,
    spine: rigBones.spine?.name,
    neck: rigBones.neck?.name,
  });
}

/**
 * Use the **SkinnedMesh.skeleton.bones** instances for the arm chain when present.
 * Scene-graph traversal can return different Bone objects than the skeleton drives → zero visible motion.
 */
function alignRigBonesToSkinnedSkeleton(root) {
  const skinned = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && Array.isArray(o.skeleton.bones)) skinned.push(o);
  });
  if (!skinned.length) return;
  // Pick the skeleton that actually contains the main arm chain.
  let selected = skinned[0];
  let bestScore = -1;
  for (const mesh of skinned) {
    const set = new Set(mesh.skeleton.bones.map((b) => String(b.name || "").toLowerCase()));
    const score = [
      "mixamorig:leftshoulder",
      "mixamorig:leftarm",
      "mixamorig:leftforearm",
      "mixamorig:lefthand",
      "mixamorig:rightshoulder",
      "mixamorig:rightarm",
      "mixamorig:rightforearm",
      "mixamorig:righthand",
      "leftshoulder",
      "leftarm",
      "leftforearm",
      "lefthand",
      "rightshoulder",
      "rightarm",
      "rightforearm",
      "righthand",
    ].reduce((acc, n) => acc + (set.has(n) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      selected = mesh;
    }
  }
  const bones = selected.skeleton.bones;
  const map = new Map();
  for (const b of bones) {
    map.set(String(b.name || "").toLowerCase(), b);
  }
  const use = (current, ...aliases) => {
    for (const a of aliases) {
      const hit = map.get(String(a).toLowerCase());
      if (hit) return hit;
    }
    return current;
  };
  allResolvedLeftArmBones.length = 0;
  allResolvedArmBones.length = 0;
  for (const b of bones) {
    const n = String(b.name || "").toLowerCase();
    if (/left/.test(n) && /(shoulder|clavicle|collar|upperarm|arm|fore|lowerarm|hand|wrist)/.test(n)) {
      allResolvedLeftArmBones.push(b);
    }
    if (/(shoulder|clavicle|collar|upperarm|forearm|lowerarm|hand|wrist|arm)/.test(n) && !/armature/.test(n)) {
      allResolvedArmBones.push(b);
    }
  }
  const findByRegex = (rx) => bones.find((b) => rx.test(String(b.name || "").toLowerCase())) || null;
  const parentBone = (b) => (b?.parent && b.parent.isBone ? b.parent : null);
  const resolveArmChainByWorldSide = (side) => {
    if (avatarRoot) avatarRoot.updateMatrixWorld(true);
    const chestRef = rigBones.chest || rigBones.spine1 || rigBones.spine || bones[0];
    if (!chestRef) return null;
    chestRef.getWorldPosition(_rigWorldTmp);
    const chestX = _rigWorldTmp.x;
    let bestLeaf = null;
    let bestScore = -Infinity;
    for (const b of bones) {
      const hasBoneChild = Array.isArray(b.children) && b.children.some((c) => c.isBone);
      if (hasBoneChild) continue;
      b.getWorldPosition(_rigWorldHand);
      const sideOk = side === "L" ? _rigWorldHand.x < chestX : _rigWorldHand.x > chestX;
      if (!sideOk) continue;
      const dx = Math.abs(_rigWorldHand.x - chestX);
      const dy = _rigWorldHand.y;
      const score = dx * 1.8 + dy * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestLeaf = b;
      }
    }
    if (!bestLeaf) return null;
    const fore = parentBone(bestLeaf);
    const upper = parentBone(fore);
    const shoulder = parentBone(upper);
    return { hand: bestLeaf, fore, upper, shoulder, score: bestScore };
  };
  const resolveLeftChainByHierarchy = () => {
    const leftHandCandidate = findByRegex(/left.*hand|hand.*left|_l_hand|lefthand|hand_l/);
    if (!leftHandCandidate) return null;
    const fore = parentBone(leftHandCandidate);
    const upper = parentBone(fore);
    const shoulder = parentBone(upper);
    const valid = (n, rx) => (n && rx.test(String(n.name || "").toLowerCase()) ? n : null);
    return {
      hand: valid(leftHandCandidate, /hand|wrist/),
      fore: valid(fore, /fore|lowerarm|arm/),
      upper: valid(upper, /arm|upperarm/),
      shoulder: valid(shoulder, /shoulder|clavicle|collar|arm/),
    };
  };
  rigBones.leftShoulder = use(rigBones.leftShoulder, "LeftShoulder", "mixamorig:LeftShoulder", "leftshoulder");
  rigBones.rightShoulder = use(rigBones.rightShoulder, "RightShoulder", "mixamorig:RightShoulder", "rightshoulder");
  rigBones.leftUpperArm = use(rigBones.leftUpperArm, "LeftArm", "mixamorig:LeftArm", "leftarm");
  rigBones.rightUpperArm = use(rigBones.rightUpperArm, "RightArm", "mixamorig:RightArm", "rightarm");
  rigBones.leftForeArm = use(rigBones.leftForeArm, "LeftForeArm", "mixamorig:LeftForeArm", "leftforearm");
  rigBones.rightForeArm = use(rigBones.rightForeArm, "RightForeArm", "mixamorig:RightForeArm", "rightforearm");
  rigBones.leftHand = use(rigBones.leftHand, "LeftHand", "mixamorig:LeftHand", "lefthand");
  rigBones.rightHand = use(rigBones.rightHand, "RightHand", "mixamorig:RightHand", "righthand");
  rigBones.hips = use(rigBones.hips, "Hips", "mixamorig:Hips", "hips");
  rigBones.leftFoot = use(rigBones.leftFoot, "LeftFoot", "mixamorig:LeftFoot", "leftfoot");
  rigBones.rightFoot = use(rigBones.rightFoot, "RightFoot", "mixamorig:RightFoot", "rightfoot");
  rigBones.leftToe = use(rigBones.leftToe, "LeftToeBase", "mixamorig:LeftToeBase", "lefttoebase");
  rigBones.rightToe = use(rigBones.rightToe, "RightToeBase", "mixamorig:RightToeBase", "righttoebase");
  const leftChainFallback = resolveLeftChainByHierarchy();
  if (leftChainFallback) {
    rigBones.leftHand = leftChainFallback.hand || rigBones.leftHand;
    rigBones.leftForeArm = leftChainFallback.fore || rigBones.leftForeArm;
    rigBones.leftUpperArm = leftChainFallback.upper || rigBones.leftUpperArm;
    rigBones.leftShoulder = leftChainFallback.shoulder || rigBones.leftShoulder;
  }
  const spatialLeft = resolveArmChainByWorldSide("L");
  const spatialRight = resolveArmChainByWorldSide("R");
  if (spatialLeft?.upper) {
    rigBones.leftHand = spatialLeft.hand || rigBones.leftHand;
    rigBones.leftForeArm = spatialLeft.fore || rigBones.leftForeArm;
    rigBones.leftUpperArm = spatialLeft.upper || rigBones.leftUpperArm;
    rigBones.leftShoulder = spatialLeft.shoulder || rigBones.leftShoulder;
  }
  if (spatialRight?.upper) {
    rigBones.rightHand = spatialRight.hand || rigBones.rightHand;
    rigBones.rightForeArm = spatialRight.fore || rigBones.rightForeArm;
    rigBones.rightUpperArm = spatialRight.upper || rigBones.rightUpperArm;
    rigBones.rightShoulder = spatialRight.shoulder || rigBones.rightShoulder;
  }
  console.log("[rig] alignRigBonesToSkinnedSkeleton", {
    selectedMesh: selected.name || selected.uuid,
    selectedScore: bestScore,
    leftChainFallback: {
      shoulder: leftChainFallback?.shoulder?.name || null,
      upper: leftChainFallback?.upper?.name || null,
      fore: leftChainFallback?.fore?.name || null,
      hand: leftChainFallback?.hand?.name || null,
    },
    spatialLeft: {
      shoulder: spatialLeft?.shoulder?.name || null,
      upper: spatialLeft?.upper?.name || null,
      fore: spatialLeft?.fore?.name || null,
      hand: spatialLeft?.hand?.name || null,
      score: spatialLeft?.score ?? null,
    },
    spatialRight: {
      shoulder: spatialRight?.shoulder?.name || null,
      upper: spatialRight?.upper?.name || null,
      fore: spatialRight?.fore?.name || null,
      hand: spatialRight?.hand?.name || null,
      score: spatialRight?.score ?? null,
    },
    leftUpperArm: rigBones.leftUpperArm?.name,
    leftArmBoneCount: allResolvedLeftArmBones.length,
    allArmBoneCount: allResolvedArmBones.length,
    rightUpperArm: rigBones.rightUpperArm?.name,
    hips: rigBones.hips?.name,
    leftFoot: rigBones.leftFoot?.name,
    rightFoot: rigBones.rightFoot?.name,
    skinnedMeshes: skinned.length,
  });
}

function dumpAvatarBoneHierarchy(root) {
  if (!root) return;
  console.log("[rig] ===== FULL BONE HIERARCHY START =====");
  root.traverse((obj) => {
    if (!obj.isBone) return;
    const p = obj.parent && obj.parent.isBone ? obj.parent.name : (obj.parent?.name || "none");
    obj.getWorldPosition(_rigWorldTmp);
    console.log(
      `[rig] bone=${obj.name} parent=${p} rot=(${obj.rotation.x.toFixed(4)}, ${obj.rotation.y.toFixed(4)}, ${obj.rotation.z.toFixed(4)}) world=(${_rigWorldTmp.x.toFixed(4)}, ${_rigWorldTmp.y.toFixed(4)}, ${_rigWorldTmp.z.toFixed(4)})`,
    );
  });
  console.log("[rig] ===== FULL BONE HIERARCHY END =====");
}

function getLeftArmDebugChain() {
  const out = [];
  const pushUnique = (b) => {
    if (b && !out.includes(b)) out.push(b);
  };
  pushUnique(rigBones.leftShoulder);
  pushUnique(rigBones.leftUpperArm);
  pushUnique(rigBones.leftForeArm);
  pushUnique(rigBones.leftHand);
  // Include all spine/parent influencers up to hips/root.
  let cursor = rigBones.leftShoulder || rigBones.leftUpperArm;
  while (cursor?.parent && cursor.parent.isBone) {
    cursor = cursor.parent;
    pushUnique(cursor);
    const n = String(cursor.name || "").toLowerCase();
    if (/hips|root/.test(n)) break;
  }
  pushUnique(rigBones.spine);
  pushUnique(rigBones.spine1);
  pushUnique(rigBones.chest);
  return out.filter(Boolean);
}

function logArmAxisReport() {
  if (!avatarRoot) return;
  const def = [
    { key: "leftShoulder", side: "L", label: "LeftShoulder" },
    { key: "rightShoulder", side: "R", label: "RightShoulder" },
    { key: "leftUpperArm", side: "L", label: "LeftArm" },
    { key: "rightUpperArm", side: "R", label: "RightArm" },
    { key: "leftForeArm", side: "L", label: "LeftForeArm" },
    { key: "rightForeArm", side: "R", label: "RightForeArm" },
  ];
  const delta = 0.12;
  const forwardBase = new THREE.Vector3(0, 0, 1);
  const worldQ = new THREE.Quaternion();
  const wpShoulder = new THREE.Vector3();
  const wpTip = new THREE.Vector3();
  const wpTip2 = new THREE.Vector3();
  avatarRoot.updateMatrixWorld(true);
  for (const row of def) {
    const bone = rigBones[row.key];
    if (!bone) continue;
    bone.getWorldQuaternion(worldQ);
    const fwd = forwardBase.clone().applyQuaternion(worldQ);
    const worldEuler = new THREE.Euler().setFromQuaternion(worldQ, "XYZ");
    const shoulder = row.side === "L" ? (rigBones.leftShoulder || rigBones.leftUpperArm) : (rigBones.rightShoulder || rigBones.rightUpperArm);
    const tip = row.side === "L" ? (rigBones.leftHand || rigBones.leftForeArm) : (rigBones.rightHand || rigBones.rightForeArm);
    let raiseAxis = "unknown";
    let lowerAxis = "unknown";
    let twistAxis = "unknown";
    if (shoulder && tip) {
      shoulder.getWorldPosition(wpShoulder);
      tip.getWorldPosition(wpTip);
      const baseY = wpTip.y - wpShoulder.y;
      const baseZ = wpTip.z - wpShoulder.z;
      const start = bone.rotation.clone();
      const axes = ["x", "y", "z"];
      const axisRows = [];
      for (const ax of axes) {
        bone.rotation.copy(start);
        bone.rotation[ax] += delta;
        avatarRoot.updateMatrixWorld(true);
        tip.getWorldPosition(wpTip2);
        const upPlus = (wpTip2.y - wpShoulder.y) - baseY;
        const zPlus = (wpTip2.z - wpShoulder.z) - baseZ;
        bone.rotation.copy(start);
        bone.rotation[ax] -= delta;
        avatarRoot.updateMatrixWorld(true);
        tip.getWorldPosition(wpTip2);
        const upMinus = (wpTip2.y - wpShoulder.y) - baseY;
        const zMinus = (wpTip2.z - wpShoulder.z) - baseZ;
        axisRows.push({ ax, upPlus, upMinus, zPlus, zMinus });
      }
      bone.rotation.copy(start);
      avatarRoot.updateMatrixWorld(true);
      const upBest = axisRows
        .map((r) => ({ a: r, dir: r.upPlus >= r.upMinus ? "+" : "-", val: Math.max(r.upPlus, r.upMinus) }))
        .sort((a, b) => b.val - a.val)[0];
      const upWorst = axisRows
        .map((r) => ({ a: r, dir: r.upPlus <= r.upMinus ? "+" : "-", val: Math.min(r.upPlus, r.upMinus) }))
        .sort((a, b) => a.val - b.val)[0];
      const tw = axisRows
        .map((r) => ({ a: r, val: Math.max(Math.abs(r.zPlus), Math.abs(r.zMinus)) - Math.max(Math.abs(r.upPlus), Math.abs(r.upMinus)) * 0.5 }))
        .sort((a, b) => b.val - a.val)[0];
      raiseAxis = `${upBest.dir}${upBest.a.ax}`;
      lowerAxis = `${upWorst.dir}${upWorst.a.ax}`;
      twistAxis = `${tw.a.zPlus >= tw.a.zMinus ? "+" : "-"}${tw.a.ax}`;
    }
    console.log("[rig-axis]", {
      bone: row.label,
      localRotation: { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z },
      worldRotation: { x: worldEuler.x, y: worldEuler.y, z: worldEuler.z },
      forwardAxis: { x: fwd.x, y: fwd.y, z: fwd.z },
      inferredRaiseAxis: raiseAxis,
      inferredLowerAxis: lowerAxis,
      inferredTwistAxis: twistAxis,
    });
  }
}

/** World Y reference: max of clavicle + upper-arm origins (avoids false “hand above shoulder” on T/A-pose). */
function getShoulderReferenceWorldY(side) {
  const tmp = _rigWorldShoulder;
  let maxY = -Infinity;
  const list =
    side === "L"
      ? [rigBones.leftShoulder, rigBones.leftUpperArm]
      : [rigBones.rightShoulder, rigBones.rightUpperArm];
  for (const b of list) {
    if (!b) continue;
    b.getWorldPosition(tmp);
    if (tmp.y > maxY) maxY = tmp.y;
  }
  return Number.isFinite(maxY) ? maxY : null;
}

function getArmHeightError(side) {
  if (!avatarRoot) return Number.POSITIVE_INFINITY;
  const fore = side === "L" ? rigBones.leftForeArm : rigBones.rightForeArm;
  const hand = side === "L" ? rigBones.leftHand : rigBones.rightHand;
  const tip = hand || fore;
  const refY = getShoulderReferenceWorldY(side);
  if (!tip || refY == null) return Number.POSITIVE_INFINITY;
  avatarRoot.updateMatrixWorld(true);
  tip.getWorldPosition(_rigWorldHand);
  let err = _rigWorldHand.y - refY;
  if (fore) {
    fore.getWorldPosition(_rigWorldElbow);
    err = Math.max(err, _rigWorldElbow.y - refY);
  }
  return err;
}

function evaluateArmPoseScore(side) {
  if (!avatarRoot) return Number.POSITIVE_INFINITY;
  const upper = side === "L" ? rigBones.leftUpperArm : rigBones.rightUpperArm;
  const fore = side === "L" ? rigBones.leftForeArm : rigBones.rightForeArm;
  const hand = side === "L" ? rigBones.leftHand : rigBones.rightHand;
  if (!upper) return Number.POSITIVE_INFINITY;
  avatarRoot.updateMatrixWorld(true);
  upper.getWorldPosition(_rigWorldShoulder);
  const shoulderY = _rigWorldShoulder.y;
  const shoulderX = _rigWorldShoulder.x;
  if (fore) fore.getWorldPosition(_rigWorldElbow);
  const tip = hand || fore;
  if (!tip) return Number.POSITIVE_INFINITY;
  tip.getWorldPosition(_rigWorldHand);
  const handUp = Math.max(0, _rigWorldHand.y - shoulderY);
  const elbowUp = fore ? Math.max(0, _rigWorldElbow.y - shoulderY) : 0;
  const sideDistance = Math.abs(_rigWorldHand.x - shoulderX);
  const lowHandBias = _rigWorldHand.y;
  return handUp * 10 + elbowUp * 8 + sideDistance * 1.8 + lowHandBias * 0.12;
}

/**
 * Direct world-space arm-down solver.
 * Reads the ACTUAL world direction from the upper-arm joint to its child (forearm/hand),
 * then rotates the bone so that vector points world -Y (straight down, slight lateral lean).
 * No assumptions about which local Euler axis is "down" — works for any model orientation.
 */
// Cached arm-down local quaternions, computed once in poseArmsAtSide and reused every frame.
const _armDownQ     = { L: null, R: null };
const _foreDownQ    = { L: null, R: null };
const _handDownQ    = { L: null, R: null };
const _foreArmBone  = { L: null, R: null };
const _handBone     = { L: null, R: null };
// The spatially-found real upper-arm bones (found by position, not name).
const _realArmBone  = { L: null, R: null };

// Finger bone cache — filled by captureFingerBasePose() after poseArmsAtSide().
// Each entry: { bone, isIndex, isThumb }
const _fingerBones = { L: [], R: [] };
// Maps bone.uuid → Quaternion (the A-pose quaternion to restore each frame before applying curl).
const _fingerBaseQ = new Map();

// Fist-forward arm quaternions — computed once by computeFistArmQuaternions().
// These point each upper arm forward (+Z world) rather than down (-Y world).
const _fistArmQ = { L: null, R: null };
// True while a counting/fist animation is playing; forceArmDownEveryFrame uses _fistArmQ.
let _countingClipActive = false;

/**
 * Find arm bones directly by their known names from the GLB skeleton.
 * Bones confirmed from skeleton dump: LeftShoulder→LeftArm→LeftForeArm→LeftHand
 *                                    RightShoulder→RightArm→RightForeArm→RightHand
 */
function findRealArmBonesSpatially() {
  if (!avatarRoot) return;
  avatarRoot.updateMatrixWorld(true);
  const byName = {};
  avatarRoot.traverse(obj => { if (obj.isBone) byName[obj.name] = obj; });
  // Confirmed bone names from GLB skeleton dump.
  _realArmBone.L = byName["RightArm"]     || null; // avatar's right = world -X
  _realArmBone.R = byName["LeftArm"]      || null; // avatar's left  = world +X
  _foreArmBone.L = byName["RightForeArm"] || null;
  _foreArmBone.R = byName["LeftForeArm"]  || null;
  console.log(`[armBones] L upperArm="${_realArmBone.L?.name}" foreArm="${_foreArmBone.L?.name}"`);
  console.log(`[armBones] R upperArm="${_realArmBone.R?.name}" foreArm="${_foreArmBone.R?.name}"`);
}

/**
 * Called every frame immediately before render. Forces arms straight down by re-applying
 * the local quaternion computed by poseArmsAtSide. Bypasses all other animation systems.
 */
// Reusable temporaries for forceArmDownEveryFrame to avoid per-frame allocation.
const _fafQ  = new THREE.Quaternion();
const _fafE  = new THREE.Euler();

function forceArmDownEveryFrame() {
  if (!avatarRoot || !teacherRigReady) return;
  ["L", "R"].forEach(side => {
    const upperArm = _realArmBone[side];
    // In counting/fist mode use the forward-facing fist quaternion as the base.
    // In all other modes use the A-pose (arms-down) quaternion.
    const armBaseQ = (_countingClipActive && _fistArmQ[side]) ? _fistArmQ[side] : _armDownQ[side];
    if (upperArm && armBaseQ) {
      upperArm.quaternion.copy(armBaseQ);
      // In fist/counting mode the base quaternion already positions the arm forward.
      // We only apply the Y offset (slight raise/lower) for the count beats;
      // X and Z on top of the fist base would be in the arm's new local frame and
      // may not correspond to intuitive directions, so they are skipped here.
      const ox = side === "L" ? gestureSmoothed.lArmX : gestureSmoothed.rArmX;
      const oy = side === "L" ? gestureSmoothed.lArmY : gestureSmoothed.rArmY;
      const oz = side === "L" ? gestureSmoothed.lArmZ : gestureSmoothed.rArmZ;
      if (!_countingClipActive && (ox !== 0 || oy !== 0 || oz !== 0)) {
        // Normal gesture clips: apply full XYZ offset from gestureSmoothed.
        _fafE.set(ox, oy, oz, upperArm.rotation.order || "XYZ");
        _fafQ.setFromEuler(_fafE);
        upperArm.quaternion.multiply(_fafQ);
      } else if (_countingClipActive && (ox !== 0)) {
        // Counting mode: apply only the X offset as a small lift on top of the fist base.
        _fafE.set(ox, 0, 0, upperArm.rotation.order || "XYZ");
        _fafQ.setFromEuler(_fafE);
        upperArm.quaternion.multiply(_fafQ);
      }
    }

    // Forearm clip offset (elbow bend).
    // BUG FIX: _foreDownQ is never computed, so the old "if (_foreDownQ[side])" guard
    // silently blocked this entire block every frame.  Instead, we reset the forearm
    // to its captured baseRotation (which forceNeutralTeacherArmPoseEveryFrame() already
    // set earlier this frame), then multiply the elbow-bend delta on top.
    const foreArm = _foreArmBone[side];
    if (foreArm) {
      // Restore to A-pose base (euler → quaternion via Three.js sync).
      if (_foreDownQ[side]) {
        foreArm.quaternion.copy(_foreDownQ[side]);   // preferred path if ever computed
      } else {
        const fbase = foreArm.userData?.baseRotation;
        if (fbase) { foreArm.rotation.order = fbase.order; foreArm.rotation.copy(fbase); }
      }
      const fx = side === "L" ? gestureSmoothed.lForeX : gestureSmoothed.rForeX;
      if (Math.abs(fx) > 0.001) {
        _fafE.set(fx, 0, 0, foreArm.rotation.order || "XYZ");
        _fafQ.setFromEuler(_fafE);
        foreArm.quaternion.multiply(_fafQ);
      }
    }

    // Hand A-pose + wrist offsets (X = flex forward/back, Z = side tilt).
    const hand = _handBone[side];
    if (hand && _handDownQ[side]) {
      hand.quaternion.copy(_handDownQ[side]);
      const hx = side === "L" ? gestureSmoothed.lHandX : gestureSmoothed.rHandX;
      const hz = side === "L" ? gestureSmoothed.lHandZ : gestureSmoothed.rHandZ;
      if (hx !== 0 || hz !== 0) {
        _fafE.set(hx, 0, hz, hand.rotation.order || "XYZ");
        _fafQ.setFromEuler(_fafE);
        hand.quaternion.multiply(_fafQ);
      }
    }

    // Finger curl / per-finger extension.
    const curlRaw    = side === "L" ? gestureSmoothed.lFingerCurl   : gestureSmoothed.rFingerCurl;
    const idxOpen    = side === "L" ? gestureSmoothed.lIndexOpen    : gestureSmoothed.rIndexOpen;
    const midOpen    = side === "L" ? gestureSmoothed.lMiddleOpen   : gestureSmoothed.rMiddleOpen;
    const ringOpen   = side === "L" ? gestureSmoothed.lRingOpen     : gestureSmoothed.rRingOpen;
    const pinkyOpen  = side === "L" ? gestureSmoothed.lPinkyOpen    : gestureSmoothed.rPinkyOpen;
    const fingerList = _fingerBones[side];
    const anyFinger  = curlRaw !== 0 || idxOpen !== 0 || midOpen !== 0 || ringOpen !== 0 || pinkyOpen !== 0;
    if (fingerList.length > 0 && anyFinger) {
      // Max curl angle per phalanx — 70° gives a natural half-fist at curlRaw=1.
      const MAX_CURL_RAD = THREE.MathUtils.degToRad(70);
      for (const { bone, isThumb, isIndex, isMiddle, isRing, isPinky } of fingerList) {
        const baseQ = _fingerBaseQ.get(bone.uuid);
        if (!baseQ) continue;
        bone.quaternion.copy(baseQ);
        // Determine per-finger "open" override (0 = curled per curlRaw, 1 = fully extended).
        let openOverride = 0;
        if (isIndex)  openOverride = idxOpen;
        else if (isMiddle) openOverride = midOpen;
        else if (isRing)   openOverride = ringOpen;
        else if (isPinky)  openOverride = pinkyOpen;
        const effectiveCurl = curlRaw * (1 - openOverride);
        if (Math.abs(effectiveCurl) < 0.001) continue;
        const angle = effectiveCurl * MAX_CURL_RAD;
        // The bind-pose log shows finger bones are already flexed ~0.28 rad around
        // their LOCAL X axis — confirming X is the curl/flex axis for this model.
        // Positive X = curl toward palm (fist).  Thumbs also use Y to abduct inward.
        if (isThumb) {
          _fafE.set(angle * 0.4, angle * 0.5, 0, bone.rotation.order || "XYZ");
        } else {
          _fafE.set(angle, 0, 0, bone.rotation.order || "XYZ");
        }
        _fafQ.setFromEuler(_fafE);
        bone.quaternion.multiply(_fafQ);
      }
    }
  });
}

/**
 * Poses both upper arms so they hang straight down beside the body (parallel to the spine/Y axis).
 * Uses a world-space quaternion approach: measures the current arm direction at identity rotation,
 * then computes the local rotation needed to redirect it to (0, -1, 0).
 */
function poseArmsAtSide() {
  if (!avatarRoot) return;
  avatarRoot.updateMatrixWorld(true);

  // Helper: rotate `bone` so the direction from it to `endBone` points to targetDir.
  const rotateToDown = (bone, endBone, side, label, targetDir = new THREE.Vector3(0, -1, 0)) => {
    if (!bone || !endBone) { console.warn(`[poseArmsAtSide ${side}] missing ${label}`); return null; }
    const bp = new THREE.Vector3(); bone.getWorldPosition(bp);
    const ep = new THREE.Vector3(); endBone.getWorldPosition(ep);
    const currentDir = ep.clone().sub(bp).normalize();
    const angleDeg   = THREE.MathUtils.radToDeg(currentDir.angleTo(targetDir));
    console.log(`[poseArmsAtSide ${side}] ${label}: dir=${currentDir.toArray().map(v=>v.toFixed(3))} angle=${angleDeg.toFixed(1)}°`);
    if (angleDeg < 1) return bone.quaternion.clone();
    const worldDelta   = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);
    const curWorldQ    = new THREE.Quaternion(); bone.getWorldQuaternion(curWorldQ);
    const newWorldQ    = worldDelta.clone().multiply(curWorldQ);
    const parentWorldQ = new THREE.Quaternion(); bone.parent.getWorldQuaternion(parentWorldQ);
    const localQ       = parentWorldQ.clone().invert().multiply(newWorldQ);
    bone.quaternion.copy(localQ);
    avatarRoot.updateMatrixWorld(true);
    bone.getWorldPosition(bp); endBone.getWorldPosition(ep);
    console.log(`[poseArmsAtSide ${side}] ${label} AFTER: dir=${ep.clone().sub(bp).normalize().toArray().map(v=>v.toFixed(3))}`);
    return localQ;
  };

  const byName = {};
  avatarRoot.traverse(obj => { if (obj.isBone) byName[obj.name] = obj; });

  // Rotate each upper arm using the upper-arm → hand direction.
  // LEFT side of avatar = RightArm/RightHand bones (positive-X = avatar's right).
  // RIGHT side of avatar = LeftArm/LeftHand bones (negative-X = avatar's left... wait)
  // From bone dump: LeftArm world=(+0.15,...) = avatar's left arm is on world +X side.
  //                RightArm world=(-0.15,...) = avatar's right arm is on world -X side.
  const armPairs = [
    { upperArm: byName["LeftArm"],  hand: byName["LeftHand"],  side: "L_avatar" },
    { upperArm: byName["RightArm"], hand: byName["RightHand"], side: "R_avatar" },
  ];
  // A-pose angle: upper arm hangs ~15° outward from vertical (like the reference image).
  const aPoseAngle = THREE.MathUtils.degToRad(15);
  const sinA = Math.sin(aPoseAngle); // ~0.26
  const cosA = Math.cos(aPoseAngle); // ~0.97

  armPairs.forEach(({ upperArm, hand, side }) => {
    if (!upperArm) return;
    // Determine which world side this arm is on to pick outward-lean direction.
    const wp = new THREE.Vector3(); upperArm.getWorldPosition(wp);
    const worldSide = (wp.x >= 0) ? "R" : "L";
    // Target: slightly outward (+X for right-world-side, -X for left-world-side), mostly down.
    const outward = (worldSide === "R") ? sinA : -sinA;
    const armTarget = new THREE.Vector3(outward, -cosA, 0).normalize();

    const q = rotateToDown(upperArm, hand, side, "upperArm→hand", armTarget);
    if (q) {
      _armDownQ[worldSide]    = q;
      _realArmBone[worldSide] = upperArm;
    }

    // Rotate the hand/wrist so fingers point straight down.
    if (hand) {
      const middleFinger = hand.children.find(c => c.isBone && /middle/i.test(c.name))
                        || hand.children.find(c => c.isBone);
      if (middleFinger) {
        const hq = rotateToDown(hand, middleFinger, side, "hand→finger");
        if (hq) {
          const hwp = new THREE.Vector3(); hand.getWorldPosition(hwp);
          const ws = (hwp.x >= 0) ? "R" : "L";
          _handDownQ[ws] = hq;
          _handBone[ws]  = hand;
        }
      }
    }
  });

  avatarRoot.updateMatrixWorld(true);
  console.log("[rig] poseArmsAtSide: complete");
}

/**
 * Called once after poseArmsAtSide(). Walks all descendant bones of each
 * hand bone, stores their current (A-pose) quaternion as base, and records
 * whether each bone is an index finger or thumb for targeted per-gesture control.
 */
function captureFingerBasePose() {
  if (!avatarRoot) return;
  avatarRoot.updateMatrixWorld(true);
  _fingerBones.L = [];
  _fingerBones.R = [];
  _fingerBaseQ.clear();

  // Hand bone name → world-side key
  const handEntries = [
    { boneName: "LeftHand",  side: null }, // world side determined by position below
    { boneName: "RightHand", side: null },
  ];

  const byName = {};
  avatarRoot.traverse(obj => { if (obj.isBone) byName[obj.name] = obj; });

  for (const { boneName } of handEntries) {
    const handBone = byName[boneName];
    if (!handBone) continue;

    // Determine world side from hand world position (matches _handBone mapping).
    const hwp = new THREE.Vector3();
    handBone.getWorldPosition(hwp);
    const side = hwp.x >= 0 ? "R" : "L";

    handBone.traverse(obj => {
      if (!obj.isBone || obj === handBone) return;
      const n = obj.name.toLowerCase();
      // Accept bones named with standard finger/knuckle patterns.
      const isFinger = /thumb|index|middle|ring|pinky|finger/i.test(n);
      if (!isFinger) return;

      const isThumb  = /thumb/i.test(n);
      const isIndex  = /index/i.test(n);
      const isMiddle = /middle/i.test(n);
      const isRing   = /ring/i.test(n);
      const isPinky  = /pinky|little/i.test(n);
      _fingerBones[side].push({ bone: obj, isThumb, isIndex, isMiddle, isRing, isPinky });
      _fingerBaseQ.set(obj.uuid, obj.quaternion.clone());
    });

    const count = _fingerBones[side].length;
    console.log(`[fingers] side=${side} bone="${boneName}" found=${count} finger bones`);
  }

  // Summary log for the animation system.
  const totalL = _fingerBones.L.length;
  const totalR = _fingerBones.R.length;
  const types  = new Set();
  [..._fingerBones.L, ..._fingerBones.R].forEach(e => {
    if (e.isThumb)  types.add("thumb");
    if (e.isIndex)  types.add("index");
    if (e.isMiddle) types.add("middle");
    if (e.isRing)   types.add("ring");
    if (e.isPinky)  types.add("pinky");
  });
  if (totalL > 0 || totalR > 0) {
    console.log(
      `[anim] Finger rig detected ✓  L=${totalL} bones  R=${totalR} bones` +
      `  fingers: [${[...types].join(", ")}]` +
      `  → per-finger curl/spread animations enabled`
    );
  } else {
    console.warn("[anim] No finger bones found — finger animations will be skipped.");
  }
}

/**
 * Compute world-space quaternions that swing each upper arm FORWARD (toward the
 * camera, +Z world) for the fist-in-front-of-body pose.
 *
 * This mirrors the approach of poseArmsAtSide() but targets a forward+down
 * direction instead of straight down, so the arm extends in front of the torso.
 *
 * Results are stored in _fistArmQ and reused every frame while counting.
 * Call once before starting the counting animation (inside applyClosedFistPose).
 *
 * HOW TO ADJUST THE FIST POSITION:
 *   Change the targetDir vectors below.
 *   X = outward lean (negative = avatar's right, positive = avatar's left in world)
 *   Y = downward component (more negative = arm hangs lower)
 *   Z = forward component (more positive = hands closer to camera / more "raised front")
 */
function computeFistArmQuaternions() {
  if (!avatarRoot) return;
  avatarRoot.updateMatrixWorld(true);

  // --- Target world-directions for each upper arm in fist pose ----------------
  // The arm bone spans from shoulder joint to elbow joint.
  // These directions put the elbow at roughly belly/chest height, in front.
  //   "L" side = RightArm bone (world -X side of avatar)
  //   "R" side = LeftArm  bone (world +X side of avatar)
  const targets = {
    L: new THREE.Vector3(-0.12, -0.60, 0.78).normalize(),  // right arm of avatar
    R: new THREE.Vector3( 0.12, -0.60, 0.78).normalize(),  // left arm of avatar
  };

  ["L", "R"].forEach(side => {
    const arm  = _realArmBone[side];
    const fore = _foreArmBone[side];
    if (!arm || !fore) return;

    // Reset the upper arm to its captured A-pose so the world-matrix is consistent.
    const base = arm.userData?.baseRotation;
    if (base) { arm.rotation.order = base.order; arm.rotation.copy(base); }
    avatarRoot.updateMatrixWorld(true);

    // Measure the current arm direction (shoulder→elbow in world space).
    const armPos  = new THREE.Vector3(); arm.getWorldPosition(armPos);
    const forePos = new THREE.Vector3(); fore.getWorldPosition(forePos);
    const currentDir = forePos.clone().sub(armPos).normalize();
    if (currentDir.lengthSq() < 1e-6) return;

    // Compute the world-space rotation delta.
    const target     = targets[side];
    const worldDelta = new THREE.Quaternion().setFromUnitVectors(currentDir, target);

    // Convert to the bone's LOCAL space.
    const curWorldQ    = new THREE.Quaternion(); arm.getWorldQuaternion(curWorldQ);
    const newWorldQ    = worldDelta.clone().multiply(curWorldQ);
    const parentWorldQ = new THREE.Quaternion(); arm.parent.getWorldQuaternion(parentWorldQ);
    _fistArmQ[side]    = parentWorldQ.clone().invert().multiply(newWorldQ);

    console.log(`[fist] ${side} arm: ${currentDir.toArray().map(v=>v.toFixed(3))} → ${target.toArray().map(v=>v.toFixed(3))}`);
  });
}

function solveNeutralArmDownPose(side) {
  const upper    = side === "L" ? rigBones.leftUpperArm  : rigBones.rightUpperArm;
  const fore     = side === "L" ? rigBones.leftForeArm   : rigBones.rightForeArm;
  const hand     = side === "L" ? rigBones.leftHand      : rigBones.rightHand;
  const shoulder = side === "L" ? rigBones.leftShoulder  : rigBones.rightShoulder;
  if (!upper || !upper.parent) return;

  const armChild = fore || upper.children.find((c) => c.isBone);
  if (!armChild) return;

  // Reset all arm bones to bind pose so we start from a consistent state.
  if (shoulder) { shoulder.rotation.order = "XYZ"; shoulder.rotation.set(0, 0, 0); }
  upper.rotation.order = "XYZ"; upper.rotation.set(0, 0, 0);
  if (fore) { fore.rotation.order = "XYZ"; fore.rotation.set(0, 0, 0); }
  if (hand) { hand.rotation.order = "XYZ"; hand.rotation.set(0, 0, 0); }
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);

  // ── Upper arm ─────────────────────────────────────────────────────────────
  // Measure the actual world direction from the upper-arm joint to the forearm joint.
  const wpUpper = new THREE.Vector3();
  const wpChild = new THREE.Vector3();
  upper.getWorldPosition(wpUpper);
  armChild.getWorldPosition(wpChild);

  const curArmWorldDir = wpChild.clone().sub(wpUpper).normalize();
  if (curArmWorldDir.lengthSq() < 0.0001) {
    console.warn(`[rig] arm-down: zero arm length for ${side}`); return;
  }

  // Target: arm points world -Y with slight outward lean.
  const sideX = side === "L" ? -0.15 : 0.15;
  const targetArmWorldDir = new THREE.Vector3(sideX, -1, 0).normalize();

  // Rotation that maps current world arm direction → target world arm direction.
  const worldDeltaQ = new THREE.Quaternion().setFromUnitVectors(curArmWorldDir, targetArmWorldDir);

  // Apply that world-space rotation on top of the bone's current world quaternion.
  const boneWorldQ = new THREE.Quaternion();
  upper.getWorldQuaternion(boneWorldQ);
  const newBoneWorldQ = worldDeltaQ.clone().multiply(boneWorldQ);

  // Convert from world quaternion → local quaternion (remove parent contribution).
  const parentWorldQ = new THREE.Quaternion();
  upper.parent.getWorldQuaternion(parentWorldQ);
  const upperLocalQ = parentWorldQ.clone().invert().multiply(newBoneWorldQ);

  // Assign — set both quaternion and rotation for maximum Three.js compatibility.
  upper.quaternion.copy(upperLocalQ);
  upper.rotation.order = "XYZ";
  upper.rotation.setFromQuaternion(upperLocalQ, "XYZ");
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);

  // ── Forearm: slight natural bend toward the front ─────────────────────────
  if (fore && fore.parent) {
    const foreChild = hand || fore.children.find((c) => c.isBone);
    if (foreChild) {
      const wpFore = new THREE.Vector3();
      const wpForeChild = new THREE.Vector3();
      fore.getWorldPosition(wpFore);
      foreChild.getWorldPosition(wpForeChild);

      const curForeWorldDir = wpForeChild.clone().sub(wpFore).normalize();
      if (curForeWorldDir.lengthSq() > 0.0001) {
        // Slight bend: arm still goes mostly down, small forward lean.
        const foreTarget = new THREE.Vector3(sideX * 0.4, -1, 0.12).normalize();
        const foreDeltaQ = new THREE.Quaternion().setFromUnitVectors(curForeWorldDir, foreTarget);
        const foreWorldQ = new THREE.Quaternion();
        fore.getWorldQuaternion(foreWorldQ);
        const newForeWorldQ = foreDeltaQ.clone().multiply(foreWorldQ);
        const foreParentWorldQ = new THREE.Quaternion();
        fore.parent.getWorldQuaternion(foreParentWorldQ);
        const foreLocalQ = foreParentWorldQ.clone().invert().multiply(newForeWorldQ);
        fore.quaternion.copy(foreLocalQ);
        fore.rotation.order = "XYZ";
        fore.rotation.setFromQuaternion(foreLocalQ, "XYZ");
        if (avatarRoot) avatarRoot.updateMatrixWorld(true);
      }
    }
  }

  // ── Hand: relaxed wrist ───────────────────────────────────────────────────
  if (hand) { hand.rotation.order = "XYZ"; hand.rotation.set(0, 0, 0); }

  // ── Shoulder/clavicle: natural droop ─────────────────────────────────────
  if (shoulder) {
    shoulder.rotation.order = "XYZ";
    shoulder.rotation.set(0.04, 0, side === "L" ? -0.04 : 0.04);
  }

  if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  const tipBone = hand || fore;
  if (tipBone) {
    tipBone.getWorldPosition(_rigWorldHand);
    const refY = getShoulderReferenceWorldY(side);
    console.log(`[rig] arm-down world-space (${side}) finalHandY=${_rigWorldHand.y.toFixed(3)} shoulderY=${refY?.toFixed(3)}`);
  }
}

/**
 * ===================== MANUAL NEUTRAL ARM POSE SECTION =====================
 * Build a manual neutral teacher pose from scratch (absolute local eulers).
 * IMPORTANT:
 * - does NOT trust imported arm pose
 * - applied after model load and before baseRotation capture
 * - result: both arms down, slight elbow bend, hands below shoulders
 */
function applyTeacherNeutralStandingPose() {
  // No arm manipulation — avatar uses its native imported pose from the GLB.
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  console.log("[rig] applyTeacherNeutralStandingPose: using native GLB arm pose (no overrides)");
}

/** After bone detect + skeleton align: set neutral standing before baseRotation capture. */
function applyTeacherRestPose() {
  applyTeacherNeutralStandingPose();
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  console.log("[rig] applyTeacherRestPose complete (manual neutral pose ready for baseRotation)");
}

function getTeacherAnimatedBones() {
  return [
    rigBones.spine,
    rigBones.spine1,
    rigBones.chest,
    rigBones.neck,
    rigBones.head,
    rigBones.leftShoulder,
    rigBones.rightShoulder,
    rigBones.leftUpperArm,
    rigBones.rightUpperArm,
    rigBones.leftForeArm,
    rigBones.rightForeArm,
    rigBones.leftHand,
    rigBones.rightHand,
  ].filter(Boolean);
}

/**
 * Capture baseRotation for the arm control chain (shoulders / upper / fore / hands + spine + neck).
 * Called once after applyTeacherRestPose(); mandatory clamps keep motion within ±delta of these values.
 */
function captureArmChainBaseRotations() {
  const chain = [
    rigBones.leftShoulder,
    rigBones.rightShoulder,
    rigBones.leftUpperArm,
    rigBones.rightUpperArm,
    rigBones.leftForeArm,
    rigBones.rightForeArm,
    rigBones.leftHand,
    rigBones.rightHand,
    rigBones.spine,
    rigBones.neck,
    ...allResolvedLeftArmBones,
    ...allResolvedArmBones,
  ].filter(Boolean);
  for (const bone of chain) {
    bone.userData.baseRotation = bone.rotation.clone();
  }
  return chain.length;
}

/** ====================== BASE POSE SAVING SECTION ======================
 * Store neutral local euler for the full animated rig (arm chain + torso/head).
 */
function captureTeacherBaseRotations() {
  teacherRigReady = false;
  captureArmChainBaseRotations();
  const list = getTeacherAnimatedBones();
  for (const bone of list) {
    bone.userData.baseRotation = bone.rotation.clone();
  }
  teacherRigReady = list.length > 0;
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  const lRef = getShoulderReferenceWorldY("L");
  const rRef = getShoulderReferenceWorldY("R");
  const lTip = rigBones.leftHand || rigBones.leftForeArm;
  const rTip = rigBones.rightHand || rigBones.rightForeArm;
  const lHandY = lTip ? lTip.getWorldPosition(_rigWorldHand).y : null;
  const rHandY = rTip ? rTip.getWorldPosition(_rigWorldHand).y : null;
  console.log("Base pose saved AFTER correction", {
    bones: list.length,
    ready: teacherRigReady,
    leftHandY: lHandY,
    leftShoulderY: lRef,
    rightHandY: rHandY,
    rightShoulderY: rRef,
  });
}

function lerpToward(current, target, dt, speed) {
  return THREE.MathUtils.lerp(current, target, Math.min(1, dt * speed));
}

/**
 * Apply one bone: baseRotation + clamped offset. No persistent += on bone.rotation across frames.
 */
function applyRotationFromBaseWithOffset(bone, ox, oy, oz, maxAbsRad) {
  const b = bone?.userData?.baseRotation;
  if (!bone || !b) return;
  const cap = maxAbsRad ?? TEACHER_GESTURE_CONFIG.maxArmOffsetRad;
  const dx = THREE.MathUtils.clamp(ox, -cap, cap);
  const dy = THREE.MathUtils.clamp(oy, -cap, cap);
  const dz = THREE.MathUtils.clamp(oz, -cap, cap);
  bone.rotation.order = b.order;
  bone.rotation.set(b.x + dx, b.y + dy, b.z + dz);
}

/** Upper arms: local euler = base + small clamped offsets (never cumulative). */
function applyUpperArmRotationFromBase(bone, ox, oy, oz) {
  const b = bone?.userData?.baseRotation;
  if (!bone || !b) return;
  const ax = TEACHER_GESTURE_CONFIG.armAxisOffsetRad;
  const dx = THREE.MathUtils.clamp(ox, -ax.x, ax.x);
  const dy = THREE.MathUtils.clamp(oy, -ax.y, ax.y);
  const dz = THREE.MathUtils.clamp(oz, -ax.z, ax.z);
  bone.rotation.order = b.order;
  bone.rotation.set(b.x + dx, b.y + dy, b.z + dz);
}

/** Forearm: local X only, base + small offset (never cumulative). */
function applyForearmRotationFromBase(bone, ox) {
  const b = bone?.userData?.baseRotation;
  if (!bone || !b) return;
  const cap = TEACHER_GESTURE_CONFIG.maxForeOffsetRad;
  const dx = THREE.MathUtils.clamp(ox, -cap, cap);
  bone.rotation.order = b.order;
  bone.rotation.set(b.x + dx, b.y, b.z);
}

function getArmBoneSafetyDeltaRad(bone) {
  if (!bone) return ARM_SAFETY_BASE_DELTA_RAD.default;
  const n = String(bone.name || "").toLowerCase();
  if (/shoulder|clavicle/.test(n)) return ARM_SAFETY_BASE_DELTA_RAD.shoulder;
  if (/fore|lowerarm/.test(n)) return ARM_SAFETY_BASE_DELTA_RAD.foreArm;
  if (/hand|wrist/.test(n)) return ARM_SAFETY_BASE_DELTA_RAD.hand;
  if (/arm/.test(n) && !/fore|lower|hand/.test(n)) return ARM_SAFETY_BASE_DELTA_RAD.upperArm;
  return ARM_SAFETY_BASE_DELTA_RAD.default;
}

/**
 * Mandatory safety clamp: each euler axis locked to baseRotation ± delta (arm chain only).
 * @returns {{ clamped: boolean, logs: string[] }}
 */
function applyMandatoryArmSafetyEulerClamp(bone, boneLabel, silent) {
  const b = bone?.userData?.baseRotation;
  if (!bone || !b) return { clamped: false, logs: [] };
  const d = getArmBoneSafetyDeltaRad(bone);
  bone.rotation.order = b.order || bone.rotation.order || "XYZ";
  const ox = bone.rotation.x;
  const oy = bone.rotation.y;
  const oz = bone.rotation.z;
  const nx = THREE.MathUtils.clamp(ox, b.x - d, b.x + d);
  const ny = THREE.MathUtils.clamp(oy, b.y - d, b.y + d);
  const nz = THREE.MathUtils.clamp(oz, b.z - d, b.z + d);
  const logs = [];
  if (Math.abs(nx - ox) > 1e-6) logs.push(`${boneLabel} x: ${ox.toFixed(3)} → ${nx.toFixed(3)}`);
  if (Math.abs(ny - oy) > 1e-6) logs.push(`${boneLabel} y: ${oy.toFixed(3)} → ${ny.toFixed(3)}`);
  if (Math.abs(nz - oz) > 1e-6) logs.push(`${boneLabel} z: ${oz.toFixed(3)} → ${nz.toFixed(3)}`);
  if (!silent && logs.length) {
    console.warn("[safety] illegal euler (outside base±δ) → clamped:", logs.join(" | "));
  }
  bone.rotation.set(nx, ny, nz);
  return { clamped: logs.length > 0, logs };
}

/** Hard reset one side to captured base pose (last resort when height lock cannot converge). */
function hardResetArmChainToBase(side) {
  // During debugging, base may be contaminated. Re-solve a true arms-down pose for this side.
  solveNeutralArmDownPose(side);
  // Update captured base for this side so subsequent safety locks use corrected pose.
  const bones =
    side === "L"
      ? [rigBones.leftShoulder, rigBones.leftUpperArm, rigBones.leftForeArm, rigBones.leftHand]
      : [rigBones.rightShoulder, rigBones.rightUpperArm, rigBones.rightForeArm, rigBones.rightHand];
  for (const bone of bones) {
    if (!bone) continue;
    bone.userData.baseRotation = bone.rotation.clone();
  }
}

/**
 * ARM SAFETY — final pass before render: world-space height; if violated, reset limb to base.
 * Runs after updateTeacherBodyAnimation() in animate(), immediately before renderer.render().
 */
function armSafetyHardLockBeforeRender() {
  // Disabled — arms use the native imported GLB pose; no safety overrides.
}

/**
 * If hand/wrist world Y is above shoulder reference, nudge local rotations using short search
 * (does not assume which euler axis “means up”; picks best lowering step each round).
 */
function enforceHandBelowShoulderWorld(side) {
  if (!avatarRoot) return;
  const cfg = TEACHER_GESTURE_CONFIG;
  const shoulderBone = side === "L" ? (rigBones.leftShoulder || rigBones.leftUpperArm) : (rigBones.rightShoulder || rigBones.rightUpperArm);
  const upper = side === "L" ? rigBones.leftUpperArm : rigBones.rightUpperArm;
  const fore = side === "L" ? rigBones.leftForeArm : rigBones.rightForeArm;
  const hand = side === "L" ? rigBones.leftHand : rigBones.rightHand;
  const tipBone = hand || fore;
  if (!upper || !tipBone) return;

  const margin = cfg.handShoulderHeightMargin;
  // World +Z “forward” penalty is wrong for many bind orientations and fights neutral pose every frame.
  const penalizeForwardReach = !ARM_GESTURES_DISABLED;
  const forwardMargin = 0.06;
  const savedShoulder = new THREE.Euler();
  const savedUpper = new THREE.Euler();
  const savedFore = new THREE.Euler();
  const trial = new THREE.Euler();

  for (let round = 0; round < cfg.handHeightCorrectMaxRounds; round += 1) {
    avatarRoot.updateMatrixWorld(true);
    const refY = getShoulderReferenceWorldY(side);
    if (refY == null) return;
    tipBone.getWorldPosition(_rigWorldHand);
    shoulderBone?.getWorldPosition(_rigWorldShoulder);
    let err = _rigWorldHand.y - refY - margin;
    let fwdErr = 0;
    if (penalizeForwardReach) {
      fwdErr = Math.max(0, _rigWorldHand.z - _rigWorldShoulder.z - forwardMargin);
      err += fwdErr * 1.4;
    }
    if (fore) {
      fore.getWorldPosition(_rigWorldElbow);
      const elbowMargin = margin * cfg.elbowHeightMarginScale;
      err = Math.max(err, _rigWorldElbow.y - refY - elbowMargin);
      if (penalizeForwardReach) err = Math.max(err, fwdErr * 1.4);
    }
    if (err <= 0) return;

    if (shoulderBone) savedShoulder.copy(shoulderBone.rotation);
    savedUpper.copy(upper.rotation);
    if (fore) savedFore.copy(fore.rotation);

    let bestScore = err;
    let bestUpper = null;
    let bestFore = null;

    const tryPose = (sEul, uEul, fEul) => {
      if (shoulderBone && sEul) shoulderBone.rotation.copy(sEul);
      upper.rotation.copy(uEul);
      if (fore) {
        fore.rotation.copy(fEul !== undefined ? fEul : savedFore);
      }
      if (shoulderBone) applyMandatoryArmSafetyEulerClamp(shoulderBone, `${side}Shoulder`, true);
      applyMandatoryArmSafetyEulerClamp(upper, `${side}Upper`, true);
      if (fore) applyMandatoryArmSafetyEulerClamp(fore, `${side}Fore`, true);
      avatarRoot.updateMatrixWorld(true);
      const ry = getShoulderReferenceWorldY(side);
      if (ry == null) return err;
      tipBone.getWorldPosition(_rigWorldHand);
      shoulderBone?.getWorldPosition(_rigWorldShoulder);
      let sc = _rigWorldHand.y - ry - margin;
      let fwdSc = 0;
      if (penalizeForwardReach) {
        fwdSc = Math.max(0, _rigWorldHand.z - _rigWorldShoulder.z - forwardMargin);
        sc += fwdSc * 1.4;
      }
      if (fore) {
        fore.getWorldPosition(_rigWorldElbow);
        sc = Math.max(sc, _rigWorldElbow.y - ry - margin * cfg.elbowHeightMarginScale);
        if (penalizeForwardReach) sc = Math.max(sc, fwdSc * 1.4);
      }
      return sc;
    };

    const trials = [];
    const stepU = 0.026;
    const stepF = 0.016;
    for (const axis of ["x", "y", "z"]) {
      for (const sgn of [1, -1]) {
        trial.copy(savedUpper);
        trial[axis] += sgn * stepU;
        trials.push({ s: savedShoulder.clone(), u: trial.clone() });
      }
    }
    if (shoulderBone) {
      const stepS = 0.03;
      for (const axis of ["x", "y", "z"]) {
        for (const sgn of [1, -1]) {
          trial.copy(savedShoulder);
          trial[axis] += sgn * stepS;
          trials.push({ s: trial.clone(), u: savedUpper.clone(), f: savedFore.clone() });
        }
      }
    }
    if (fore) {
      trial.copy(savedFore);
      trial.x += stepF;
      trials.push({ s: savedShoulder.clone(), u: savedUpper.clone(), f: trial.clone() });
      trial.copy(savedFore);
      trial.x -= stepF;
      trials.push({ s: savedShoulder.clone(), u: savedUpper.clone(), f: trial.clone() });
    }

    for (const t of trials) {
      const sc = tryPose(t.s, t.u, t.f);
      if (sc < bestScore) {
        bestScore = sc;
        if (t.s) savedShoulder.copy(t.s);
        bestUpper = t.u.clone();
        bestFore = t.f !== undefined ? t.f.clone() : (fore ? savedFore.clone() : null);
      }
      if (shoulderBone) shoulderBone.rotation.copy(savedShoulder);
      upper.rotation.copy(savedUpper);
      if (fore) fore.rotation.copy(savedFore);
    }

    if (bestUpper && bestScore < err - 0.0008) {
      upper.rotation.copy(bestUpper);
      if (fore) fore.rotation.copy(bestFore != null ? bestFore : savedFore);
      if (shoulderBone) applyMandatoryArmSafetyEulerClamp(shoulderBone, `${side}Shoulder`, true);
      applyMandatoryArmSafetyEulerClamp(upper, `${side}Upper`, true);
      if (fore) applyMandatoryArmSafetyEulerClamp(fore, `${side}Fore`, true);
      console.warn(`[safety] unsafe hand height correction (${side}) → corrected (residual≈${bestScore.toFixed(4)}m)`);
    } else {
      if (shoulderBone) shoulderBone.rotation.copy(savedShoulder);
      upper.rotation.copy(savedUpper);
      if (fore) fore.rotation.copy(savedFore);
      if (shoulderBone) applyMandatoryArmSafetyEulerClamp(shoulderBone, `${side}Shoulder`, true);
      applyMandatoryArmSafetyEulerClamp(upper, `${side}Upper`, true);
      if (fore) applyMandatoryArmSafetyEulerClamp(fore, `${side}Fore`, true);
      break;
    }
  }

  avatarRoot.updateMatrixWorld(true);
  const refYFinal = getShoulderReferenceWorldY(side);
  if (refYFinal == null) return;
  tipBone.getWorldPosition(_rigWorldHand);
  shoulderBone?.getWorldPosition(_rigWorldShoulder);
  let errFinal = _rigWorldHand.y - refYFinal - margin;
  let fwdFinal = 0;
  if (penalizeForwardReach) {
    fwdFinal = Math.max(0, _rigWorldHand.z - _rigWorldShoulder.z - forwardMargin);
    errFinal += fwdFinal * 1.4;
  }
  if (fore) {
    fore.getWorldPosition(_rigWorldElbow);
    errFinal = Math.max(errFinal, _rigWorldElbow.y - refYFinal - margin * cfg.elbowHeightMarginScale);
    if (penalizeForwardReach) errFinal = Math.max(errFinal, fwdFinal * 1.4);
  }
  if (errFinal > 0) {
    console.warn(`[safety] unsafe hand height correction (${side}) → corrected (hard reset to base)`);
    hardResetArmChainToBase(side);
    applyMandatoryArmSafetyEulerClamp(shoulderBone, `${side}ShoulderRef`, true);
    applyMandatoryArmSafetyEulerClamp(upper, `${side}Upper`, true);
    if (fore) applyMandatoryArmSafetyEulerClamp(fore, `${side}Fore`, true);
    if (hand) applyMandatoryArmSafetyEulerClamp(hand, `${side}Hand`, true);
  }
}

function detectSentenceTypeForAnimation(text) {
  const s = String(text || "").trim();
  const low = s.toLowerCase();
  if (!s) return "explaining";
  if (s.endsWith("?")) return "asking";
  if (/\b(important|remember|why|key|note|notice)\b/.test(low)) return "emphasis";
  // Pointing: deictic words that direct attention to something visible.
  if (/\b(this|here|look|see|notice|there|that one|over here|right here)\b/.test(low)) return "pointing";
  // Counting: explicit numbers, ordinal words, or enumeration phrases.
  if (/\b(first|second|third|fourth|one|two|three|four|five|\d+[\s.,])\b/.test(low)) return "counting";
  if (/\b\d+\.\s|\n\d+\.\s|,\s*[a-z].*,\s*[a-z]/i.test(s)) return "list";
  if (/^[A-Za-z][A-Za-z'-]{2,}\s*[:.-]/.test(s)) return "vocab";
  return "explaining";
}

function triggerTeacherGesture(type, _text) {
  teacherAnim.speaking = true;
  teacherAnim.speechType = type || "explaining";
  teacherAnim.elapsed = 0;
  teacherAnim.phrasePhase = Math.random() * Math.PI * 2;
  teacherAnim.emphasisLeadArm = Math.random() < 0.5 ? "L" : "R";
  teacherAnim.armMotionScale = 1;

  const clips = (typeof TEACHING_CLIPS !== "undefined") ? TEACHING_CLIPS : window.TEACHING_CLIPS;
  if (clips) {
    teacherAnim.activeClip = clips[teacherAnim.speechType] ?? clips["explaining"] ?? null;
    teacherAnim.clipElapsed = 0;
    console.log(`[gesture] clip started: type=${teacherAnim.speechType} loop=${teacherAnim.activeClip?.loop}`);
  } else {
    console.warn("[gesture] TEACHING_CLIPS not loaded — no arm gesture will play.");
  }
}

function onSpeechAnimationEnded() {
  teacherAnim.speaking = false;
  teacherAnim.speechType = "explaining";
  teacherAnim.armMotionScale = 0;
  // Clear active clip so arms smoothly return to A-pose between sentences.
  teacherAnim.activeClip = null;
  teacherAnim.clipElapsed = 0;
  // Exit counting/fist mode so forceArmDownEveryFrame reverts to A-pose base.
  _countingClipActive = false;
  // Return to a neutral teacher look after spoken phrases.
  selectedEmotion = "neutral";
  neutralFace();
}

function isHandAboveShoulder(side) {
  if (!avatarRoot) return false;
  const fore = side === "L" ? rigBones.leftForeArm : rigBones.rightForeArm;
  const hand = side === "L" ? rigBones.leftHand : rigBones.rightHand;
  const tip = hand || fore;
  if (!tip) return false;
  const refY = getShoulderReferenceWorldY(side);
  if (refY == null) return false;
  avatarRoot.updateMatrixWorld(true);
  tip.getWorldPosition(_rigWorldHand);
  if (fore) {
    fore.getWorldPosition(_rigWorldElbow);
    if (_rigWorldElbow.y > refY - 1e-5) return true;
  }
  return _rigWorldHand.y > refY - 1e-5;
}

function disableArmAnimationSystemsForDebug() {
  // This project currently uses no THREE.AnimationMixer / clip actions for the avatar.
  // Keep log explicit so we can confirm no hidden mixer path exists.
  if (teacherAnim.debugLogTimer <= 0) {
    console.log("[rig] Freeze Arms mode active: no AnimationMixer/actions detected; procedural arm updates are disabled.");
  }
}

function enforceFreezeArmsAndDetectOverrides() {
  if (!ARM_DEBUG_CONFIG.freezeArms || !teacherRigReady) return;
  const chain = [
    rigBones.leftShoulder,
    rigBones.rightShoulder,
    rigBones.leftUpperArm,
    rigBones.rightUpperArm,
    rigBones.leftForeArm,
    rigBones.rightForeArm,
    rigBones.leftHand,
    rigBones.rightHand,
    ...allResolvedLeftArmBones,
    ...allResolvedArmBones,
  ].filter(Boolean);
  // Lock pose using current base rotation every frame.
  for (const bone of chain) {
    const base = bone?.userData?.baseRotation;
    if (!base) continue;
    const prev = _armDebugRotPrev.get(bone.uuid);
    if (prev) {
      const moved =
        Math.abs(bone.rotation.x - prev.x) > 1e-5
        || Math.abs(bone.rotation.y - prev.y) > 1e-5
        || Math.abs(bone.rotation.z - prev.z) > 1e-5;
      if (moved) {
        if (/leftarm|leftforearm|lefthand|leftshoulder/i.test(String(bone.name || ""))) {
          console.warn(`LeftArm changed by animation mixer (or other system): ${bone.name}`);
        }
        console.warn(`Pose overridden after reset: ${bone.name}`);
        console.warn(`Unexpected rotation detected on ${bone.name}`);
      }
    }
    bone.rotation.order = base.order;
    bone.rotation.copy(base);
    _armDebugFreezeLocked.set(bone.uuid, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z });
  }
  if (avatarRoot) avatarRoot.updateMatrixWorld(true);
  for (const bone of chain) {
    _armDebugRotPrev.set(bone.uuid, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z });
  }
}

/** Force neutral arm posture every frame: both arms down, slight elbow bend, hands below shoulders. */
function forceNeutralTeacherArmPoseEveryFrame() {
  if (!teacherRigReady) return;
  // Restore the native imported GLB pose — no clamping or enforcement.
  const armChain = [
    rigBones.leftShoulder,
    rigBones.rightShoulder,
    rigBones.leftUpperArm,
    rigBones.rightUpperArm,
    rigBones.leftForeArm,
    rigBones.rightForeArm,
    rigBones.leftHand,
    rigBones.rightHand,
  ].filter(Boolean);
  for (const bone of armChain) {
    const b = bone?.userData?.baseRotation;
    if (!b) continue;
    bone.rotation.order = b.order;
    bone.rotation.copy(b);
  }
  for (const b of allResolvedLeftArmBones) {
    const base = b?.userData?.baseRotation;
    if (!base) continue;
    b.rotation.order = base.order;
    b.rotation.copy(base);
  }
  for (const b of allResolvedArmBones) {
    const base = b?.userData?.baseRotation;
    if (!base) continue;
    b.rotation.order = base.order;
    b.rotation.copy(base);
  }
}

function updateTeacherBodyAnimation(dt) {
  if (!teacherRigReady) return;

  teacherAnim.elapsed += dt;
  teacherAnim.blinkTimer += dt;
  teacherAnim.debugLogTimer -= dt;

  if (ARM_DEBUG_CONFIG.freezeArms) {
    disableArmAnimationSystemsForDebug();
    // Freeze all procedural body motion during debugging; keep only blink logic.
    const freezeBones = [rigBones.spine, rigBones.spine1, rigBones.chest, rigBones.neck, rigBones.head].filter(Boolean);
    for (const b of freezeBones) {
      const base = b?.userData?.baseRotation;
      if (!base) continue;
      b.rotation.order = base.order;
      b.rotation.copy(base);
    }
    Object.keys(gestureSmoothed).forEach((k) => {
      gestureSmoothed[k] = 0;
    });
    forceNeutralTeacherArmPoseEveryFrame();
    enforceFreezeArmsAndDetectOverrides();
    if (teacherAnim.blinkTimer > 2.6) {
      teacherAnim.blinkTimer = 0;
      blinkOnce();
    }
    return;
  }

  const cfg = TEACHER_GESTURE_CONFIG;
  const t = teacherAnim.elapsed;
  const breath = Math.sin(t * 1.7) * cfg.idleBreathingAmp;
  const idleSway = Math.sin(t * 0.85) * (cfg.idleBreathingAmp * 0.6);

  const activeAudio = getActiveAudio();
  const liveLesson = Boolean(lessonController?.lessonRunning && !lessonController?.paused);
  const liveVoice = speechIsActive && activeAudio ? 1 : (teacherAnim.speaking ? 0.28 : 0);
  const jaw = speechIsActive ? getMaxJawInfluenceForBody() : 0;
  const audioT = speechIsActive && activeAudio ? activeAudio.currentTime : 0;
  const audioPulse = speechIsActive ? 0.5 + 0.5 * Math.sin(audioT * 16.2 + teacherAnim.phrasePhase) : 0;
  const voiceEngage = THREE.MathUtils.clamp(
    jaw * cfg.voiceToBodyCoupling * liveVoice + audioPulse * 0.26 * liveVoice,
    0,
    1,
  );

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
  gestureSmoothed.headX = lerpToward(gestureSmoothed.headX, tgtHeadX, dt, sp);
  gestureSmoothed.headZ = lerpToward(gestureSmoothed.headZ, tgtHeadZ, dt, sp);
  // --- Teaching clip arm offsets ---
  {
    const clip = teacherAnim.activeClip;
    if (clip && teacherAnim.speaking) {
      teacherAnim.clipElapsed += dt;
      // Auto-stop non-looping clips once they exceed their duration.
      if (!clip.loop && clip.duration != null && teacherAnim.clipElapsed > clip.duration) {
        teacherAnim.activeClip = null;
        teacherAnim.clipElapsed = 0;
        // Instant-zero smoothed channels so the lerp return takes over.
        Object.keys(gestureSmoothed).forEach(k => {
          if (k !== "spineX" && k !== "spineZ" && k !== "headX" && k !== "headZ")
            gestureSmoothed[k] = 0;
        });
      } else {
        const off = clip.update(teacherAnim.clipElapsed) || {};
        // Smooth toward the clip target values each frame.
        gestureSmoothed.lArmX = lerpToward(gestureSmoothed.lArmX, off.lArmX ?? 0, dt, sp);
        gestureSmoothed.lArmY = lerpToward(gestureSmoothed.lArmY, off.lArmY ?? 0, dt, sp);
        gestureSmoothed.lArmZ = lerpToward(gestureSmoothed.lArmZ, off.lArmZ ?? 0, dt, sp);
        gestureSmoothed.rArmX = lerpToward(gestureSmoothed.rArmX, off.rArmX ?? 0, dt, sp);
        gestureSmoothed.rArmY = lerpToward(gestureSmoothed.rArmY, off.rArmY ?? 0, dt, sp);
        gestureSmoothed.rArmZ = lerpToward(gestureSmoothed.rArmZ, off.rArmZ ?? 0, dt, sp);
        gestureSmoothed.lForeX = lerpToward(gestureSmoothed.lForeX, off.lForeX ?? 0, dt, sp);
        gestureSmoothed.rForeX = lerpToward(gestureSmoothed.rForeX, off.rForeX ?? 0, dt, sp);
        gestureSmoothed.lHandX = lerpToward(gestureSmoothed.lHandX, off.lHandX ?? 0, dt, sp);
        gestureSmoothed.rHandX = lerpToward(gestureSmoothed.rHandX, off.rHandX ?? 0, dt, sp);
        gestureSmoothed.lHandZ = lerpToward(gestureSmoothed.lHandZ, off.lHandZ ?? 0, dt, sp);
        gestureSmoothed.rHandZ = lerpToward(gestureSmoothed.rHandZ, off.rHandZ ?? 0, dt, sp);
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
      // No active clip — return all arm channels to zero (A-pose).
      // Exception: finger channels get tiny organic "idle life" so hands never
      // look frozen.  Each finger uses a different sine phase so they move
      // independently.  Amplitude is very small (~0.04 curl, ~0.06 open) so
      // the hand looks natural without being distracting.
      gestureSmoothed.lArmX       = lerpToward(gestureSmoothed.lArmX,       0, dt, sp);
      gestureSmoothed.lArmY       = lerpToward(gestureSmoothed.lArmY,       0, dt, sp);
      gestureSmoothed.lArmZ       = lerpToward(gestureSmoothed.lArmZ,       0, dt, sp);
      gestureSmoothed.rArmX       = lerpToward(gestureSmoothed.rArmX,       0, dt, sp);
      gestureSmoothed.rArmY       = lerpToward(gestureSmoothed.rArmY,       0, dt, sp);
      gestureSmoothed.rArmZ       = lerpToward(gestureSmoothed.rArmZ,       0, dt, sp);
      gestureSmoothed.lForeX      = lerpToward(gestureSmoothed.lForeX,      0, dt, sp);
      gestureSmoothed.rForeX      = lerpToward(gestureSmoothed.rForeX,      0, dt, sp);
      gestureSmoothed.lHandX      = lerpToward(gestureSmoothed.lHandX,      0, dt, sp);
      gestureSmoothed.rHandX      = lerpToward(gestureSmoothed.rHandX,      0, dt, sp);
      gestureSmoothed.lHandZ      = lerpToward(gestureSmoothed.lHandZ,      0, dt, sp);
      gestureSmoothed.rHandZ      = lerpToward(gestureSmoothed.rHandZ,      0, dt, sp);
      gestureSmoothed.mouthOpen    = lerpToward(gestureSmoothed.mouthOpen,    0, dt, sp * 1.5);
      gestureSmoothed.countHeadNod = lerpToward(gestureSmoothed.countHeadNod, 0, dt, sp);

      // ── Idle finger micro-motion ─────────────────────────────────────────
      // Very gentle per-finger oscillation with independent phases.
      // Each hand is slightly different to avoid a mechanical mirror look.
      // Adjust the base value (0.06) and amplitude (* 0.04) for more/less life.
      const it = t;   // t is teacherAnim.elapsed, already available in this scope
      const idleSp = sp * 0.35;   // slower lerp so the motion is smooth and lazy
      const idleCurl  = 0.06 + Math.sin(it * 0.75) * 0.03;
      gestureSmoothed.lFingerCurl  = lerpToward(gestureSmoothed.lFingerCurl,  idleCurl, dt, idleSp);
      gestureSmoothed.rFingerCurl  = lerpToward(gestureSmoothed.rFingerCurl,  idleCurl + Math.sin(it * 0.58) * 0.015, dt, idleSp);
      gestureSmoothed.lIndexOpen   = lerpToward(gestureSmoothed.lIndexOpen,   Math.max(0, 0.07 + Math.sin(it * 0.72 + 0.0) * 0.04), dt, idleSp);
      gestureSmoothed.rIndexOpen   = lerpToward(gestureSmoothed.rIndexOpen,   Math.max(0, 0.07 + Math.sin(it * 0.72 + 0.8) * 0.04), dt, idleSp);
      gestureSmoothed.lMiddleOpen  = lerpToward(gestureSmoothed.lMiddleOpen,  Math.max(0, 0.06 + Math.sin(it * 0.68 + 1.5) * 0.04), dt, idleSp);
      gestureSmoothed.rMiddleOpen  = lerpToward(gestureSmoothed.rMiddleOpen,  Math.max(0, 0.06 + Math.sin(it * 0.68 + 2.2) * 0.04), dt, idleSp);
      gestureSmoothed.lRingOpen    = lerpToward(gestureSmoothed.lRingOpen,    Math.max(0, 0.05 + Math.sin(it * 0.81 + 2.8) * 0.03), dt, idleSp);
      gestureSmoothed.rRingOpen    = lerpToward(gestureSmoothed.rRingOpen,    Math.max(0, 0.05 + Math.sin(it * 0.81 + 3.5) * 0.03), dt, idleSp);
      gestureSmoothed.lPinkyOpen   = lerpToward(gestureSmoothed.lPinkyOpen,   Math.max(0, 0.04 + Math.sin(it * 0.91 + 4.0) * 0.03), dt, idleSp);
      gestureSmoothed.rPinkyOpen   = lerpToward(gestureSmoothed.rPinkyOpen,   Math.max(0, 0.04 + Math.sin(it * 0.91 + 4.7) * 0.03), dt, idleSp);
    }
  }

  const spineBone = rigBones.spine || rigBones.spine1 || rigBones.chest;
  const headBone = rigBones.head || rigBones.neck;
  // --- ARM SAFETY (step 1/4): reset entire rig from captured baseRotation (no cumulative rotation). ---
  for (const bone of getTeacherAnimatedBones()) {
    const b = bone?.userData?.baseRotation;
    if (!bone || !b) continue;
    bone.rotation.order = b.order;
    bone.rotation.copy(b);
  }
  applyRotationFromBaseWithOffset(spineBone, gestureSmoothed.spineX, 0, gestureSmoothed.spineZ, cfg.maxSpineOffsetRad);
  applyRotationFromBaseWithOffset(headBone, gestureSmoothed.headX, 0, gestureSmoothed.headZ, cfg.maxHeadOffsetRad);
  // Apply clip-driven mouth-open morph (counting / emphasis).
  if (gestureSmoothed.mouthOpen > 0.01) {
    addTarget(groups.mouthOpen(), gestureSmoothed.mouthOpen);
  }
  // --- ARM SAFETY (step 2/4): ARM GESTURES DISABLED -> force neutral pose each frame. ---
  forceNeutralTeacherArmPoseEveryFrame();
  // --- ARM SAFETY (step 3/4): mandatory base±δ euler + world height + audible clamp on violations. ---
  const leftShClamp = applyMandatoryArmSafetyEulerClamp(rigBones.leftShoulder, "LeftShoulder", true);
  const rightShClamp = applyMandatoryArmSafetyEulerClamp(rigBones.rightShoulder, "RightShoulder", true);
  const leftClamp = applyMandatoryArmSafetyEulerClamp(rigBones.leftUpperArm, "LeftArm", true);
  const rightClamp = applyMandatoryArmSafetyEulerClamp(rigBones.rightUpperArm, "RightArm", true);
  const leftForeClamp = applyMandatoryArmSafetyEulerClamp(rigBones.leftForeArm, "LeftFore", true);
  const rightForeClamp = applyMandatoryArmSafetyEulerClamp(rigBones.rightForeArm, "RightFore", true);
  const leftHandClamp = applyMandatoryArmSafetyEulerClamp(rigBones.leftHand, "LeftHand", true);
  const rightHandClamp = applyMandatoryArmSafetyEulerClamp(rigBones.rightHand, "RightHand", true);

  // enforceHandBelowShoulderWorld and second-pass Euler clamps removed —
  // arms use poseArmsAtSide base; no extra overrides needed.

  if (teacherAnim.debugLogTimer <= 0) {
    teacherAnim.debugLogTimer = cfg.debugIntervalSec;
    const handLHigh = isHandAboveShoulder("L");
    const handRHigh = isHandAboveShoulder("R");
    console.log(
      `[rig] clip=${teacherAnim.activeClip ? teacherAnim.speechType : "none"} t=${teacherAnim.clipElapsed.toFixed(2)} | handAboveShoulder L=${handLHigh} R=${handRHigh}`,
      `bones: LS=${rigBones.leftShoulder?.name || "n/a"} RS=${rigBones.rightShoulder?.name || "n/a"} LA=${rigBones.leftUpperArm?.name || "n/a"} RA=${rigBones.rightUpperArm?.name || "n/a"} LF=${rigBones.leftForeArm?.name || "n/a"} RF=${rigBones.rightForeArm?.name || "n/a"} LH=${rigBones.leftHand?.name || "n/a"} RH=${rigBones.rightHand?.name || "n/a"}`,
      `shoulder_L=${leftShClamp.logs.length} shoulder_R=${rightShClamp.logs.length} right_logs=${rightClamp.logs.length} fore_L=${leftForeClamp.logs.length} fore_R=${rightForeClamp.logs.length} hand_L=${leftHandClamp.logs.length} hand_R=${rightHandClamp.logs.length}`,
    );
  }

  if (teacherAnim.blinkTimer > (teacherAnim.speaking ? 3.6 : 2.6)) {
    teacherAnim.blinkTimer = 0;
    blinkOnce();
  }
}

function listMorphNames() {
  const names = [];
  for (const mesh of morphMeshes) {
    for (const name of Object.keys(mesh.morphTargetDictionary)) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

function collectByRegex(regexList) {
  const out = [];
  for (const mesh of morphMeshes) {
    const dict = mesh.morphTargetDictionary || {};
    for (const [name, idx] of Object.entries(dict)) {
      if (regexList.some((rx) => rx.test(name))) {
        out.push({ mesh, name, idx });
      }
    }
  }
  return out;
}

function collectByNames(nameList) {
  const out = [];
  const wanted = new Set(nameList.map((n) => String(n).toLowerCase()));
  for (const mesh of morphMeshes) {
    const dict = mesh.morphTargetDictionary || {};
    for (const [name, idx] of Object.entries(dict)) {
      if (wanted.has(String(name).toLowerCase())) {
        out.push({ mesh, name, idx });
      }
    }
  }
  return out;
}

function getMorphGroupCached(name) {
  const key = String(name || "").toLowerCase();
  if (!key) return [];
  if (morphGroupCache.has(key)) {
    return morphGroupCache.get(key);
  }
  const group = collectByNames([name]);
  morphGroupCache.set(key, group);
  return group;
}

function mergeGroups(...groupsToMerge) {
  const merged = [];
  const seen = new Set();
  for (const g of groupsToMerge) {
    for (const item of g) {
      const key = `${item.mesh.uuid}:${item.idx}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }
  return merged;
}

function setMorphGroup(group, value) {
  for (const item of group) {
    item.mesh.morphTargetInfluences[item.idx] = clamp01(value);
  }
}

function addTarget(group, value) {
  for (const item of group) {
    const key = `${item.mesh.uuid}:${item.idx}`;
    smoothTargets.set(key, { mesh: item.mesh, idx: item.idx, value: clamp01(value) });
  }
}

function clearTargets() {
  smoothTargets.clear();
}

const groups = {
  mouthOpen: () => mergeGroups(
    collectByNames(["jawOpen"]),
    collectByRegex([/mouthopen/i, /jawopen/i]),
  ),
  mouthClose: () => collectByNames(["mouthClose", "sil"]),
  aa: () => collectByNames(["aa"]),
  ee: () => collectByNames(["E"]),
  oh: () => collectByNames(["oh"]),
  ou: () => collectByNames(["ou"]),
  smile: () => mergeGroups(
    collectByNames(["mouthSmileLeft", "mouthSmileRight"]),
    collectByRegex([/smile/i, /mouthsmile/i, /happy/i]),
  ),
  blink: () => mergeGroups(
    collectByNames(["eyeBlinkLeft", "eyeBlinkRight"]),
    collectByRegex([/blink/i, /eyeclose/i, /eyelid/i]),
  ),
  browUp: () => mergeGroups(
    collectByNames(["browInnerUp", "browOuterUpLeft", "browOuterUpRight"]),
    collectByRegex([/browup/i, /eyebrowup/i, /surprise/i]),
  ),
  browDown: () => mergeGroups(
    collectByNames(["browDownLeft", "browDownRight"]),
    collectByRegex([/browdown/i, /frown/i, /angry/i]),
  ),
  sad: () => mergeGroups(
    collectByNames(["mouthFrownLeft", "mouthFrownRight"]),
    collectByRegex([/sad/i, /mouthfrown/i]),
  ),
  pucker: () => collectByNames(["mouthPucker"]),
  press: () => collectByNames(["mouthPressLeft", "mouthPressRight", "PP"]),
  teeth: () => collectByNames(["FF", "TH", "DD", "CH", "SS", "RR", "kk", "nn", "ih"]),
};

function neutralFace() {
  clearTargets();
  for (const mesh of morphMeshes) {
    const infl = mesh.morphTargetInfluences || [];
    for (let i = 0; i < infl.length; i += 1) {
      infl[i] = infl[i] * 0.6;
    }
  }
}

function smileFace() {
  neutralFace();
  addTarget(groups.smile(), 0.9);
}

function blinkOnce() {
  const blinkGroup = groups.blink();
  setMorphGroup(blinkGroup, 1.0);
  setTimeout(() => setMorphGroup(blinkGroup, 0.0), 120);
}

function applyEmotionTargets(mode, intensity = 1) {
  const k = clamp01(intensity);
  if (mode === "happy") {
    addTarget(groups.smile(), 0.85 * k);
    addTarget(groups.browUp(), 0.28 * k);
    return;
  }
  if (mode === "sad") {
    // Sad should clearly read: mouth corners down + inner brow raise + slight eye squint.
    addTarget(groups.sad(), 0.9 * k);
    addTarget(collectByNames(["browInnerUp"]), 0.5 * k);
    addTarget(collectByNames(["browDownLeft", "browDownRight"]), 0.18 * k);
    addTarget(collectByNames(["eyeSquintLeft", "eyeSquintRight"]), 0.22 * k);
    return;
  }
  if (mode === "angry") {
    // Angry should clearly read: strong brow down + lip press + tiny frown.
    addTarget(groups.browDown(), 0.95 * k);
    addTarget(groups.press(), 0.55 * k);
    addTarget(groups.sad(), 0.28 * k);
    addTarget(collectByNames(["eyeSquintLeft", "eyeSquintRight"]), 0.32 * k);
    return;
  }
  if (mode === "surprised") {
    addTarget(groups.browUp(), 0.85 * k);
    addTarget(groups.mouthOpen(), 0.52 * k);
  }
}

function setEmotion(name) {
  selectedEmotion = name || "neutral";
  neutralFace();
  applyEmotionTargets(selectedEmotion, 1.0);
}

function applySmoothTargets(dt) {
  const attackAlpha = Math.min(1, dt * LIPSYNC_CONFIG.attackSpeed);
  const releaseAlpha = Math.min(1, dt * LIPSYNC_CONFIG.releaseSpeed);
  for (const target of smoothTargets.values()) {
    const current = target.mesh.morphTargetInfluences[target.idx] || 0;
    const alpha = target.value > current ? attackAlpha : releaseAlpha;
    target.mesh.morphTargetInfluences[target.idx] = THREE.MathUtils.lerp(current, target.value, alpha);
  }
}

function resetMouth() {
  const mouthGroup = groups.mouthOpen();
  for (const item of mouthGroup) {
    item.mesh.morphTargetInfluences[item.idx] *= 0.72;
  }
  // Keep mouth-close controls softened too, so speech transitions are smoother.
  for (const item of groups.mouthClose()) {
    item.mesh.morphTargetInfluences[item.idx] *= 0.72;
  }
}

function applyIdleMouthPose(dt) {
  const relaxToZero = collectByNames([
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthFrownLeft",
    "mouthFrownRight",
    "mouthDimpleLeft",
    "mouthDimpleRight",
    "mouthStretchLeft",
    "mouthStretchRight",
    "mouthUpperUpLeft",
    "mouthUpperUpRight",
    "mouthLowerDownLeft",
    "mouthLowerDownRight",
    "mouthLeft",
    "mouthRight",
    "mouthPucker",
    "mouthPressLeft",
    "mouthPressRight",
    "mouthRollLower",
    "mouthRollUpper",
    "mouthShrugLower",
    "mouthShrugUpper",
    "jawOpen",
    "aa",
    "E",
    "oh",
    "ou",
    "PP",
    "FF",
    "TH",
    "DD",
    "CH",
    "SS",
    "RR",
  ]);
  const gentleClose = collectByNames(["mouthClose", "sil"]);
  const alpha = Math.min(1, dt * 6);

  for (const item of relaxToZero) {
    const current = item.mesh.morphTargetInfluences[item.idx] || 0;
    item.mesh.morphTargetInfluences[item.idx] = THREE.MathUtils.lerp(current, 0, alpha);
  }
  for (const item of gentleClose) {
    const current = item.mesh.morphTargetInfluences[item.idx] || 0;
    item.mesh.morphTargetInfluences[item.idx] = THREE.MathUtils.lerp(current, 0.02, alpha);
  }
}

function clearLipFramePose() {
  const lipKeys = collectByNames([
    "jawOpen",
    "mouthClose",
    "sil",
    "aa",
    "E",
    "ih",
    "oh",
    "ou",
    "PP",
    "FF",
    "TH",
    "DD",
    "CH",
    "SS",
    "RR",
    "kk",
    "nn",
    "mouthPucker",
    "mouthPressLeft",
    "mouthPressRight",
  ]);
  for (const item of lipKeys) {
    item.mesh.morphTargetInfluences[item.idx] *= 0.35;
  }
}

function getActiveAudio() {
  if (audioEl && !audioEl.paused && !Number.isNaN(audioEl.currentTime)) return audioEl;
  if (audioDebugEl && !audioDebugEl.paused && !Number.isNaN(audioDebugEl.currentTime)) return audioDebugEl;
  return null;
}

/** 0–1 proxy for “how loud the mouth is” — couples body motion to real lip sync without touching viseme logic. */
function getMaxJawInfluenceForBody() {
  let max = 0;
  for (const mesh of morphMeshes) {
    const dict = mesh.morphTargetDictionary;
    const infl = mesh.morphTargetInfluences;
    if (!dict || !infl) continue;
    const idx =
      dict.jawOpen
      ?? dict.JawOpen
      ?? dict.jaw_open
      ?? dict.mouthOpen
      ?? dict.MouthOpen;
    if (typeof idx !== "number") continue;
    const v = infl[idx] || 0;
    if (v > max) max = v;
  }
  return max;
}

function applyPose(pose, scale = 1) {
  for (const [shapeKeyName, weight] of Object.entries(pose)) {
    let adjusted = weight;
    if (shapeKeyName.toLowerCase().includes("jaw")) {
      adjusted *= LIPSYNC_CONFIG.jawScale;
    }
    addTarget(getMorphGroupCached(shapeKeyName), adjusted * scale * LIPSYNC_CONFIG.visemeIntensity);
  }
}

const VISEME_POSES = {
  // Vowels: mouth opens clearly.
  A: { jawOpen: 0.62, aa: 0.86, mouthClose: 0.0 },
  // EE: lip stretch + slight smile.
  E: { jawOpen: 0.34, E: 0.8, mouthStretchLeft: 0.35, mouthStretchRight: 0.35, mouthSmileLeft: 0.18, mouthSmileRight: 0.18, mouthClose: 0.0 },
  I: { jawOpen: 0.24, E: 0.56, ih: 0.88, mouthStretchLeft: 0.42, mouthStretchRight: 0.42, mouthSmileLeft: 0.2, mouthSmileRight: 0.2, mouthClose: 0.0 },
  // OO/U: rounded lips.
  O: { jawOpen: 0.3, oh: 0.9, ou: 0.54, mouthPucker: 0.22, mouthFunnel: 0.45 },
  U: { jawOpen: 0.16, ou: 0.88, mouthPucker: 0.3, mouthFunnel: 0.5 },
  // M/B/P: firm lip closure.
  BMP: { mouthClose: 0.95, PP: 0.82, mouthPressLeft: 0.52, mouthPressRight: 0.52, jawOpen: 0.0 },
  FV: { FF: 0.9, mouthClose: 0.3 },
  SZ: { SS: 0.88, mouthClose: 0.22 },
  TD: { DD: 0.75, nn: 0.55, mouthClose: 0.18 },
  KG: { kk: 0.9, jawOpen: 0.25, mouthClose: 0.1 },
  L: { nn: 0.72, jawOpen: 0.22 },
  R: { RR: 0.85, ou: 0.2 },
  WQ: { ou: 0.72, mouthPucker: 0.28, mouthFunnel: 0.4, jawOpen: 0.14 },
  NEUTRAL: { mouthClose: 0.3, jawOpen: 0.05 },
  REST: { mouthClose: 0.55, jawOpen: 0.0, mouthPucker: 0.0 },
};

function getVisemePose(label) {
  const l = String(label || "NEUTRAL").toUpperCase();
  if (VISEME_POSES[l]) return VISEME_POSES[l];
  if (l === "SIL" || l === "SILENCE") return VISEME_POSES.REST;
  if (l === "AA" || l === "AH") return VISEME_POSES.A;
  if (l === "EE" || l === "IY") return VISEME_POSES.I;
  if (l === "OW" || l === "OO" || l === "UW") return VISEME_POSES.U;
  if (l === "M" || l === "B" || l === "P") return VISEME_POSES.BMP;
  if (l === "F" || l === "V") return VISEME_POSES.FV;
  return VISEME_POSES.NEUTRAL;
}

function resolveVisemeMorphTargets(visemeLabel) {
  const pose = getVisemePose(visemeLabel);
  const keys = Object.keys(pose);
  const resolved = [];
  for (const key of keys) {
    const g = getMorphGroupCached(key);
    if (g && g.length) resolved.push(key);
  }
  return resolved;
}

function tunePoseForAvatar(visemeLabel, pose) {
  const tuned = { ...pose };
  const label = String(visemeLabel || "").toUpperCase();
  if (label === "E" || label === "I" || label === "EE" || label === "IY") {
    if (getMorphGroupCached("mouthStretchLeft").length || getMorphGroupCached("mouthStretchRight").length) {
      tuned.mouthStretchLeft = clamp01((tuned.mouthStretchLeft || 0.22) * VISEME_TUNING.eeStretchBoost);
      tuned.mouthStretchRight = clamp01((tuned.mouthStretchRight || 0.22) * VISEME_TUNING.eeStretchBoost);
    }
  }
  if (label === "O" || label === "U" || label === "OO" || label === "UW" || label === "OW" || label === "WQ") {
    if (getMorphGroupCached("mouthPucker").length || getMorphGroupCached("mouthFunnel").length) {
      tuned.mouthPucker = clamp01((tuned.mouthPucker || 0.2) * VISEME_TUNING.ooRoundBoost);
      tuned.mouthFunnel = clamp01((tuned.mouthFunnel || 0.2) * VISEME_TUNING.ooRoundBoost);
    }
  }
  if (label === "BMP" || label === "M" || label === "B" || label === "P") {
    tuned.mouthClose = clamp01((tuned.mouthClose || 0.75) * VISEME_TUNING.bmpClosureBoost);
    if (getMorphGroupCached("PP").length) {
      tuned.PP = clamp01((tuned.PP || 0.7) * VISEME_TUNING.bmpClosureBoost);
    }
  }
  return tuned;
}

function playVisemeAtTime(tMs) {
  if (!visemeTimeline.length) return;
  // Replay / seek safety: if audio time goes backwards, restart viseme scan.
  if (tMs < lastAudioTimeMs) {
    visemeIndex = 0;
  }
  lastAudioTimeMs = tMs;
  while (visemeIndex + 1 < visemeTimeline.length && visemeTimeline[visemeIndex + 1].time_ms <= tMs) {
    visemeIndex += 1;
  }
  const current = visemeTimeline[visemeIndex];
  if (!current) return;
  const currentLabel = String(current.viseme || "NEUTRAL").toUpperCase();
  const currentPose = tunePoseForAvatar(currentLabel, getVisemePose(currentLabel));

  const start = Number(current.time_ms || 0);
  const duration = Math.max(30, Number(current.duration_ms || 85));
  const progress = clamp01((tMs - start) / duration);

  // Co-articulation: blend into next viseme near the end of current one.
  const next = visemeTimeline[visemeIndex + 1];
  const nextLabel = next ? String(next.viseme || "NEUTRAL").toUpperCase() : "REST";
  const nextPose = tunePoseForAvatar(nextLabel, getVisemePose(nextLabel));
  const blendToNext = clamp01((progress - 0.28) / 0.72);

  const timeBucket = Math.floor(tMs / 180);
  if (currentLabel !== lastVisemeDebugLabel || timeBucket !== lastVisemeDebugTimeBucket) {
    const mapped = resolveVisemeMorphTargets(currentLabel);
    console.log(
      "[lipsync] viseme:",
      currentLabel,
      "audio_ms:",
      Math.round(tMs),
      "mapped_morphs:",
      mapped.join(", ") || "(none)",
      "fallback_jaw_only:",
      fallbackJawOnlyMode,
    );
    lastVisemeDebugLabel = currentLabel;
    lastVisemeDebugTimeBucket = timeBucket;
  }

  applyPose(currentPose, 1 - blendToNext);
  applyPose(nextPose, blendToNext * 0.75);
}

function resetFaceToNeutral() {
  clearTargets();
  visemeIndex = 0;
  lastAudioTimeMs = 0;
  applyIdleMouthPose(1 / 60);
}

function stopSpeechPlayback(reason = "Stopped.") {
  if (queuedNextSentenceTimer) {
    window.clearTimeout(queuedNextSentenceTimer);
    queuedNextSentenceTimer = null;
  }
  speechIsActive = false;
  audioPlaying = false;
  talkMode = false;
  isPaused = false;
  visemeIndex = 0;
  lastAudioTimeMs = 0;

  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
  if (audioDebugEl) {
    audioDebugEl.pause();
    audioDebugEl.currentTime = 0;
  }
  onSpeechAnimationEnded();
  resetFaceToNeutral();
  setStatus(reason);
}

async function startSpeechPlayback(audioUrl, visemes, onEnded) {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.preload = "auto";
    audioEl.volume = 1.0;
    audioEl.muted = false;
  }

  visemeTimeline = Array.isArray(visemes) ? visemes : [];
  visemeIndex = 0;
  lastAudioTimeMs = 0;
  lastVisemeDebugLabel = "";
  lastVisemeDebugTimeBucket = -1;
  speechIsActive = false;
  audioPlaying = false;
  talkMode = false;
  isPaused = false;
  const detailedLipShapes = ["aa", "E", "ih", "oh", "ou", "PP", "FF", "SS", "DD", "kk", "nn", "RR", "mouthPucker", "mouthFunnel"];
  const detailedAvailable = detailedLipShapes.some((name) => getMorphGroupCached(name).length > 0);
  const jawAvailable = getMorphGroupCached("jawOpen").length > 0;
  fallbackJawOnlyMode = Boolean(jawAvailable && !detailedAvailable);
  console.log("[lipsync] timeline_count:", visemeTimeline.length, "fallback_jaw_only:", fallbackJawOnlyMode);

  audioEl.onplay = null;
  audioEl.onplaying = () => {
    // Lip sync starts only when browser confirms real playback has started.
    speechIsActive = true;
    audioPlaying = true;
    talkMode = true;
    if (teacherAnim.armMotionScale < 0.12) {
      teacherAnim.armMotionScale = THREE.MathUtils.randFloat(0.55, 0.98);
    }
    console.log("[audio] start", audioUrl);
    setStatus("Playing audio + lip sync.");
  };
  audioEl.onpause = () => {
    if (!audioEl.ended) {
      speechIsActive = false;
      audioPlaying = false;
      talkMode = false;
      onSpeechAnimationEnded();
      resetFaceToNeutral();
    }
  };
  audioEl.onended = async () => {
    speechIsActive = false;
    audioPlaying = false;
    talkMode = false;
    onSpeechAnimationEnded();
    console.log("[audio] end");
    resetFaceToNeutral();
    if (typeof onEnded === "function") {
      await onEnded();
    } else {
      setStatus("Audio finished.");
    }
  };
  audioEl.onerror = () => {
    speechIsActive = false;
    audioPlaying = false;
    talkMode = false;
    onSpeechAnimationEnded();
    console.log("[audio] error", audioEl.error);
    resetFaceToNeutral();
    setStatus("Audio error: browser could not decode/play audio URL.");
  };

  audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.src = audioUrl;
  audioDebugEl.src = audioUrl;

  try {
    await audioEl.play();
  } catch (_err) {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);
    const audioBlob = await audioRes.blob();
    const blobUrl = URL.createObjectURL(audioBlob);
    audioEl.src = blobUrl;
    audioDebugEl.src = blobUrl;
    await audioEl.play();
  }
}

function updateLipSyncFromAudio() {
  if (!speechIsActive) return;
  const activeAudio = getActiveAudio();
  if (!activeAudio) return;
  const tMs = (activeAudio.currentTime * 1000) + LIPSYNC_OFFSET_MS;
  playVisemeAtTime(Math.max(0, tMs));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForAudioDrain(maxWaitMs = 4000) {
  const startedAt = performance.now();
  while ((performance.now() - startedAt) < maxWaitMs) {
    const activeAudio = getActiveAudio();
    if (!speechIsActive && (!activeAudio || activeAudio.ended || activeAudio.paused)) {
      return;
    }
    await wait(40);
  }
}

function toShortSpokenText(text) {
  const clean = sanitizeSpeechText(text);
  return clean;
}

function splitSpeechIntoChunks(text, maxSentencesPerChunk = 2) {
  const sentences = splitSentences(text)
    .map((s) => sanitizeSpeechText(s))
    .filter(Boolean);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += maxSentencesPerChunk) {
    const piece = sentences.slice(i, i + maxSentencesPerChunk).join(" ");
    if (piece) chunks.push(piece);
  }
  return chunks;
}

function normalizeSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceSimilarity(a, b) {
  const ta = new Set(normalizeSentence(a).split(" ").filter((x) => x.length > 2));
  const tb = new Set(normalizeSentence(b).split(" ").filter((x) => x.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / Math.max(ta.size, tb.size);
}

function isDuplicateSentence(text, history) {
  const n = normalizeSentence(text);
  if (!n) return true;
  const last = normalizeSentence(lastSpokenSentence);
  if (last && n === last) return true;
  if (last && sentenceSimilarity(n, last) >= 0.86) return true;
  const recent = history.slice(-8);
  for (const h of recent) {
    const hn = normalizeSentence(h);
    if (!hn) continue;
    if (n === hn) return true;
    if (sentenceSimilarity(n, hn) >= 0.9) return true;
  }
  return false;
}

function shouldSpeak(text) {
  const n = normalizeSentence(text);
  if (!n) return false;
  return !isDuplicateSentence(text, spokenHistory);
}

function recordSpokenSentence(text) {
  lastSpokenSentence = String(text || "");
  spokenHistory.push(lastSpokenSentence);
  if (spokenHistory.length > MAX_SPOKEN_HISTORY) {
    spokenHistory = spokenHistory.slice(-MAX_SPOKEN_HISTORY);
  }
}

async function speakStep(text, style = {}, debugMeta = {}) {
  const base = apiUrlEl.value.trim().replace(/\/+$/, "");
  const studentId = studentIdEl.value.trim() || "kid1";
  const spoken = toShortSpokenText(text);
  const stepIndex = typeof debugMeta.stepIndex === "number" ? debugMeta.stepIndex : -1;
  const chunkIndex = typeof debugMeta.chunkIndex === "number" ? debugMeta.chunkIndex : -1;
  console.log("[lesson] step", stepIndex, "candidate:", spoken);
  if (chunkIndex >= 0) {
    console.log("[lesson] chunk", chunkIndex, "preview:", spoken.slice(0, 80));
  }
  if (!spoken) {
    console.log("[lesson] step", stepIndex, "skipped: empty");
    return false;
  }
  const speechChunks = splitSpeechIntoChunks(spoken, 2);
  if (!speechChunks.length) {
    console.log("[lesson] step", stepIndex, "skipped: no chunks");
    return false;
  }
  console.log("[lesson] step", stepIndex, "chunk_count:", speechChunks.length);

  const mergedStyle = {
    emotion: style.emotion || "neutral",
    speed: style.speed || 0.94,
    pauseMs: style.pauseMs || 180,
  };
  currentTeachingStyle = mergedStyle;

  let spokeAnyChunk = false;
  const forceSpeak = Boolean(debugMeta.forceSpeak);
  const mustBeLessonFaithful = Boolean(debugMeta.mustBeLessonFaithful);
  for (let i = 0; i < speechChunks.length; i += 1) {
    const chunk = speechChunks[i];
    const sentenceType = detectSentenceTypeForAnimation(chunk);
    triggerTeacherGesture(sentenceType, chunk);
    if (sentenceType === "emphasis") {
      await wait(90);
    }
    console.log("[lesson] pre-tts exact chunk:", chunk);
    if (mustBeLessonFaithful) {
      const faithful = isLessonFaithfulChunk(chunk);
      console.log("[lesson] chunk faithful check:", faithful);
      if (!faithful) {
        console.log("[lesson] chunk rejected before TTS: not lesson-faithful");
        continue;
      }
    }
    if (!forceSpeak && !shouldSpeak(chunk)) {
      console.log("[lesson] step", stepIndex, "chunk", i, "skipped: duplicate/similar");
      continue;
    }
    console.log("[lesson] step", stepIndex, "tts chunk", i, "text:", chunk);
    const data = await generateSpeechData(base, studentId, chunk, mergedStyle.speed);
    await new Promise((resolve, reject) => {
      startSpeechPlayback(data.audioUrl, data.visemes, resolve).catch(reject);
    });
    recordSpokenSentence(chunk);
    spokeAnyChunk = true;
    if (i < speechChunks.length - 1) {
      await wait(120);
    }
  }
  if (!spokeAnyChunk) {
    return false;
  }
  console.log("[lesson] step", stepIndex, "spoken");

  await wait(mergedStyle.pauseMs);
  return true;
}

function simulateStudentResponse() {
  const roll = Math.random();
  if (roll < 0.58) return { type: "correct", text: "I think it is correct." };
  if (roll < 0.86) return { type: "incorrect", text: "I am not sure." };
  return { type: "none", text: "" };
}

async function waitForStudentResponse() {
  await wait(700);
  return simulateStudentResponse();
}

class LessonController {
  constructor() {
    this.running = false;
    this.paused = false;
    this.lessonRunning = false;
    this.mode = "reading";
    this.steps = [];
    this.lessonSteps = [];
    this.currentStepIndex = 0;
    this.completedStepCount = 0;
    this.failedStepCount = 0;
    this.originalStepCount = 0;
    this.acceptedSteps = 0;
    this.rejectedSteps = 0;
    this.fixedSteps = 0;
    this.directReadMode = true;
    this.completedChunkCount = 0;
    this.totalOriginalChunks = 0;
    this.totalFinalChunks = 0;
    this.unfinishedChunkCount = 0;
    this.sourceWordSet = new Set();
    this.validationLog = [];
    this.MAX_WORDS_PER_SECTION = 3;
    this.completedStepIndices = new Set();
    this.lessonContext = null;
    this.cachedRawTextKey = "";
    this.cachedAnalysis = null;
  }

  invalidateCachedAnalysis() {
    this.cachedRawTextKey = "";
    this.cachedAnalysis = null;
  }

  stop() {
    this.running = false;
    this.lessonRunning = false;
    this.paused = false;
    this.completedStepIndices.clear();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  async waitIfPaused() {
    while (this.running && this.paused) {
      await wait(120);
    }
  }

  detectLessonType(text) {
    const t = String(text || "").toLowerCase();
    const vocabHeading = /\bvocabulary\b|word list|new words|keywords|glossary/.test(t);
    const readingHeading = /\breading\b|passage|story|dialogue|comprehension|main idea/.test(t);
    const likelyWordList = /(?:^|\n)\s*[a-z]{3,}\s*[-:]\s*[a-z]/i.test(t) || /,\s*[a-z]{4,}\s*,\s*[a-z]{4,}/i.test(t);

    // Strong headings should dominate mode selection.
    if (vocabHeading && likelyWordList) return "vocabulary";
    if (readingHeading) return "reading";

    // Grammar mode only when there are clear grammar-rule indicators.
    const grammarHits = [
      /\bgrammar\b/,
      /\btense\b/,
      /\bsubject[- ]verb\b/,
      /\bpast simple\b|\bpresent simple\b/,
      /\bcomplete the sentence\b/,
      /\bchoose the correct\b/,
      /\bfill in the blank\b/,
    ].reduce((acc, rx) => acc + (rx.test(t) ? 1 : 0), 0);
    if (grammarHits >= 2) return "grammar";

    if (vocabHeading && !readingHeading) return "vocabulary";
    return "reading";
  }

  splitTextIntoChunks(text) {
    // Preserve all textbox content; chunk intentionally without truncating.
    const paragraphs = String(text || "")
      .split(/\r?\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const out = [];
    let current = "";
    let currentWords = 0;
    const flushCurrent = () => {
      const clean = sanitizeSpeechText(current);
      if (clean) out.push(clean);
      current = "";
      currentWords = 0;
    };

    for (const paragraph of paragraphs.length ? paragraphs : [String(text || "")]) {
      const sentences = splitSentences(paragraph).map((s) => sanitizeSpeechText(s)).filter(Boolean);
      for (const s of sentences) {
        const words = s.split(/\s+/).filter(Boolean);
        if (!words.length) continue;

        if (words.length > LESSON_CHUNK_CONFIG.hardMaxWords) {
          if (currentWords >= LESSON_CHUNK_CONFIG.targetMinWords) {
            flushCurrent();
          }
          let i = 0;
          while (i < words.length) {
            out.push(words.slice(i, i + LESSON_CHUNK_CONFIG.targetMaxWords).join(" "));
            i += LESSON_CHUNK_CONFIG.targetMaxWords;
          }
          continue;
        }

        if (!current) {
          current = s;
          currentWords = words.length;
          continue;
        }

        if ((currentWords + words.length) <= LESSON_CHUNK_CONFIG.targetMaxWords) {
          current = `${current} ${s}`;
          currentWords += words.length;
        } else {
          flushCurrent();
          current = s;
          currentWords = words.length;
        }
      }
    }
    flushCurrent();
    return out;
  }

  simplifyTextChunk(chunk) {
    const c = sanitizeSpeechText(chunk);
    const parts = c.split(/,|;| and /i).map((x) => x.trim()).filter(Boolean);
    const base = parts[0] || c;
    const words = base.split(/\s+/).slice(0, 12).join(" ");
    return toShortSpokenText(words);
  }

  _buildSourceWordSet(text) {
    const words = String(text || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);
    this.sourceWordSet = new Set(words);
  }

  _extractTargetWords(text, max = 5) {
    const skip = new Set([
      "the", "and", "for", "with", "this", "that", "from", "they", "them", "have", "has",
      "was", "were", "are", "you", "your", "today", "lesson", "english", "student", "teacher",
      "good", "great", "small", "book", "story", "read", "look", "think", "what", "when",
    ]);
    const counts = new Map();
    for (const w of this.sourceWordSet) {
      if (w.length < 5 || skip.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    const ranked = [...counts.keys()].sort((a, b) => b.length - a.length);
    return ranked.slice(0, max);
  }

  _extractVocabularyItems(rawText) {
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((l) => sanitizeSpeechText(l))
      .filter(Boolean);
    const items = [];
    const seen = new Set();
    for (const line of lines) {
      const pair = line.match(/^([A-Za-z][A-Za-z'-]{2,})\s*[:\-]\s*(.+)$/);
      if (!pair) continue;
      const word = pair[1].toLowerCase();
      if (seen.has(word)) continue;
      seen.add(word);
      const sentence = sanitizeSpeechText(pair[2]);
      items.push({ word, sentence });
    }
    return items;
  }

  _extractGrammarFocus(text) {
    const low = String(text || "").toLowerCase();
    if (/past tense|\b\w+ed\b/.test(low)) return "past tense";
    if (/present simple|present tense/.test(low)) return "present tense";
    if (/subject verb/.test(low)) return "subject-verb agreement";
    if (/preposition/.test(low)) return "prepositions";
    if (/pronoun/.test(low)) return "pronouns";
    if (/article\b/.test(low)) return "articles";
    return "one grammar rule";
  }

  buildLessonContext(rawBookText) {
    const rawText = String(rawBookText || "");
    const lessonType = this.detectLessonType(rawText);
    const lessonSentences = this.splitTextIntoChunks(rawText).map((s) => this.simplifyTextChunk(s));
    this._buildSourceWordSet(rawText);
    const lessonKeywords = this._extractTargetWords(rawText, this.MAX_WORDS_PER_SECTION);
    const grammarPoints = [];
    const gf = this._extractGrammarFocus(rawText);
    if (gf && gf !== "one grammar rule") grammarPoints.push(gf);

    const textbookExercises = splitSentences(rawText)
      .filter((s) => /(choose|complete|fill|match|write|answer|circle|true or false|correct)/i.test(s))
      .map((s) => this.simplifyTextChunk(s))
      .slice(0, 5);

    const readingQuestions = splitSentences(rawText)
      .filter((s) => /\?/.test(s))
      .map((s) => this.simplifyTextChunk(s))
      .slice(0, 5);

    const allowedTeacherActions = ["speak_book_line_only"];

    const sectionOrder = [
      "big_question",
      "discussion",
      "vocabulary",
      "vocabulary_sentences",
      "exercises",
      "authors_purpose",
      "story",
    ];

    const sections = {
      big_question: [],
      discussion: [],
      vocabulary: [],
      vocabulary_sentences: [],
      exercises: [],
      authors_purpose: [],
      story: [],
      other: [],
    };

    const lines = rawText
      .split(/\r?\n/)
      .flatMap((l) => splitSentences(l).map((s) => sanitizeSpeechText(s)))
      .filter((l) => l && !isForbiddenTeacherPhrase(l));

    let activeSection = "other";
    for (const line of lines) {
      const low = line.toLowerCase();
      if (/big question/.test(low)) activeSection = "big_question";
      else if (/(watch|look at the picture|discussion|think|answer)/.test(low)) activeSection = "discussion";
      else if (/vocabulary|word list|new words|keywords|glossary/.test(low)) activeSection = "vocabulary";
      else if (/(match|circle|choose|complete|fill|exercise|true or false|correct answer)/.test(low)) activeSection = "exercises";
      else if (/author.?s purpose|inform|persuade|entertain/.test(low)) activeSection = "authors_purpose";
      else if (/(story|the earthworm and the spider|reading)/.test(low)) activeSection = "story";

      const looksLikeVocabSentence =
        activeSection === "vocabulary" && /[:\-]/.test(line) && /\b[a-z]{3,}\b/i.test(line);
      if (looksLikeVocabSentence) {
        sections.vocabulary.push(line);
        continue;
      }
      if (activeSection === "vocabulary" && /[.?!]/.test(line) && !/vocabulary|word list/i.test(line)) {
        sections.vocabulary_sentences.push(line);
        continue;
      }
      sections[activeSection].push(line);
    }

    const allBookLines = sectionOrder
      .flatMap((name) => sections[name] || [])
      .concat(sections.other || []);
    const vocabItems = this._extractVocabularyItems(rawText);

    return {
      rawText,
      lessonType,
      lessonSentences,
      lessonKeywords,
      grammarPoints,
      readingQuestions,
      textbookExercises,
      allowedTeacherActions,
      sections,
      sectionOrder,
      allBookLines,
      vocabItems,
      lessonTitle: this.simplifyTextChunk(
        (rawText.match(/(?:unit\s*title|lesson\s*title|title)\s*[:\-]\s*([^\n\r]+)/i) || [])[1] || lessonSentences[0] || "Lesson",
      ),
      readingMainIdea: lessonSentences[0] || "Main idea from the lesson.",
    };
  }

  generateTeacherLineFromContext(step, lessonContext) {
    const text = sanitizeSpeechText(step.sourceText || step.text || "");
    return { text, source: step.source || step.section || "book_line" };
  }

  validateFromBook(line, bookContent) {
    const candidate = normalizeSentence(line || "");
    if (!candidate) return false;
    const bookLines = Array.isArray(bookContent) ? bookContent : [];
    for (const source of bookLines) {
      const src = normalizeSentence(source || "");
      if (!src) continue;
      if (candidate === src) return true;
      const sim = sentenceSimilarity(candidate, src);
      if (sim >= 0.92) return true;
      // Allow short simplification only when candidate remains close to source wording.
      const srcWords = src.split(" ").filter(Boolean);
      const candWords = candidate.split(" ").filter(Boolean);
      if (candWords.length >= 4 && candWords.length <= srcWords.length) {
        const overlap = candWords.filter((w) => srcWords.includes(w)).length;
        const overlapRatio = overlap / Math.max(1, candWords.length);
        const lengthRatio = candWords.length / Math.max(1, srcWords.length);
        if (overlapRatio >= 0.8 && lengthRatio >= 0.45 && sim >= 0.62) return true;
      }
    }
    return false;
  }

  validateTeacherLine(line, lessonContext) {
    const text = toShortSpokenText(line || "");
    if (!text) return { ok: false, reason: "empty" };
    if (text.split(/\s+/).length > 20) return { ok: false, reason: "too_many_words" };
    if (splitSentences(text).length > 2) return { ok: false, reason: "too_many_sentences" };

    if (isForbiddenTeacherPhrase(text)) {
      return { ok: false, reason: "forbidden_generic_phrase" };
    }
    const fromBook = this.validateFromBook(text, lessonContext.allBookLines || []);
    if (!fromBook) return { ok: false, reason: "not_in_book" };
    return { ok: true, reason: "ok" };
  }

  validateTeacherStep(stepText, stepType, lessonContext) {
    const text = sanitizeSpeechText(stepText || "");
    if (!text) return { ok: false, reason: "empty_step" };
    if (isForbiddenTeacherPhrase(text)) return { ok: false, reason: "forbidden_phrase" };
    const sentences = splitSentences(text);
    if (sentences.length > 3) return { ok: false, reason: "too_many_sentences_in_step" };

    const vocabWords = (lessonContext.vocabItems || []).map((v) => String(v.word || "").toLowerCase());
    const lower = text.toLowerCase();
    const vocabHits = vocabWords.filter((w) => w && new RegExp(`\\b${w}\\b`, "i").test(lower));
    if (stepType === "vocabulary" && vocabHits.length > 1) {
      return { ok: false, reason: "multiple_vocab_words_in_one_step" };
    }

    const hasBigQuestionCue = /\bbig question\b|\bbridge\b|\btunnel\b/.test(lower);
    const hasVocabCue = /\bvocabulary\b|\bword\b/.test(lower) || vocabHits.length > 0;
    const hasAuthorCue = /author.?s purpose|inform|persuade|entertain/.test(lower);
    const activeSections = [hasBigQuestionCue, hasVocabCue, hasAuthorCue].filter(Boolean).length;
    if (activeSections > 1 && stepType !== "discussion") {
      return { ok: false, reason: "mixed_sections" };
    }
    return { ok: true, reason: "ok" };
  }

  analyzeLessonContent(bookText) {
    const raw = String(bookText || "");
    if (this.cachedRawTextKey === raw && this.cachedAnalysis) {
      return this.cachedAnalysis;
    }
    this.lessonContext = this.buildLessonContext(raw);
    const lower = raw.toLowerCase();
    const lessonType = this.detectLessonType(raw);
    const chunks = this.splitTextIntoChunks(raw);
    this._buildSourceWordSet(raw);
    const keyWords = this._extractTargetWords(raw, 5);
    const difficultWords = keyWords.filter((w) => w.length >= 8).slice(0, 5);
    // Hard budget to prevent dictionary-style teaching.
    const targetWords = keyWords.slice(0, this.MAX_WORDS_PER_SECTION);
    const grammarFocus = this._extractGrammarFocus(raw);
    const readingMainIdea = this.simplifyTextChunk(chunks[0] || "This text is about one main idea.");

    // Extract explicit lesson title from book text when available.
    const titleMatch =
      raw.match(/(?:unit\s*title|lesson\s*title|title)\s*[:\-]\s*([^\n\r]+)/i)
      || raw.match(/^\s*(unit\s*\d+[^.\n\r]{0,80})/im);
    const extractedTitle = titleMatch ? sanitizeSpeechText(titleMatch[1]) : "";

    const objective = lessonType === "vocabulary"
      ? "learn key words and use them in short sentences"
      : lessonType === "grammar"
        ? `understand and practice ${grammarFocus}`
        : "understand the main idea and answer simple questions";

    const topic = lessonType === "reading"
      ? toShortSpokenText((extractedTitle || chunks[0] || "This reading topic").replace(/[.!?]+$/g, ""))
      : lessonType === "grammar"
        ? (extractedTitle || `Grammar: ${grammarFocus}`)
        : (extractedTitle || "Key vocabulary words");

    const questions = lessonType === "reading"
      ? ["Who is this part about?", "What happened first?", "What is the main idea?"]
      : lessonType === "grammar"
        ? ["Which sentence is correct?", "Can you try one more?"]
        : ["Can you use this word in a sentence?", "Which meaning is correct?"];

    const result = {
      lessonType,
      topic,
      objective,
      keyWords: keyWords.slice(0, 5),
      difficultWords: difficultWords.slice(0, 5),
      targetWords,
      grammarFocus,
      readingMainIdea,
      lessonTitle: extractedTitle || topic,
      questions,
      chunks,
      sourceText: raw,
      teachingSteps: [],
    };
    updateStrictCheck([
      "Analysis complete",
      `Type: ${result.lessonType}`,
      `Topic: ${result.topic}`,
      `Objective: ${result.objective}`,
      `Target words: ${(result.targetWords || []).join(", ") || "(none)"}`,
      `Difficult words: ${(result.difficultWords || []).join(", ") || "(none)"}`,
      `Chunks selected: ${result.chunks.length}`,
    ]);
    console.log("[lesson] textbox total length:", raw.length);
    console.log("[lesson] textbox first200:", raw.slice(0, 200));
    console.log("[lesson] textbox last200:", raw.slice(Math.max(0, raw.length - 200)));
    console.log("[lesson] total chunks:", result.chunks.length);
    this.cachedRawTextKey = raw;
    this.cachedAnalysis = result;
    return result;
  }

  buildTeachingPlan(analysis) {
    const a = analysis;
    const ctx = this.lessonContext || {};
    const plan = {
      lessonType: a.lessonType,
      topic: a.topic,
      objective: a.objective,
      teachingSteps: [],
    };

    const sections = ctx.sections || {};
    const buildStep = (sectionName, sourceText) => ({
      type: "book_line",
      section: sectionName,
      source: sectionName,
      sourceText,
      text: sourceText,
      chunkIndex: -1,
      emotion: "neutral",
      speed: 0.93,
      ask: /\?$/.test(sourceText),
    });

    // 1) Big question
    const bigQ = (sections.big_question || []).filter(Boolean);
    if (bigQ.length) {
      plan.teachingSteps.push(buildStep("big_question", bigQ[0]));
    }

    // 2) One or two discussion questions
    const discussion = (sections.discussion || []).filter(Boolean).slice(0, 2);
    for (const line of discussion) {
      plan.teachingSteps.push(buildStep("discussion", line));
    }

    // 3) Vocabulary one word at a time (1-3 short sentences)
    const vocabItems = Array.isArray(ctx.vocabItems) ? ctx.vocabItems : [];
    for (const item of vocabItems) {
      const wordTitle = `${item.word}.`;
      const sentence = sanitizeSpeechText(item.sentence || "");
      const support = (sections.vocabulary_sentences || []).find((s) => new RegExp(`\\b${item.word}\\b`, "i").test(s)) || "";
      const parts = [wordTitle, sentence, sanitizeSpeechText(support)].filter(Boolean);
      const sourceText = parts.slice(0, 3).join(" ");
      plan.teachingSteps.push(buildStep("vocabulary", sourceText));
    }

    // 4) Author's purpose comes later and separate.
    const authorsPurpose = (sections.authors_purpose || []).filter(Boolean).slice(0, 2);
    for (const line of authorsPurpose) {
      plan.teachingSteps.push(buildStep("authors_purpose", line));
    }

    if (!plan.teachingSteps.length) {
      for (const line of ctx.allBookLines || []) {
        const sourceText = sanitizeSpeechText(line);
        if (!sourceText) continue;
        plan.teachingSteps.push({
          type: "book_line",
          section: "other",
          source: "other",
          sourceText,
          text: sourceText,
          chunkIndex: -1,
          emotion: "neutral",
          speed: 0.93,
          ask: /\?$/.test(sourceText),
        });
      }
    }

    console.log("[lesson] strict step flow count:", plan.teachingSteps.length);
    for (let i = 0; i < Math.min(12, plan.teachingSteps.length); i += 1) {
      const s = plan.teachingSteps[i];
      console.log("[lesson] flow step", i, "section:", s.section, "source:", s.source, "line:", s.sourceText);
    }
    return plan;
  }

  isSentenceGrounded(text) {
    const tokens = String(text || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (!tokens.length) return true;
    const overlap = tokens.filter((t) => this.sourceWordSet.has(t)).length;
    // allow scaffolding lines, but ensure most teaching lines stay tied to source text vocabulary
    return overlap >= 1 || /(lesson|word|grammar|reading|main idea|question|summary)/i.test(text);
  }

  validateStep(step) {
    const txt = toShortSpokenText(step.text || "");
    if (!txt) {
      this.validationLog.push({ status: "rejected", reason: "empty", text: step.text || "" });
      return { ok: false, reason: "empty", step: null };
    }
    if (splitSentences(txt).length > 3) {
      this.validationLog.push({ status: "rejected", reason: "too_many_sentences", text: txt });
      return { ok: false, reason: "too_many_sentences", step: null };
    }
    if (txt.split(/\s+/).length > 40) {
      this.validationLog.push({ status: "rejected", reason: "too_many_words", text: txt });
      return { ok: false, reason: "too_many_words", step: null };
    }
    this.validationLog.push({ status: "accepted", reason: "ok", text: txt });
    return { ok: true, reason: "ok", step: { ...step, text: txt } };
  }

  buildOriginalChunksFromTextbox(rawText) {
    const cleanedSource = cleanLessonText(rawText);
    const text = sanitizeDirectReadText(cleanedSource);
    const paragraphs = text
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks = [];
    let chunkId = 0;
    for (const paragraph of paragraphs.length ? paragraphs : [text]) {
      const sentences = splitSentences(paragraph).map((s) => sanitizeDirectReadText(s)).filter(Boolean);
      if (!sentences.length) continue;
      let current = "";
      let currentWordCount = 0;
      for (const sentence of sentences) {
        const wc = sentence.split(/\s+/).filter(Boolean).length;
        if (!current) {
          current = sentence;
          currentWordCount = wc;
          continue;
        }
        // Keep chunks short for TTS: max 2-3 short sentences or ~30 words.
        if (splitSentences(current).length < 3 && (currentWordCount + wc) <= 30) {
          current = `${current} ${sentence}`;
          currentWordCount += wc;
        } else {
          chunks.push({
            id: `orig-${chunkId}`,
            text: current,
            fromTextbox: true,
            splitFrom: null,
          });
          chunkId += 1;
          current = sentence;
          currentWordCount = wc;
        }
      }
      if (current) {
        chunks.push({
          id: `orig-${chunkId}`,
          text: current,
          fromTextbox: true,
          splitFrom: null,
        });
        chunkId += 1;
      }
    }
    return chunks;
  }

  splitChunkSmaller(chunk) {
    const text = sanitizeDirectReadText(chunk.text || "");
    const sentences = splitSentences(text).map((s) => sanitizeDirectReadText(s)).filter(Boolean);
    const out = [];
    if (sentences.length > 1) {
      for (let i = 0; i < sentences.length; i += 1) {
        out.push({
          id: `${chunk.id}-s${i}`,
          text: sentences[i],
          fromTextbox: true,
          splitFrom: chunk.id,
        });
      }
      return out;
    }
    const words = text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 18) {
      const piece = words.slice(i, i + 18).join(" ");
      if (!piece) continue;
      out.push({
        id: `${chunk.id}-w${i}`,
        text: piece,
        fromTextbox: true,
        splitFrom: chunk.id,
      });
    }
    return out;
  }

  normalizeAndFixDirectChunks(originalChunks) {
    const finalChunks = [];
    const queue = [...originalChunks];
    const seen = new Set();
    while (queue.length) {
      const chunk = queue.shift();
      const text = sanitizeDirectReadText(chunk.text || "");
      if (!text) continue;
      const n = normalizeSentence(text);
      if (!n || seen.has(n)) continue;
      const sentenceCount = splitSentences(text).length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (sentenceCount > 3 || wordCount > 40) {
        const smaller = this.splitChunkSmaller({ ...chunk, text });
        console.log("[lesson] Rejected chunk split into", smaller.length, "smaller chunk(s)", { chunkId: chunk.id });
        for (const s of smaller) queue.push(s);
        this.rejectedSteps += 1;
        this.fixedSteps += Math.max(1, smaller.length);
        continue;
      }
      seen.add(n);
      finalChunks.push({
        ...chunk,
        text,
        fromTextbox: true,
      });
    }
    return finalChunks;
  }

  fixRejectedStep(step, reason) {
    const source = sanitizeSpeechText(step.sourceText || step.text || "");
    if (!source) return [];
    const chunkTexts = splitSpeechIntoChunks(source, 2);
    const fixed = [];
    for (const chunk of chunkTexts) {
      const clean = sanitizeSpeechText(chunk);
      if (!clean) continue;
      const candidate = {
        ...step,
        text: clean,
        sourceText: clean,
        fixedFrom: reason,
      };
      const revalidated = this.validateStep(candidate);
      if (revalidated.ok && revalidated.step) {
        fixed.push(revalidated.step);
        continue;
      }

      // Last-resort split by words so large chunks are still recovered.
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        for (let i = 0; i < words.length; i += 20) {
          const piece = words.slice(i, i + 20).join(" ");
          const fallbackCandidate = { ...candidate, text: piece, sourceText: piece, fixedFrom: reason };
          const fallbackValidated = this.validateStep(fallbackCandidate);
          if (fallbackValidated.ok && fallbackValidated.step) {
            fixed.push(fallbackValidated.step);
          }
        }
      }
    }
    return fixed;
  }

  normalizeAndFixSteps(steps) {
    const normalized = [];
    this.originalStepCount = steps.length;
    this.acceptedSteps = 0;
    this.rejectedSteps = 0;
    this.fixedSteps = 0;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const validated = this.validateStep(step);
      if (validated.ok && validated.step) {
        normalized.push(validated.step);
        this.acceptedSteps += 1;
        continue;
      }
      this.rejectedSteps += 1;
      const reason = validated.reason || "validation_failed";
      const fixed = this.fixRejectedStep(step, reason);
      if (fixed.length) {
        this.fixedSteps += fixed.length;
        normalized.push(...fixed);
        console.log("[lesson] Rejected step fixed into", fixed.length, "smaller step(s)", { index: i, reason });
      } else {
        this.failedStepCount += 1;
        console.log("[lesson] Rejected step could not be fixed", { index: i, reason, text: step.text });
      }
    }
    console.log("[lesson] step fixing summary:", {
      originalStepCount: this.originalStepCount,
      acceptedSteps: this.acceptedSteps,
      rejectedSteps: this.rejectedSteps,
      fixedSteps: this.fixedSteps,
      finalStepCount: normalized.length,
    });
    return normalized;
  }

  async runLessonPlan(plan) {
    this.validationLog = [];
    this.failedStepCount = 0;
    this.steps = this.normalizeAndFixSteps(plan.teachingSteps || []);
    this.lessonSteps = this.steps;
    this.currentStepIndex = 0;
    this.completedStepCount = 0;
    console.log("[lesson] total lesson steps created:", this.steps.length);
    if (this.steps.length < this.originalStepCount) {
      console.log("[lesson] warning: final step count smaller than original after fixing");
    }
    let spokenSteps = 0;
    let skippedSteps = 0;
    for (let i = 0; i < this.steps.length; i += 1) {
      const step = this.steps[i];
      this.currentStepIndex = i;
      if (!this.running) break;
      await this.waitIfPaused();
      if (!this.running) break;
      if (this.completedStepIndices.has(i)) {
        console.log("[lesson] step", i, "already completed, skipping");
        continue;
      }
      const generated = this.generateTeacherLineFromContext({ ...step, _index: i, type: step.type }, this.lessonContext || {});
      const strict = this.validateTeacherLine(generated.text, this.lessonContext || {});
      const stepStrict = this.validateTeacherStep(generated.text, step.section || step.type, this.lessonContext || {});
      console.log("[lesson] section:", step.section || "unknown", "source:", step.source || generated.source || "book_line");
      console.log("[lesson] step", i, "candidate:", generated.text);
      console.log("[lesson] step", i, "source:", generated.source, "strict:", strict.ok, strict.reason);
      if (!strict.ok || !stepStrict.ok) {
        console.log("[lesson] step", i, "rejected:", strict.ok ? stepStrict.reason : strict.reason);
        this.failedStepCount += 1;
        skippedSteps += 1;
        continue;
      }
      setStatus(`Speaking step ${i + 1} of ${this.steps.length}...`);
      const stepSpoken = await this.runStep({
        state: step.type,
        text: generated.text,
        emotion: step.emotion,
        speed: step.speed,
        ask: Boolean(step.ask),
        _index: i,
        chunkIndex: typeof step.chunkIndex === "number" ? step.chunkIndex : -1,
      });
      if (stepSpoken) {
        this.completedStepIndices.add(i);
        this.completedStepCount += 1;
        spokenSteps += 1;
        console.log(`[lesson] Completed ${this.completedStepCount} of ${this.steps.length}`);
      } else {
        this.failedStepCount += 1;
        skippedSteps += 1;
        console.log("[lesson] step", i, "failed or skipped");
      }
      console.log("[lesson] next step index", i + 1);
      await this.waitIfPaused();
      if (!this.running) break;
      await wait(220);
    }
    const accepted = this.validationLog.filter((x) => x.status === "accepted");
    const rejected = this.validationLog.filter((x) => x.status === "rejected");
    const rejectedPreview = rejected.slice(0, 3).map((r) => `- ${r.reason}: ${toShortSpokenText(r.text || "")}`);
    const acceptedPreview = accepted.slice(0, 3).map((a) => `- ${toShortSpokenText(a.text || "")}`);
    updateStrictCheck([
      "Strict Check",
      `Mode: ${this.mode}`,
      `Accepted steps: ${accepted.length}`,
      `Rejected steps: ${rejected.length}`,
      `Original steps: ${this.originalStepCount}`,
      `Auto-fixed steps: ${this.fixedSteps}`,
      "Accepted preview:",
      ...(acceptedPreview.length ? acceptedPreview : ["- (none)"]),
      "Rejected preview:",
      ...(rejectedPreview.length ? rejectedPreview : ["- (none)"]),
    ]);
    return { spokenSteps, skippedSteps, totalSteps: this.steps.length };
  }

  async runDirectTextLesson(rawText) {
    const fullText = sanitizeDirectReadText(rawText);
    const cleanedText = sanitizeDirectReadText(cleanLessonText(fullText));
    console.log("[lesson] textbox total length:", fullText.length);
    console.log("[lesson] textbox first200:", fullText.slice(0, 200));
    console.log("[lesson] textbox last200:", fullText.slice(Math.max(0, fullText.length - 200)));
    console.log("[lesson] cleaned text length:", cleanedText.length);

    const originalChunks = this.buildOriginalChunksFromTextbox(cleanedText);
    this.originalStepCount = originalChunks.length;
    this.acceptedSteps = originalChunks.length;
    this.rejectedSteps = 0;
    this.fixedSteps = 0;
    this.failedStepCount = 0;
    this.completedStepCount = 0;
    this.completedChunkCount = 0;

    const finalChunks = this.normalizeAndFixDirectChunks(originalChunks);
    this.totalOriginalChunks = originalChunks.length;
    this.totalFinalChunks = finalChunks.length;
    this.unfinishedChunkCount = finalChunks.length;

    this.lessonSteps = finalChunks.map((c) => ({
      type: "direct_read",
      section: "textbox",
      source: "textbox",
      sourceText: c.text,
      text: c.text,
      fromTextbox: c.fromTextbox,
      splitFrom: c.splitFrom,
      emotion: "neutral",
      speed: 0.94,
      ask: /\?$/.test(c.text),
      chunkIndex: -1,
    }));
    this.steps = this.lessonSteps;
    console.log("[lesson] total original chunks:", this.totalOriginalChunks);
    console.log("[lesson] total final chunks after splitting:", this.totalFinalChunks);

    for (let i = 0; i < this.lessonSteps.length; i += 1) {
      const step = this.lessonSteps[i];
      this.currentStepIndex = i;
      if (!this.running) break;
      await this.waitIfPaused();
      if (!this.running) break;

      if (!step.fromTextbox) {
        console.log("[lesson] chunk rejected: not from textbox", step);
        this.failedStepCount += 1;
        continue;
      }
      console.log("[lesson] current chunk index:", i + 1, "/", this.lessonSteps.length);
      console.log("[lesson] current chunk text:", step.text);
      console.log("[lesson] chunk source direct:", step.fromTextbox, "splitFrom:", step.splitFrom || "none");
      setStatus(`Speaking step ${i + 1} of ${this.lessonSteps.length}...`);
      const spoken = await this.runStep({
        ...step,
        _index: i,
        mustBeLessonFaithful: true,
      });
      if (spoken) {
        this.completedStepCount += 1;
        this.completedChunkCount += 1;
      } else {
        this.failedStepCount += 1;
      }
      this.unfinishedChunkCount = Math.max(0, this.lessonSteps.length - this.completedChunkCount);
      console.log("[lesson] completed chunk count:", this.completedChunkCount);
      console.log("[lesson] unfinished chunk count:", this.unfinishedChunkCount);
      await wait(150);
    }
    return {
      totalOriginalChunks: this.totalOriginalChunks,
      totalFinalChunks: this.totalFinalChunks,
      completedChunkCount: this.completedChunkCount,
      failedStepCount: this.failedStepCount,
    };
  }

  canFinishLesson() {
    const total = this.lessonSteps.length;
    const allStepsProcessed = (this.currentStepIndex + 1) >= total;
    const allStepsCompleted = (this.completedStepCount + this.failedStepCount) >= total;
    const audioIdle = !audioPlaying && !speechIsActive;
    const recoveredOriginalCoverage = (this.acceptedSteps + this.fixedSteps) >= this.originalStepCount;
    const directChunksCovered = this.directReadMode
      ? this.completedChunkCount >= this.totalFinalChunks
      : true;
    if (!allStepsProcessed || !allStepsCompleted || !audioIdle || !recoveredOriginalCoverage || !directChunksCovered) {
      console.log(
        "[lesson] finish check failed:",
        {
          allStepsProcessed,
          allStepsCompleted,
          audioIdle,
          recoveredOriginalCoverage,
          currentStepIndex: this.currentStepIndex,
          completedStepCount: this.completedStepCount,
          failedStepCount: this.failedStepCount,
          totalSteps: total,
          originalStepCount: this.originalStepCount,
          acceptedSteps: this.acceptedSteps,
          rejectedSteps: this.rejectedSteps,
          fixedSteps: this.fixedSteps,
          totalOriginalChunks: this.totalOriginalChunks,
          totalFinalChunks: this.totalFinalChunks,
          completedChunkCount: this.completedChunkCount,
          unfinishedChunkCount: this.unfinishedChunkCount,
          directChunksCovered,
          audioPlaying,
          speechIsActive,
        },
      );
      return false;
    }
    return true;
  }

  // Legacy helper retained for compatibility.
  buildVocabularySteps(points) {
    const words = (points.targetWords || []).slice(0, 6);
    const steps = [
      { state: "hook", text: "Let us focus on important words only.", emotion: "neutral", speed: 0.95 },
    ];
    for (const w of words) {
      steps.push(
        { state: "explain", text: `Today's word is ${w}.`, emotion: "neutral", speed: 0.95 },
        { state: "example", text: `${w} is important because it helps you understand the text.`, emotion: "neutral", speed: 0.93 },
        { state: "example", text: `Example: We can use ${w} in a simple sentence.`, emotion: "neutral", speed: 0.96 },
        { state: "question", text: `Can you use the word ${w} in a short sentence?`, emotion: "surprised", speed: 0.92, ask: true },
      );
    }
    steps.push(
      { state: "summary", text: "You do not need every word. These are the key words.", emotion: "neutral", speed: 0.94 },
      { state: "summary", text: "This section is complete.", emotion: "neutral", speed: 1.0 },
    );
    return steps;
  }

  buildReadingSteps(points) {
    const chunks = [];
    const focusWords = (points.targetWords || []).slice(0, 5);
    const steps = [
      { state: "hook", text: "Let us read in small steps.", emotion: "neutral", speed: 0.94 },
      { state: "explain", text: `Main idea: ${points.readingMainIdea}`, emotion: "neutral", speed: 0.93 },
      { state: "example", text: "Let us focus on important words only. You do not need every word.", emotion: "neutral", speed: 0.93 },
    ];
    if (focusWords.length) {
      steps.push({
        state: "explain",
        text: `Important words: ${focusWords.join(", ")}.`,
        emotion: "neutral",
        speed: 0.92,
      });
    }
    for (const part of chunks) {
      steps.push(
        { state: "explain", text: `Reading part: ${part}`, emotion: "neutral", speed: 0.92 },
        { state: "question", text: points.questions[0] || "What happened first?", emotion: "surprised", speed: 0.91, ask: true },
      );
    }
    steps.push(
      { state: "summary", text: `Summary: ${points.readingMainIdea}`, emotion: "neutral", speed: 0.95 },
      { state: "summary", text: "Now let us check your understanding.", emotion: "neutral", speed: 0.94 },
      { state: "summary", text: "Continue to the next part.", emotion: "neutral", speed: 0.98 },
    );
    return steps;
  }

  buildGrammarSteps(points) {
    const rule = points.grammarFocus || "one grammar rule";
    const steps = [
      { state: "hook", text: `Today we will learn ${rule}.`, emotion: "neutral", speed: 0.93 },
      { state: "explain", text: `We use ${rule} in a simple way.`, emotion: "neutral", speed: 0.92 },
      { state: "example", text: "Example: I played football yesterday.", emotion: "neutral", speed: 0.95 },
      { state: "question", text: points.questions[0] || "Which sentence is correct?", emotion: "surprised", speed: 0.91, ask: true },
      { state: "practice", text: points.questions[1] || "Now try one more practice item.", emotion: "neutral", speed: 0.92, ask: true },
      { state: "summary", text: "Grammar practice complete.", emotion: "neutral", speed: 0.98 },
    ];
    return steps;
  }

  buildSteps(points) {
    if (points.lessonType === "vocabulary") return this.buildVocabularySteps(points);
    if (points.lessonType === "grammar") return this.buildGrammarSteps(points);
    return this.buildReadingSteps(points);
  }

  async runStep(step) {
    const stepStartMs = performance.now();
    const style = { emotion: step.emotion || "neutral", speed: step.speed || 0.94, pauseMs: 180 };
    const total = this.lessonSteps.length || this.steps.length || 0;
    console.log(`[lesson] Step ${step._index + 1}/${total} started`, step.text);
    const spoken = await speakStep(step.text, style, {
      stepIndex: step._index,
      chunkIndex: step.chunkIndex,
      forceSpeak: true,
      mustBeLessonFaithful: Boolean(step.mustBeLessonFaithful),
    });
    setStatus("Waiting for audio to finish...");
    await waitForAudioDrain();
    console.log(`[lesson] Step ${step._index + 1}/${total} audio ended`);
    const elapsedMs = Math.round(performance.now() - stepStartMs);
    console.log("[lesson] step", step._index, "elapsed_ms:", elapsedMs);

    if (!spoken || !step.ask || !this.running) return spoken;
    await waitForStudentResponse();
    if (!this.running) return spoken;
    return spoken;
  }

  async start(rawText, forcedMode = null) {
    this.stop();
    this.running = true;
    this.lessonRunning = true;
    this.paused = false;
    this.completedStepIndices.clear();
    this.mode = forcedMode || "direct_read";
    setStatus("Running lesson...");
    const runStats = await this.runDirectTextLesson(rawText);
    await waitForAudioDrain();
    if (this.running && this.lessonRunning) {
      const canFinish = this.canFinishLesson();
      if (canFinish) {
        console.log("[lesson] completed stats:", runStats);
        console.log("[lesson] Lesson finished successfully");
        if (this.failedStepCount > 0) {
          setStatus(`Lesson finished with ${this.failedStepCount} skipped step(s).`);
        } else {
          setStatus("Lesson finished.");
        }
      } else {
        setStatus("Lesson still running. Finish check pending.");
      }
    }
    this.lessonRunning = false;
    this.running = false;
  }
}


async function speakWithFastAPI() {
  // Fast resume path: do not regenerate audio/timeline if paused.
  if (isPaused && audioEl && audioEl.src) {
    await resumeAudio();
    return;
  }
  stopSpeechPlayback("Preparing speech...");

  const rawText = String(textInputEl.value || "");
  if (!rawText.trim()) {
    setStatus("Please set text.");
    return;
  }
  // Keep full textbox content; do not collapse line breaks before analysis/chunking.
  console.log("[lesson] start textbox length:", rawText.length);
  console.log("[lesson] start first200:", rawText.slice(0, 200));
  console.log("[lesson] start last200:", rawText.slice(Math.max(0, rawText.length - 200)));
  if (!lessonController) {
    lessonController = new LessonController();
  }
  await lessonController.start(rawText);
}

async function generateSpeechData(base, studentId, text, speed = 1.0) {
  const speechKey = `${base}|${studentId}|${text}|${speed}`;
  if (ttsResponseCache.has(speechKey)) {
    return ttsResponseCache.get(speechKey);
  }
  if (pendingTtsRequests.has(speechKey)) {
    return pendingTtsRequests.get(speechKey);
  }
  if (cachedSpeechKey === speechKey && cachedAudioUrl && cachedVisemes.length) {
    return { speechKey, audioUrl: cachedAudioUrl, visemes: cachedVisemes };
  }

  const requestPromise = (async () => {
    const [ttsRes, lipRes] = await Promise.all([
      fetch(`${base}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: "alloy", speed, format: "wav" }),
      }),
      fetch(`${base}/avatar/lipsync/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, text, speech_rate: 1.0 }),
      }),
    ]);

    if (!ttsRes.ok) throw new Error(`TTS failed: ${ttsRes.status}`);
    if (!lipRes.ok) throw new Error(`Lip-sync failed: ${lipRes.status}`);

    const [ttsData, lipData] = await Promise.all([ttsRes.json(), lipRes.json()]);
    const audioUrl = `${base}${ttsData.audio_url}`;
    const visemes = Array.isArray(lipData.visemes) ? lipData.visemes : [];
    const payload = { speechKey, audioUrl, visemes };

    cachedSpeechKey = speechKey;
    cachedAudioUrl = audioUrl;
    cachedVisemes = visemes;
    ttsResponseCache.set(speechKey, payload);
    // Keep cache bounded to reduce memory churn.
    if (ttsResponseCache.size > 120) {
      const first = ttsResponseCache.keys().next().value;
      ttsResponseCache.delete(first);
    }
    return payload;
  })();

  pendingTtsRequests.set(speechKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    pendingTtsRequests.delete(speechKey);
  }
}

async function preloadNextSentence() {
  if (currentSentenceIndex < 0) return;
  const nextIndex = currentSentenceIndex + 1;
  if (nextIndex >= sentenceQueue.length) return;
  const nextItem = sentenceQueue[nextIndex];
  if (!nextItem || !nextItem.text) return;
  if (preloadedNext && preloadedNext.index === nextIndex) return;

  const base = apiUrlEl.value.trim().replace(/\/+$/, "");
  const studentId = studentIdEl.value.trim() || "kid1";
  setStatus("Preloading next sentence...");
  try {
    const data = await generateSpeechData(base, studentId, nextItem.text, nextItem.style.speed);
    preloadedNext = { ...data, index: nextIndex, text: nextItem.text, style: nextItem.style };
    setStatus("Next sentence preloaded.");
  } catch (_e) {
    // Non-blocking preload failure. Main playback can still continue.
  }
}

async function playSentence(text, idx = 0) {
  const base = apiUrlEl.value.trim().replace(/\/+$/, "");
  const studentId = studentIdEl.value.trim() || "kid1";
  const clean = sanitizeSpeechText(text);
  if (!clean) return;

  currentSentenceIndex = idx;
  const queueItem = sentenceQueue[idx];
  const style = (queueItem && queueItem.style) || inferSentenceStyle(clean);
  currentTeachingStyle = style;
  const sentenceType = detectSentenceTypeForAnimation(clean);
  triggerTeacherGesture(sentenceType, clean);
  let data;
  if (preloadedNext && preloadedNext.index === idx && preloadedNext.text === clean) {
    data = preloadedNext;
    preloadedNext = null;
    setStatus("Using preloaded sentence.");
  } else {
    setStatus("Generating voice + lip sync...");
    data = await generateSpeechData(base, studentId, clean, style.speed);
  }

  await startSpeechPlayback(data.audioUrl, data.visemes, async () => {
    if (currentSentenceIndex + 1 < sentenceQueue.length) {
      const nextIdx = currentSentenceIndex + 1;
      const nextItem = sentenceQueue[nextIdx];
      const waitMs = Math.max(120, Number(style.pauseMs || 200));
      setStatus("Teaching pause...");
      queuedNextSentenceTimer = window.setTimeout(async () => {
        queuedNextSentenceTimer = null;
        await playSentence(nextItem.text, nextIdx);
      }, waitMs);
    } else {
      setStatus("Audio finished.");
    }
  });
  preloadNextSentence();
}

async function startLessonFromBackend() {
  stopSpeechPlayback("Preparing lesson...");
  const base = apiUrlEl.value.trim().replace(/\/+$/, "");
  const studentId = studentIdEl.value.trim() || "kid1";
  const chapterId = (chapterIdEl.value || "").trim();
  if (!base || !chapterId) {
    setStatus("Please set FastAPI URL and chapter ID.");
    return;
  }

  setStatus("Starting lesson from backend...");
  const res = await fetch(`${base}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, chapter_id: chapterId }),
  });
  if (!res.ok) throw new Error(`/session/start failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));

  const teacherText = String(data.teacher_text || "");
  if (!teacherText.trim()) {
    setStatus("Lesson started, but no teacher_text returned.");
    return;
  }

  textInputEl.value = teacherText;
  if (!lessonController) {
    lessonController = new LessonController();
  }
  await lessonController.start(teacherText);
}

function syncVisemeIndexToCurrentAudioTime() {
  const activeAudio = getActiveAudio() || audioEl || audioDebugEl;
  const tMs = activeAudio ? (activeAudio.currentTime * 1000) : 0;
  visemeIndex = 0;
  while (visemeIndex + 1 < visemeTimeline.length && visemeTimeline[visemeIndex + 1].time_ms <= tMs) {
    visemeIndex += 1;
  }
  lastAudioTimeMs = tMs;
}

function pauseAudio() {
  if (queuedNextSentenceTimer) {
    window.clearTimeout(queuedNextSentenceTimer);
    queuedNextSentenceTimer = null;
  }
  if (lessonController) {
    lessonController.pause();
  }
  if (audioEl) {
    audioEl.pause();
  }
  if (audioDebugEl) {
    audioDebugEl.pause();
  }
  speechIsActive = false;
  audioPlaying = false;
  talkMode = false;
  isPaused = true;
  onSpeechAnimationEnded();
  resetFaceToNeutral();
  setStatus("Paused.");
}

async function resumeAudio() {
  if (!audioEl || !audioEl.src) {
    setStatus("Nothing to resume. Start speech first.");
    return;
  }
  if (lessonController) {
    lessonController.resume();
  }
  syncVisemeIndexToCurrentAudioTime();
  await audioEl.play();
  if (audioDebugEl && audioDebugEl.src !== audioEl.src) {
    audioDebugEl.src = audioEl.src;
  }
  speechIsActive = true;
  audioPlaying = true;
  talkMode = true;
  isPaused = false;
  setStatus("Resumed.");
}

function stopAudio() {
  if (queuedNextSentenceTimer) {
    window.clearTimeout(queuedNextSentenceTimer);
    queuedNextSentenceTimer = null;
  }
  if (lessonController) {
    lessonController.stop();
  }
  stopSpeechPlayback("Stopped.");
}

bindDom("btnSpeak", "click", async () => {
  try {
    await speakWithFastAPI();
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
});
bindDom("btnPause", "click", () => {
  pauseAudio();
});
bindDom("btnResume", "click", async () => {
  try {
    await resumeAudio();
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
});
bindDom("btnStartLesson", "click", async () => {
  try {
    await startLessonFromBackend();
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
});
bindDom("btnStop", "click", stopAudio);
bindDom("btnTalkOn", "click", () => {
  talkMode = true;
  speechIsActive = Boolean(getActiveAudio());
  setStatus("Talk mode ON.");
});
bindDom("btnTalkOff", "click", () => {
  talkMode = false;
  speechIsActive = false;
  resetFaceToNeutral();
  setStatus("Talk mode OFF.");
});
bindDom("btnResetCamera", "click", () => {
  if (avatarRoot) reframeCameraFromAvatarRoot("button-reset");
  else resetTeacherCameraView("button");
  setStatus("Camera reset to front teacher view.");
});
bindDom("btnForceFrontCamera", "click", () => {
  if (avatarRoot) reframeCameraFromAvatarRoot("force-front-button");
  else resetTeacherCameraView("force-front-button");
  console.log("[camera] force front camera applied");
  setStatus("Force front camera applied.");
});
bindDom("btnSmile", "click", () => { smileFace(); setStatus("Smile."); });
bindDom("btnNeutral", "click", () => {
  selectedEmotion = "neutral";
  neutralFace();
  applyTeacherNeutralStandingPose();
  captureTeacherBaseRotations();
  if (avatarRoot) {
    avatarRoot.updateMatrixWorld(true);
    snapAvatarPlacementFull(avatarRoot, "btn-neutral");
    reframeCameraFromAvatarRoot("btn-neutral");
  }
  setStatus("Neutral.");
});
bindDom("btnResetArms", "click", () => {
  applyTeacherNeutralStandingPose();
  captureTeacherBaseRotations();
  if (avatarRoot) {
    avatarRoot.updateMatrixWorld(true);
    snapAvatarPlacementFull(avatarRoot, "btn-reset-arms");
    reframeCameraFromAvatarRoot("btn-reset-arms");
  }
  setStatus("Arms reset to manual neutral pose.");
});
bindDom("btnFreezeArms", "click", () => {
  ARM_DEBUG_CONFIG.freezeArms = !ARM_DEBUG_CONFIG.freezeArms;
  const freezeBtn = document.getElementById("btnFreezeArms");
  if (freezeBtn) {
    freezeBtn.textContent = `Freeze Arms: ${ARM_DEBUG_CONFIG.freezeArms ? "ON" : "OFF"}`;
  }
  if (ARM_DEBUG_CONFIG.freezeArms) {
    applyTeacherNeutralStandingPose();
    captureTeacherBaseRotations();
    if (avatarRoot) {
      avatarRoot.updateMatrixWorld(true);
      snapAvatarPlacementFull(avatarRoot, "btn-freeze-arms");
      reframeCameraFromAvatarRoot("btn-freeze-arms");
    }
    console.log("[rig] Freeze Arms enabled");
  } else {
    console.log("[rig] Freeze Arms disabled");
  }
});
bindDom("btnBlink", "click", () => { blinkOnce(); setStatus("Blink."); });
document.querySelectorAll(".emotionBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setEmotion(btn.dataset.emotion);
    setStatus(`Emotion: ${btn.dataset.emotion}`);
  });
});

let textParseDebounceTimer = null;
textInputEl.addEventListener("input", () => {
  if (textParseDebounceTimer) {
    window.clearTimeout(textParseDebounceTimer);
  }
  textParseDebounceTimer = window.setTimeout(() => {
    if (lessonController) {
      lessonController.invalidateCachedAnalysis();
    }
    console.log("[lesson] textbox changed; cached analysis invalidated.");
  }, 220);
});

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  updateTeacherBodyAnimation(dt);

  if (talkMode) {
    clearLipFramePose();
    resetMouth();
    // Always drive lip sync from real audio playback time.
    updateLipSyncFromAudio();
  } else {
    applyIdleMouthPose(dt);
    // Keep manually selected emotion active while idle.
    if (selectedEmotion && selectedEmotion !== "neutral") {
      applyEmotionTargets(selectedEmotion, 1.0);
    }
  }

  applySmoothTargets(dt);
  // Hard safety clamp to prevent permanent "duck face".
  for (const item of groups.pucker()) {
    const v = item.mesh.morphTargetInfluences[item.idx] || 0;
    item.mesh.morphTargetInfluences[item.idx] = Math.min(v, 0.28);
  }
  // --- ARM SAFETY (final): world height hard lock immediately before WebGL render (cannot be skipped). ---
  if (ARM_DEBUG_CONFIG.freezeArms) {
    enforceFreezeArmsAndDetectOverrides();
  }
  armSafetyHardLockBeforeRender();
  // Last-write-wins: force arm-down directly before render, overriding all prior systems.
  forceArmDownEveryFrame();
  // DIAGNOSTIC: rotate every bone that has "arm" in its name by a large amount to find which ones visually move the arms.
  if (window._armDiagActive && avatarRoot) {
    avatarRoot.traverse(obj => {
      if (!obj.isBone) return;
      const n = obj.name.toLowerCase();
      if (/arm|shoulder|clavicle|collar/.test(n)) {
        obj.rotation.z += 0.0003; // very slow drift — watch which bone moves the arm
      }
    });
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function init() {
  const loader = new GLTFLoader();
  setStatus("Loading avatar.glb file...");
  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => {
      loader.load(
        "./avatar.glb",
        resolve,
        (evt) => {
          if (evt && evt.total) {
            const p = Math.round((evt.loaded / evt.total) * 100);
            setStatus(`Loading avatar.glb... ${p}%`);
          } else {
            setStatus("Loading avatar.glb...");
          }
        },
        (err) => reject(err),
      );
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error("GLB load error:", e);
    setStatus(`Failed to load avatar.glb: ${msg}`);
    throw e;
  }

  try {
    const avatarPlacement = new THREE.Group();
    avatarPlacement.name = "AvatarPlacement";
    avatarPlacement.visible = true;
    scene.add(avatarPlacement);
    avatarPlacement.add(gltf.scene);
    avatarRoot = avatarPlacement;

    // GLB spine runs along +Z, head at +Z end, face pointing +Y when lying flat.
    // Rx(-90°): +Z→+Y (head up), +Y→-Z; then Ry(180°): -Z→+Z (face toward camera).
    // Bone-based grounding below places feet correctly at Y=0.
    gltf.scene.position.set(0, 0, 0);
    gltf.scene.rotation.order = "XYZ";
    gltf.scene.rotation.set(0, Math.PI + Math.PI, 0);
    gltf.scene.scale.set(1, 1, 1);
    gltf.scene.visible = true;
    avatarRoot.updateWorldMatrix(true, true);
    gltf.scene.updateWorldMatrix(true, true);

    avatarRoot.visible = true;
    avatarRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.visible = true;
        obj.frustumCulled = false;
      }
    });

    discoverMorphMeshes(gltf.scene);
    detectTeacherBones(gltf.scene);
    // DIAGNOSTIC: dump all skeleton bones as one readable block.
    const _skelDump = [];
    gltf.scene.traverse(obj => {
      if (obj.isSkinnedMesh && obj.skeleton) {
        _skelDump.push(`\nSkinnedMesh: "${obj.name}" (${obj.skeleton.bones.length} bones)`);
        obj.skeleton.bones.forEach((b, i) => {
          const wp = new THREE.Vector3(); b.getWorldPosition(wp);
          _skelDump.push(`  [${String(i).padStart(3)}] ${b.name.padEnd(40)} world=(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)})`);
        });
      }
    });
    console.log("╔══════════ ALL GLB BONES ══════════╗\n" + _skelDump.join("\n") + "\n╚════════════════════════════════════╝");
    alignRigBonesToSkinnedSkeleton(gltf.scene);
    logArmAxisReport();
    if (ARM_DEBUG_CONFIG.printHierarchyOnLoad) {
      dumpAvatarBoneHierarchy(gltf.scene);
    }
    const leftChain = getLeftArmDebugChain().map((b) => b.name);
    console.log("[rig] left arm influence chain", leftChain);
    avatarRoot.updateWorldMatrix(true, true);

    // Use rig-bone world positions for grounding (foot/toe/hips) — far more reliable than
    // skinned-mesh bounding boxes, which use bind-pose geometry and can report wrong values.
    // snapAvatarPlacementFull = bone-based Y + hips XZ, then bbox residual sweep.
    const rigGroundOk = snapAvatarPlacementFull(avatarRoot, "init");

    // Fallback: if no foot/hip bones were found, ground via raw bbox.
    if (!rigGroundOk) {
      avatarRoot.updateWorldMatrix(true, true);
      const fbbox = new THREE.Box3().setFromObject(avatarRoot);
      if (!fbbox.isEmpty()) {
        avatarRoot.position.y -= fbbox.min.y;
        const cx = (fbbox.min.x + fbbox.max.x) / 2;
        const cz = (fbbox.min.z + fbbox.max.z) / 2;
        avatarRoot.position.x -= cx;
        avatarRoot.position.z -= cz;
        console.warn("[init] rig grounding failed; fell back to raw bbox.");
      }
    }

    // Offset feet position — feet land at Y=-0.5.
    avatarRoot.position.y += 0;

    // Find real arm bones spatially (name-based detection failed for this model).
    findRealArmBonesSpatially();
    // Pose arms straight down (parallel to spine/Y) and capture as the permanent base pose.
    poseArmsAtSide();
    // Cache finger bones and their A-pose quaternions (must run after poseArmsAtSide).
    captureFingerBasePose();
    avatarRoot.updateMatrixWorld(true);

    // Capture all bone rotations — arm-down pose is now baked into the base.
    gltf.scene.updateMatrixWorld(true);
    captureTeacherBaseRotations();
    // Re-capture arm bones specifically so forceNeutralTeacherArmPoseEveryFrame holds this pose.
    const armBoneList = [
      rigBones.leftShoulder,  rigBones.rightShoulder,
      rigBones.leftUpperArm,  rigBones.rightUpperArm,
      rigBones.leftForeArm,   rigBones.rightForeArm,
      rigBones.leftHand,      rigBones.rightHand,
    ].filter(Boolean);
    for (const bone of armBoneList) {
      bone.userData.baseRotation = bone.rotation.clone();
    }
    console.log("[init] arm-at-side base rotations captured");

    avatarRoot.updateWorldMatrix(true, true);

    const diagBbox = new THREE.Box3().setFromObject(avatarRoot);
    console.log("Avatar root position:", avatarRoot.position);
    console.log("Avatar model rotation:", gltf.scene.rotation);
    if (!diagBbox.isEmpty()) {
      console.log("Avatar bbox:", diagBbox.min, diagBbox.max);
    } else {
      console.log("Avatar bbox: (empty)");
    }

    reframeCameraFromAvatarRoot("avatar-standing-facing-front");
    if (ARM_DEBUG_CONFIG.freezeArms) {
      disableArmAnimationSystemsForDebug();
      enforceFreezeArmsAndDetectOverrides();
    }
    Object.keys(gestureSmoothed).forEach((k) => {
      gestureSmoothed[k] = 0;
    });
    teacherAnim.speaking = false;
    teacherAnim.speechType = "explaining";
    teacherAnim.armMotionScale = 0;
    teacherAnim.emphasisLeadArm = "L";
    teacherAnim.phrasePhase = 0;
    teacherAnim.elapsed = 0;
    gltf.scene.updateMatrixWorld(true);
    if (!rigBones.leftUpperArm || !rigBones.rightUpperArm) {
      console.warn("[rig] Upper-arm bones not resolved; arm pose may look wrong for this GLB.");
    }
    for (const mesh of morphMeshes) {
      if (mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences.fill(0);
      }
    }
    talkMode = false;
    const names = listMorphNames();
    morphListEl.innerHTML = names.length
      ? names.map((n) => `<span class="pill">${n}</span>`).join("")
      : "No morph targets detected. Ensure shape keys are exported in .glb.";
    setStatus(`Avatar loaded. Morph targets found: ${names.length}`);
    lessonController = new LessonController();
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error("Avatar init error:", e);
    setStatus(`Avatar setup failed: ${msg}`);
    throw e;
  }
}


window.addEventListener("resize", () => {
  const w = Math.max(320, window.innerWidth - 360);
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (avatarRoot) {
    reframeCameraFromAvatarRoot("resize");
  }
});

init()
  .then(() => animate())
  .catch((e) => {
    const msg = e && e.message ? e.message : String(e);
    console.error("init() failed:", e);
    setStatus(`Init failed: ${msg}`);
  });

// ─── DEV TESTING HELPERS ────────────────────────────────────────────────────
// Open the browser console and call these to preview any gesture clip:
//
//   window.__testGesture("explaining")   ← looping sway
//   window.__testGesture("emphasis")     ← both arms raise once
//   window.__testGesture("pointing")     ← right arm extends forward
//   window.__testGesture("counting")     ← left arm beats a count
//   window.__testGesture("list")         ← arms open outward
//   window.__testGesture("vocab")        ← right arm lifts for a term
//   window.__stopGesture()              ← end gesture, return to A-pose
//
window.__testGesture = (type) => {
  const clips = (typeof TEACHING_CLIPS !== "undefined") ? TEACHING_CLIPS : window.TEACHING_CLIPS;
  if (!clips) { console.error("TEACHING_CLIPS not loaded"); return; }
  const clip = clips[type] ?? clips["explaining"];
  teacherAnim.speaking = true;
  teacherAnim.speechType = type;
  teacherAnim.activeClip = clip;
  teacherAnim.clipElapsed = 0;
  console.log(`[test] gesture started: ${type} (loop=${clip.loop})`);
};
window.__stopGesture = () => {
  teacherAnim.speaking = false;
  teacherAnim.activeClip = null;
  teacherAnim.clipElapsed = 0;
  _countingClipActive = false;
  console.log("[test] gesture stopped — arms returning to A-pose");
};

// ─── SHARED FIST POSE CONSTANTS ──────────────────────────────────────────────
// Used by applyClosedFistPose() AND the counting clip so both always match.
//
// HOW TO TUNE:
//   rArmX / lArmX  — how far forward the upper arm swings (negative = forward).
//                    ~0.55–0.75 rad puts hands roughly at chest height.
//   rForeX / lForeX — elbow bend angle.  0.70–0.90 rad creates a clear 90° bend
//                     that brings the forearm up toward the torso.
//   fingerCurl      — 0 = fully open palm, 1 = tight fist (0.85 = relaxed fist)
const FIST_POSE = Object.freeze({
  rArmX:       -0.62,  // right upper arm: swing forward ~35° (toward student)
  lArmX:       -0.52,  // left upper arm: slightly less (more natural asymmetry)
  rForeX:       0.78,  // right elbow bend ~45° — brings hand near torso
  lForeX:       0.68,  // left elbow bend
  rHandX:       0.22,  // wrist tilts back — palm faces slightly toward student
  lHandX:       0.22,
  fingerCurl:   0.85,  // 0 = flat palm, 1 = tight fist  (0.85 = relaxed fist)
});

/**
 * Immediately force both hands into a closed relaxed fist.
 *
 * HOW IT WORKS — three-step process:
 *   1. Reset all arm bones to their captured A-pose (baseRotation) so
 *      forceArmDownEveryFrame() starts from a predictable baseline.
 *   2. Snap every gestureSmoothed channel to the fist target values,
 *      completely bypassing lerpToward() (no lerp delay at all).
 *   3. Call forceArmDownEveryFrame() which writes the final bone quaternions
 *      this very frame — the pose is visible on the next browser paint.
 *
 * WHY STEP 1 IS ESSENTIAL:
 *   forceArmDownEveryFrame() multiplies gesture deltas on top of the bone's
 *   current state.  If we skip the reset, cumulative drift from previous
 *   frames corrupts the result.  Resetting first guarantees a clean start.
 *
 * WHEN TO CALL:
 *   Called automatically by playCountingAnimation(). You can also call it
 *   from the browser console: window.applyClosedFistPose()
 */
function applyClosedFistPose() {
  if (!teacherRigReady) {
    console.warn("[fist] rig not ready — skipping applyClosedFistPose");
    return;
  }

  console.log("[counting] Counting triggered");

  // ── STEP 0: Compute forward-fist arm quaternions (world-space math) ───────
  // This replaces the gestureSmoothed.rArmX offset approach which only twists
  // the arm along its own length axis (invisible from the front view).
  computeFistArmQuaternions();
  _countingClipActive = true;

  // ── STEP 1: Reset arm/hand/forearm bones to A-pose baseline ──────────────
  // This mirrors what updateTeacherBodyAnimation does at the start of each frame.
  // Without it, forceArmDownEveryFrame() would compound on stale rotations.
  for (const bone of getTeacherAnimatedBones()) {
    const b = bone?.userData?.baseRotation;
    if (!bone || !b) continue;
    bone.rotation.order = b.order;
    bone.rotation.copy(b);
  }
  // Also reset the finger bones to their A-pose quaternions.
  for (const side of ["L", "R"]) {
    for (const { bone } of _fingerBones[side]) {
      const baseQ = _fingerBaseQ.get(bone.uuid);
      if (baseQ) bone.quaternion.copy(baseQ);
    }
  }

  // ── STEP 2: Snap gestureSmoothed to fist values ───────────────────────────
  // Direct assignment — no lerpToward() involved, takes effect immediately.
  gestureSmoothed.rArmX        = FIST_POSE.rArmX;
  gestureSmoothed.lArmX        = FIST_POSE.lArmX;
  gestureSmoothed.rArmY        = 0;   gestureSmoothed.lArmY = 0;
  gestureSmoothed.rArmZ        = 0;   gestureSmoothed.lArmZ = 0;
  gestureSmoothed.rForeX       = FIST_POSE.rForeX;
  gestureSmoothed.lForeX       = FIST_POSE.lForeX;
  gestureSmoothed.rHandX       = FIST_POSE.rHandX;
  gestureSmoothed.lHandX       = FIST_POSE.lHandX;
  gestureSmoothed.rHandZ       = 0;   gestureSmoothed.lHandZ = 0;
  // Fully curled fingers — all per-finger open overrides at 0.
  gestureSmoothed.rFingerCurl  = FIST_POSE.fingerCurl;
  gestureSmoothed.lFingerCurl  = FIST_POSE.fingerCurl;
  gestureSmoothed.rIndexOpen   = 0;   gestureSmoothed.lIndexOpen  = 0;
  gestureSmoothed.rMiddleOpen  = 0;   gestureSmoothed.lMiddleOpen = 0;
  gestureSmoothed.rRingOpen    = 0;   gestureSmoothed.lRingOpen   = 0;
  gestureSmoothed.rPinkyOpen   = 0;   gestureSmoothed.lPinkyOpen  = 0;
  gestureSmoothed.mouthOpen    = 0;
  gestureSmoothed.countHeadNod = 0;

  // ── STEP 3: Apply to bones immediately ───────────────────────────────────
  // forceArmDownEveryFrame() reads gestureSmoothed and writes final quaternions.
  // After this call the skeleton is already in fist position.
  forceArmDownEveryFrame();

  console.log("[counting] Closed fist pose applied at frame 0");
}

// Expose for browser console preview.
window.applyClosedFistPose = applyClosedFistPose;

// ─── COUNTING ANIMATION ───────────────────────────────────────────────────────
//
// HOW TO TRIGGER:
//   playCountingAnimation(5)             ← counts 1 to 5
//   playCountingAnimation(3)             ← counts 1 to 3
//   window.playCountingAnimation(5)      ← from browser console
//   playCountingAnimation(5, () => {…})  ← with done-callback
//
// TIMELINE (all durations are constants you can adjust inside the function):
//   ┌──────────────┬───────────────────────────────────────────────────────┐
//   │ FIST_RISE    │ Both arms raise to chest level, hands close to fists  │
//   │ FIST_HOLD    │ Hold fist pose — avatar "readies" before counting      │
//   │ PER_COUNT×N  │ Right hand opens one more finger per beat              │
//   │ FIST_OUTRO   │ Right hand closes back to fist, both arms settle       │
//   │ RAMP_OUT     │ Both arms lower smoothly to A-pose                     │
//   └──────────────┴───────────────────────────────────────────────────────┘
//
// FINGER LOGIC (if bones exist):
//   Count 1 → index open,  others curled
//   Count 2 → index + middle,  others curled
//   Count 3 → + ring
//   Count 4 → + pinky
//   Count 5 → all open (flat palm)
//   If no finger bones are found the curl channels silently do nothing —
//   the arm/wrist movement still plays.
//
// ALL MOTION IS SMOOTHED:
//   The gestureSmoothed channels are all lerped via lerpToward() (speed 5.6)
//   before being applied.  You can return "step" values and the lerp handles
//   every transition — no manual easing needed inside update().

/**
 * Builds and starts the fist-to-counting gesture clip.
 * @param {number}   countTo  — highest number to count to (1–10, default 5)
 * @param {function} [onDone] — optional callback fired when animation finishes
 */
function playCountingAnimation(countTo = 5, onDone = null) {
  countTo = Math.max(1, Math.min(10, Math.round(countTo)));

  // ── STEP 0: FORCE FIST BEFORE THE CLIP STARTS ────────────────────────────
  // This snaps gestureSmoothed to fist values and calls forceArmDownEveryFrame()
  // immediately, so the very first rendered frame shows closed fists.
  // Without this call, lerpToward would take ~0.6 s to reach the fist target.
  applyClosedFistPose();

  // ── TIMING CONSTANTS (seconds) — edit these to adjust feel ────────────────
  // FIST_RISE is now 0 because applyClosedFistPose() already snapped us there.
  // We keep a tiny non-zero value so the phase logic still works cleanly.
  const FIST_RISE  = 0.05; // near-instant (pose already applied above)
  const FIST_HOLD  = 0.75; // hold fist pose — avatar is clearly in fist
  const PER_COUNT  = 1.2;  // time per number (gesture snap + hold + brief pause)
  const FIST_OUTRO = 0.5;  // right hand closes back to fist after last count
  const RAMP_OUT   = 0.8;  // both arms lower to A-pose
  // ──────────────────────────────────────────────────────────────────────────

  // Derived timeline landmarks (seconds from t = 0)
  const COUNT_START = FIST_RISE + FIST_HOLD;
  const COUNT_END   = COUNT_START + countTo * PER_COUNT;
  const OUTRO_END   = COUNT_END   + FIST_OUTRO;
  const TOTAL       = OUTRO_END   + RAMP_OUT;

  // ── FIST POSE TARGETS — pulled from shared FIST_POSE constants ───────────
  // Edit FIST_POSE (defined above this function) to move the fist position.
  const FIST_R_ARM_X  = FIST_POSE.rArmX;
  const FIST_L_ARM_X  = FIST_POSE.lArmX;
  const FIST_R_FORE_X = FIST_POSE.rForeX;
  const FIST_L_FORE_X = FIST_POSE.lForeX;
  const FIST_WRIST    = FIST_POSE.rHandX;
  const FIST_CURL     = FIST_POSE.fingerCurl;

  // When counting, right arm lifts slightly higher than the fist rest position
  // to display fingers clearly toward the student.
  const COUNT_R_ARM_X = FIST_POSE.rArmX - 0.14;  // ~0.14 rad above fist rest

  // Helper: smoothstep 0→1 for x in [lo, hi].
  const smooth = (x, lo, hi) => {
    const s = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    return s * s * (3 - 2 * s);
  };

  const clip = {
    loop: false,
    duration: TOTAL,

    update(t) {

      // ── PHASE BOOLEANS ────────────────────────────────────────────────────
      const inFistRise = t < FIST_RISE;
      const inFistHold = t >= FIST_RISE  && t < COUNT_START;
      const inCounting = t >= COUNT_START && t < COUNT_END;
      const inOutro    = t >= COUNT_END   && t < OUTRO_END;
      const inRampOut  = t >= OUTRO_END;

      // ── COUNTING STATE ────────────────────────────────────────────────────
      // showing = how many fingers are currently extended (1–countTo, 0 = fist)
      // withinT = 0→1 progress within the current count beat
      let showing = 0, withinT = 0;
      if (inCounting) {
        const phase    = t - COUNT_START;
        const countIdx = Math.min(Math.floor(phase / PER_COUNT), countTo - 1);
        withinT = (phase - countIdx * PER_COUNT) / PER_COUNT;
        showing = countIdx + 1;
        // Log once when counting phase begins (first time showing = 1 at withinT ≈ 0).
        if (showing === 1 && withinT < 0.05) {
          console.log("[counting] Fist hold finished, opening to number 1");
        }
      }

      // ── ARM POSITIONS ─────────────────────────────────────────────────────
      // The gestureSmoothed lerp handles smooth transitions between phases —
      // just return the target value for whichever phase we are in.
      let rArmX, lArmX, rForeX, lForeX, rHandX, lHandX;

      if (inFistRise || inFistHold) {
        // PHASE 1 & 2 — FIST HOLD: applyClosedFistPose() already snapped the
        // channels to these values, so lerpToward has nothing to traverse.
        // This block simply keeps the target at the fist position.
        rArmX  = FIST_R_ARM_X;   lArmX  = FIST_L_ARM_X;
        rForeX = FIST_R_FORE_X;  lForeX = FIST_L_FORE_X;
        rHandX = FIST_WRIST;     lHandX = FIST_WRIST;
      } else if (inCounting) {
        // PHASE 3 — COUNTING: right arm lifts a bit higher; left stays in fist.
        rArmX  = COUNT_R_ARM_X;  lArmX  = FIST_L_ARM_X;
        rForeX = FIST_R_FORE_X;  lForeX = FIST_L_FORE_X;
        // Wrist tilts back more as the count grows, so fingers face the student.
        rHandX = 0.10 + showing * 0.02;
        lHandX = FIST_WRIST;
      } else if (inOutro) {
        // PHASE 4 — OUTRO: right arm returns to fist position.
        rArmX  = FIST_R_ARM_X;   lArmX  = FIST_L_ARM_X;
        rForeX = FIST_R_FORE_X;  lForeX = FIST_L_FORE_X;
        rHandX = FIST_WRIST;     lHandX = FIST_WRIST;
      } else {
        // PHASE 5 — RAMP OUT: both arms lower back to A-pose (target = 0).
        rArmX  = 0;  lArmX  = 0;
        rForeX = 0;  lForeX = 0;
        rHandX = 0;  lHandX = 0;
      }

      // ── SMALL COUNT BOUNCE ────────────────────────────────────────────────
      // Right arm dips slightly then rebounds with each count — adds life.
      const countBounce = inCounting
        ? Math.sin(Math.min(withinT * 2.0, Math.PI)) * 0.025
        : 0;

      // Left arm has a small sympathetic pulse to look natural.
      const symBounce = inCounting
        ? Math.sin((t - COUNT_START) * Math.PI / PER_COUNT) * 0.018
        : 0;

      // ── FINGER STATES ─────────────────────────────────────────────────────
      // LEFT hand stays as a relaxed fist throughout.
      // RIGHT hand: fist during intro/outro, opens progressively while counting.
      const leftCurl = inRampOut ? 0 : FIST_CURL;

      let rightCurl, rIdx, rMid, rRing, rPinky;

      if (inFistRise || inFistHold || inOutro) {
        // ── FIST PHASE: all right-hand fingers curl closed ─────────────────
        // (lerpToward will smoothly transition between the previous open state
        //  and this target, so the outro "closes" fingers automatically.)
        rightCurl = FIST_CURL;
        rIdx = rMid = rRing = rPinky = 0;

      } else if (inRampOut) {
        // ── RAMP OUT: open fingers naturally as arms lower ─────────────────
        rightCurl = 0;
        rIdx = rMid = rRing = rPinky = 0;

      } else if (showing >= 5) {
        // ── COUNT 5+: fully open palm ─────────────────────────────────────
        rightCurl = 0;
        rIdx = rMid = rRing = rPinky = 1;

      } else {
        // ── COUNTING PHASE: open one more finger per beat ─────────────────
        // snapEase eases in quickly at the start of each beat, then holds.
        // To adjust how snappy the finger extension feels, change 0.35 below.
        const snapEase = smooth(withinT, 0, 0.35);
        rightCurl = FIST_CURL;
        rIdx   = showing >= 1 ? snapEase : 0;
        rMid   = showing >= 2 ? snapEase : 0;
        rRing  = showing >= 3 ? snapEase : 0;
        rPinky = showing >= 4 ? snapEase : 0;
      }

      // ── HEAD NOD ──────────────────────────────────────────────────────────
      // Quick forward nod at the start of each count beat.
      const nodPulse = showing > 0
        ? Math.sin(Math.min(withinT * 2.5, Math.PI)) * THREE.MathUtils.degToRad(6)
        : 0;

      // ── MOUTH OPEN/CLOSE ──────────────────────────────────────────────────
      // Brief mouth open at the beginning of each beat (like saying the number).
      const mouthPulse = showing > 0
        ? Math.sin(Math.min(withinT * 3.5, Math.PI)) * 0.48
        : 0;

      return {
        // Right counting arm (dips on bounce)
        rArmX:        rArmX - countBounce,
        rForeX,
        rHandX,
        // Left sympathetic arm (stays in fist, small pulse)
        lArmX:        lArmX + symBounce,
        lForeX,
        lHandX,
        // Right hand: fist → counting fingers
        rFingerCurl:  rightCurl,
        rIndexOpen:   rIdx,
        rMiddleOpen:  rMid,
        rRingOpen:    rRing,
        rPinkyOpen:   rPinky,
        // Left hand: always a relaxed fist
        lFingerCurl:  leftCurl,
        lIndexOpen:   0,
        lMiddleOpen:  0,
        lRingOpen:    0,
        lPinkyOpen:   0,
        // Face
        countHeadNod: nodPulse,
        mouthOpen:    mouthPulse,
      };
    },
  };

  // ── START ─────────────────────────────────────────────────────────────────
  // Plugs directly into the existing teacherAnim active-clip system.
  // No changes to avatar position, camera, or skeleton are made here.
  teacherAnim.speaking    = true;
  teacherAnim.speechType  = "counting";
  teacherAnim.activeClip  = clip;
  teacherAnim.clipElapsed = 0;

  // Friendly, warm expression suitable for teaching a child.
  addTarget(groups.smile(), 0.75);
  addTarget(groups.browUp(), 0.22);

  console.log(`[counting] started: countTo=${countTo}  total=${TOTAL.toFixed(1)}s`);
  console.log(`  phases: rise=${FIST_RISE}s  hold=${FIST_HOLD}s  count=${(countTo * PER_COUNT).toFixed(1)}s  outro=${FIST_OUTRO}s  lower=${RAMP_OUT}s`);

  // Clear fist/counting mode and fire the optional callback after the animation.
  const cleanupMs = (TOTAL + 0.5) * 1000;
  setTimeout(() => {
    _countingClipActive = false;
    console.log("[counting] finished — returning to A-pose");
    if (typeof onDone === "function") onDone();
  }, cleanupMs);
}

// Expose counting internally used by playAnimation.
window.playCountingAnimation = playCountingAnimation;

// ─── PUBLIC ANIMATION API ────────────────────────────────────────────────────
//
// playAnimation(name [, options])
//   name     – one of: "explaining" | "asking" | "emphasis" | "pointing" |
//                      "counting"   | "list"   | "vocab"
//   options  – optional object:
//                countTo  {number}   (only for "counting", default 5)
//                onDone   {function} callback when one-shot finishes
//
// Looping animations (explaining, asking, list):
//   Continue until stopAnimation() or the next playAnimation() call.
//
// One-shot animations (emphasis, pointing, vocab):
//   Auto-stop after their built-in duration.
//
// Counting:
//   Routes to playCountingAnimation(options.countTo ?? 5).
//
// stopAnimation()
//   Smoothly returns the avatar to the idle A-pose.
//
// ─── Console / lesson usage ─────────────────────────────────────────────────
//   window.playAnimation("explaining")
//   window.playAnimation("counting", { countTo: 3 })
//   window.playAnimation("emphasis")
//   window.stopAnimation()
// ────────────────────────────────────────────────────────────────────────────

function playAnimation(name, options = {}) {
  const VALID = ["explaining", "asking", "emphasis", "pointing",
                 "counting", "list", "vocab"];

  if (!VALID.includes(name)) {
    console.warn(`[anim] Unknown animation "${name}". Valid: ${VALID.join(", ")}`);
    return;
  }

  // Counting is handled by its own dedicated function with full finger logic.
  if (name === "counting") {
    const countTo = (options && options.countTo != null) ? options.countTo : 5;
    const onDone  = (options && typeof options.onDone === "function") ? options.onDone : null;
    console.log(`[anim] playAnimation("counting") → playCountingAnimation(${countTo})`);
    playCountingAnimation(countTo, onDone);
    return;
  }

  // All other clips go through the clip system.
  console.log(`[anim] playAnimation("${name}") started`);
  triggerTeacherGesture(name);

  // One-shot clips: fire onDone after their duration.
  const clips = (typeof TEACHING_CLIPS !== "undefined") ? TEACHING_CLIPS : window.TEACHING_CLIPS;
  const clip  = clips ? clips[name] : null;
  if (clip && !clip.loop && clip.duration) {
    const ms = (clip.duration + 0.3) * 1000;
    if (options && typeof options.onDone === "function") {
      setTimeout(options.onDone, ms);
    }
    setTimeout(() => {
      console.log(`[anim] "${name}" finished — arms returning to idle`);
    }, ms);
  }
}

function stopAnimation() {
  onSpeechAnimationEnded();
  console.log("[anim] stopAnimation() — returning to idle");
}

// Expose on window for lesson logic, sidebar buttons, and DevTools console.
window.playAnimation  = playAnimation;
window.stopAnimation  = stopAnimation;
