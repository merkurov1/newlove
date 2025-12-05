"use client";

import React from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';
import TIMELINE from '@/lib/unframedTimeline';

function TunnelText({ children, position = [0, 0, 0], size = 2 }: any) {
  return (
    <Text fontSize={size} color="#ffffff" anchorX="center" anchorY="middle" position={position} material-toneMapped={false}>
      {children}
    </Text>
  );
}

function CameraFollower({ totalDepth = 40 }: { totalDepth?: number }) {
  const { camera } = useThree();
  const scroll = useScroll();
  useFrame(() => {
    const z = 10 - scroll.offset * totalDepth;
    camera.position.z = z;
    camera.rotation.y = (scroll.offset - 0.5) * 0.05;
  });
  return null;
}

export default function TunnelScene() {
  const gap = 6;
  const { scene } = useThree();

  React.useEffect(() => {
    const fog = new THREE.Fog('black', 5, 40);
    scene.fog = fog;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 5, 5);
    scene.add(ambient);
    scene.add(dir);

    return () => {
      scene.fog = null as any;
      scene.remove(ambient);
      scene.remove(dir);
    };
  }, [scene]);

  return (
    <>
      <CameraFollower totalDepth={TIMELINE.length * gap + 10} />
      {TIMELINE.map((item, i) => {
        const z = -i * gap - 6;
        const size = Math.max(3.5, 6 - i * 0.4);
        return (
          <TunnelText key={item.year} size={size} position={[0, 0, z]}>
            {item.year}
          </TunnelText>
        );
      })}
    </>
  );
}
