import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = '/avatar3d/generated/kurage-3d-avatar.glb';

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

function setMorph(meshes: MorphMesh[], name: string, value: number) {
  for (const mesh of meshes) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index !== undefined && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[index] = value;
    }
  }
}

export function Avatar3dSample() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('3Dモデルを読み込み中');
  const [error, setError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4fcfd');
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(0, 0.05, 3.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.7;
    controls.maxDistance = 4.5;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight('#ffffff', 2.0));
    scene.add(new THREE.HemisphereLight('#ffffff', '#d8eef1', 2.8));
    const key = new THREE.DirectionalLight('#fff7ef', 3.6);
    key.position.set(3, 4, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#8de9f4', 1.0);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const clock = new THREE.Clock();
    const morphMeshes: MorphMesh[] = [];
    let model: THREE.Group | null = null;
    let baseModelY = 0;
    let frameId = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        model.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as MorphMesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
              morphMeshes.push(mesh);
            }
          }
        });

        const initialBox = new THREE.Box3().setFromObject(model);
        const initialSize = initialBox.getSize(new THREE.Vector3());
        const scale = 3.25 / Math.max(initialSize.y, 0.01);
        model.scale.setScalar(scale);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y -= 0.62;
        baseModelY = model.position.y;
        scene.add(model);
        setStatus(`表示中: リグ1本・表情モーフ${morphMeshes.length ? '検出済み' : '未検出'}`);
      },
      undefined,
      (loadError) => {
        console.error(loadError);
        setError('3Dモデルがありません。npm run avatar3d:build を実行してください。');
        setStatus('読み込み失敗');
      },
    );

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (model) {
        model.rotation.y = Math.sin(t * 0.42) * 0.055;
        model.position.y = baseModelY + Math.sin(t * 1.25) * 0.006;

        const mouth = 0.08 + Math.max(0, Math.sin(t * 6.3)) * 0.62;
        setMorph(morphMeshes, 'Expressions_mouthOpen_max', mouth);

        const blinkPhase = t % 4.6;
        const blink = blinkPhase > 4.42 ? Math.sin(((blinkPhase - 4.42) / 0.18) * Math.PI) : 0;
        setMorph(morphMeshes, 'Expressions_eyeClosedL_max', blink);
        setMorph(morphMeshes, 'Expressions_eyeClosedR_max', blink);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main className="avatar3d-page">
      <header className="avatar3d-header">
        <a href="/avatar3d-sample" className="avatar3d-brand">Kurage AI VTuber</a>
        <div>
          <p className="avatar3d-kicker">HEADLESS 3D AVATAR LAB</p>
          <h1>AIがコードから生成するKurage 3Dアバター</h1>
          <p>
            GUI操作ではなく、MB-LabとBlender Pythonで素体、髪、衣装、リグ、表情を再現可能に生成します。
          </p>
        </div>
      </header>
      <section className="avatar3d-stage-card">
        <div ref={mountRef} className="avatar3d-canvas" aria-label="Kurage 3D avatar preview" />
        <aside className="avatar3d-info">
          <span className="avatar3d-status">{status}</span>
          {error && <p className="avatar3d-error">{error}</p>}
          <dl>
            <div><dt>生成</dt><dd>Blender 4.2 Headless</dd></div>
            <div><dt>素体・リグ</dt><dd>MB-Lab Anime Female</dd></div>
            <div><dt>動作</dt><dd>口パク・まばたき・呼吸</dd></div>
            <div><dt>形式</dt><dd>GLB + 83 facial morphs</dd></div>
          </dl>
          <p className="avatar3d-note">
            ドラッグで回転、ホイールで拡大できます。これは実際に生成したGLBをブラウザで表示しています。
          </p>
        </aside>
      </section>
    </main>
  );
}
