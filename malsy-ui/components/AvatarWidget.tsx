'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Brings RPM avatar out of A/T-pose by rotating each upper arm so the
// upper-arm → hand direction points mostly downward (15° outward lean).
function poseArmsDown(model: THREE.Group) {
  const byName: Record<string, THREE.Bone> = {};
  model.traverse((obj) => {
    const b = obj as THREE.Bone;
    if (b.isBone) byName[b.name] = b;
  });

  model.updateMatrixWorld(true);

  const LEAN = THREE.MathUtils.degToRad(15);
  const sinL = Math.sin(LEAN);
  const cosL = Math.cos(LEAN);

  const pairs = [
    { upper: byName['LeftArm'],  hand: byName['LeftHand']  },
    { upper: byName['RightArm'], hand: byName['RightHand'] },
  ];

  for (const { upper, hand } of pairs) {
    if (!upper || !hand) continue;

    const upperPos = new THREE.Vector3();
    const handPos  = new THREE.Vector3();
    upper.getWorldPosition(upperPos);
    hand.getWorldPosition(handPos);

    const current = handPos.clone().sub(upperPos).normalize();
    if (current.lengthSq() < 0.0001) continue;

    const outward = upperPos.x >= 0 ? sinL : -sinL;
    const target  = new THREE.Vector3(outward, -cosL, 0).normalize();

    const worldDelta = new THREE.Quaternion().setFromUnitVectors(current, target);
    const curWorldQ  = new THREE.Quaternion();
    upper.getWorldQuaternion(curWorldQ);
    const newWorldQ  = worldDelta.multiply(curWorldQ);

    if (upper.parent) {
      const parentWorldQ = new THREE.Quaternion();
      upper.parent.getWorldQuaternion(parentWorldQ);
      upper.quaternion.copy(parentWorldQ.invert().multiply(newWorldQ));
    }

    model.updateMatrixWorld(true);
  }
}

// Blink morph target names used by Ready Player Me avatars
const BLINK_SHAPES = [
  'eyeBlinkLeft', 'eyeBlinkRight',
  'EyeBlink_L', 'EyeBlink_R',
  'blink_L', 'blink_R',
  'blink', 'Blink',
];

// Mouth/viseme morph targets driven during speech (RPM standard names)
const MOUTH_SHAPES = [
  'viseme_aa', 'viseme_O',
  'mouthOpen', 'jawOpen',
  'Mouth_Open', 'jaw_open',   // alternate naming seen in some RPM exports
];

export default function AvatarWidget() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const isTalkingRef  = useRef(false);   // set by malsy-tts custom event

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let alive = true;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // ── Talking state (driven by custom events) ───────────────────
    function onTTSEvent(e: Event) {
      isTalkingRef.current = (e as CustomEvent<{ speaking: boolean }>).detail.speaking;
    }
    window.addEventListener('malsy-tts', onTTSEvent);

    // ── Renderer ─────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); // fully transparent

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();

    scene.add(new THREE.HemisphereLight(0xfff5e8, 0x334455, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.8, 2.2, 2.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcce4ff, 0.6);
    fill.position.set(-1.2, 1.0, 0.8);
    scene.add(fill);

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 100);
    camera.position.set(0, 1.60, 0.90);
    camera.lookAt(new THREE.Vector3(0, 1.55, 0));

    // ── Avatar state ──────────────────────────────────────────
    const morphMeshes: THREE.Mesh[] = [];
    let headBone: THREE.Bone | null = null;
    let spineBone: THREE.Bone | null = null;

    // Blink state
    let blinkTimer = 1.5 + Math.random() * 2;
    let blinkPhase = 0;
    let blinkT = 0;
    let idleTime = 0;
    let talkTime = 0;

    function setMorph(name: string, value: number) {
      for (const mesh of morphMeshes) {
        const dict = mesh.morphTargetDictionary as Record<string, number> | undefined;
        const infl = mesh.morphTargetInfluences;
        if (!dict || !infl) continue;
        const i = dict[name];
        if (i !== undefined) infl[i] = Math.max(0, Math.min(1, value));
      }
    }

    function applyBlink(t: number) {
      for (const name of BLINK_SHAPES) setMorph(name, t);
    }

    function closeMouth() {
      for (const name of MOUTH_SHAPES) setMorph(name, 0);
    }

    // ── Load GLB ──────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load(
      '/avatar.glb',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gltf: any) => {
        if (!alive) return;
        const model: THREE.Group = gltf.scene;
        scene.add(model);

        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            morphMeshes.push(mesh);
          }
          const bone = obj as THREE.Bone;
          if (bone.isBone) {
            const n = bone.name.toLowerCase();
            if (!headBone && (n === 'head' || /mixamorig:head$/.test(n))) headBone = bone;
            if (!spineBone && (n === 'spine' || /mixamorig:spine$/.test(n))) spineBone = bone;
          }
        });

        poseArmsDown(model);
      },
      undefined,
      (err: unknown) => console.error('[AvatarWidget] GLB load error', err),
    );

    // ── Render loop ───────────────────────────────────────────
    let lastTs = 0;
    function tick(ts: number) {
      if (!alive) return;
      animId = requestAnimationFrame(tick);

      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      idleTime += dt;

      // ── Blinking ─────────────────────────────────────────
      blinkTimer -= dt;
      if (blinkTimer <= 0 && blinkPhase === 0) {
        blinkPhase = 1;
        blinkT = 0;
        blinkTimer = 3 + Math.random() * 5;
      }
      if (blinkPhase === 1) {
        blinkT = Math.min(blinkT + dt / 0.07, 1);
        applyBlink(blinkT);
        if (blinkT >= 1) { blinkPhase = 2; blinkT = 0; }
      } else if (blinkPhase === 2) {
        blinkT = Math.min(blinkT + dt / 0.10, 1);
        applyBlink(1 - blinkT);
        if (blinkT >= 1) { blinkPhase = 0; applyBlink(0); }
      }

      // ── Idle head drift ───────────────────────────────────
      if (headBone) {
        headBone.rotation.y = Math.sin(idleTime * 0.38) * 0.018;
        headBone.rotation.x = Math.sin(idleTime * 0.27 + 1.1) * 0.008;
      }

      // ── Breathing ─────────────────────────────────────────
      if (spineBone) {
        spineBone.rotation.x = Math.sin(idleTime * 1.25) * 0.006;
      }

      // ── Lip sync / jaw animation ──────────────────────────
      if (isTalkingRef.current) {
        talkTime += dt;
        // Compound sine waves → irregular jaw movement that mimics speech rhythm
        const raw =
          Math.sin(talkTime * 9.1)  * 0.50 +
          Math.sin(talkTime * 14.3) * 0.28 +
          Math.abs(Math.sin(talkTime * 5.7 + 1.0)) * 0.22;
        const jaw = Math.max(0, Math.min(0.85, raw));
        setMorph('viseme_aa', jaw * 0.95);
        setMorph('viseme_O',  jaw * 0.50);
        setMorph('mouthOpen', jaw * 0.80);
        setMorph('jawOpen',   jaw * 0.70);
        setMorph('Mouth_Open', jaw * 0.80);
        setMorph('jaw_open',   jaw * 0.70);
      } else if (talkTime > 0) {
        // Mouth just stopped — snap closed
        talkTime = 0;
        closeMouth();
      }

      renderer!.render(scene, camera);
    }

    animId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(animId);
      renderer?.dispose();
      renderer = null;
      window.removeEventListener('malsy-tts', onTTSEvent);
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 24,
        width: 320,
        height: 420,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
}
