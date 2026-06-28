"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";

export default function Hero3DScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Remove static fallback once the 3D scene mounts
    const fallback = document.getElementById("hero-fallback");
    if (fallback && fallback.parentNode) {
      try { fallback.parentNode.removeChild(fallback); } catch (e) {}
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f5ef);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 0.6, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 20;
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0xfff4e6, 0.35);
    fill.position.set(-4, -2, -2);
    scene.add(fill);

    const group = new THREE.Group();
    group.scale.setScalar(1.05);
    scene.add(group);

    const createBlob = (color, pos, scale) => {
      const geometry = new THREE.IcosahedronGeometry(1, 4);
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.18,
        roughness: 0.26,
        emissive: new THREE.Color(color).multiplyScalar(0.02),
        clearcoat: 0.25,
        clearcoatRoughness: 0.18,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...pos);
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      group.add(mesh);
      return mesh;
    };

    const blobs = [
      createBlob(0x7b9274, [1.6, -0.2, 0.1], 1.3),
      createBlob(0xa88034, [-1.1, 0.35, -0.3], 1.05),
      createBlob(0xc8d4bf, [0, 1.05, -0.9], 0.85),
    ];

    // soft circular ground shadow
    const shadowGeo = new THREE.CircleGeometry(3.2, 64);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -1.25;
    shadowMesh.receiveShadow = true;
    scene.add(shadowMesh);

    // subtle particle points
    const particlesCount = 140;
    const positions = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 6.6;
      positions[i * 3 + 1] = Math.random() * 2.4 - 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4.4;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, transparent: true, opacity: 0.9 });
    const particles = new THREE.Points(particleGeo, particleMat);
    group.add(particles);

    scene.fog = new THREE.Fog(0xf7f5ef, 6, 15);

    const clock = new THREE.Clock();
    let frameId;

    // pointer parallax
    const pointer = { x: 0, y: 0 };
    function onPointerMove(e) {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    }
    mount.addEventListener("pointermove", onPointerMove);

    function animate() {
      const t = clock.getElapsedTime();

      // parallax camera subtle movement
      camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.06;
      camera.position.y += (pointer.y * 0.35 - camera.position.y) * 0.06;
      camera.lookAt(0, 0.2, 0);

      blobs.forEach((b, i) => {
        b.rotation.y += 0.28 * 0.016 * (1 + i * 0.15);
        b.rotation.x += 0.14 * 0.016 * (1 + i * 0.12);
        b.position.y = Math.sin(t * 0.7 * (1 + i * 0.12)) * 0.18 * b.scale.x;
      });

      // gentle particle movement
      const pos = particleGeo.attributes.position.array;
      for (let i = 0; i < particlesCount; i++) {
        pos[i * 3 + 1] += 0.002 + Math.sin(t + i) * 0.0006;
        if (pos[i * 3 + 1] > 2.3) pos[i * 3 + 1] = -0.2;
      }
      particleGeo.attributes.position.needsUpdate = true;

      // subtle group rotation for cinematic effect
      group.rotation.y = Math.sin(t * 0.06) * 0.08;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    return () => {
      mount.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="hero-visual hero-canvas" />;
}
