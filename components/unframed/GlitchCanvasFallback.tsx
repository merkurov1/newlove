"use client";

import React, { useEffect, useRef } from 'react';

export default function GlitchCanvasFallback() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    let renderer: any = null;
    let scene: any = null;
    let camera: any = null;
    let animationId: number | null = null;

    async function init() {
      const THREE = await import('three');

      if (!mounted || !ref.current) return;

      const width = ref.current.clientWidth || window.innerWidth;
      const height = ref.current.clientHeight || window.innerHeight;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      ref.current.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
      camera.position.z = 5;

      // Particles
      const count = 2000;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = Math.random() * 2.0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi) - 1.5;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({ size: 0.03, color: 0xff5555 });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      // Lights
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);

      const dir = new THREE.DirectionalLight(0xffffff, 0.6);
      dir.position.set(5, 5, 5);
      scene.add(dir);

      const onResize = () => {
        if (!ref.current || !renderer || !camera) return;
        const w = ref.current.clientWidth || window.innerWidth;
        const h = ref.current.clientHeight || window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      window.addEventListener('resize', onResize);

      const start = performance.now();
      const animate = (t: number) => {
        if (!mounted) return;
        const elapsed = (t - start) / 1000;
        points.rotation.x = elapsed * 0.02;
        points.rotation.y = elapsed * 0.015;
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };

      animationId = requestAnimationFrame(animate);

      // cleanup
      return () => {
        mounted = false;
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener('resize', onResize);
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        }
        if (geometry) geometry.dispose();
      };
    }

    let cleanup: any;
    init().then((c) => (cleanup = c)).catch((e) => console.error('GlitchCanvasFallback init error', e));

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={ref} className="w-full h-full" />;
}
