import { Vector3 } from 'three';

// Keep one controller state shared by the camera, avatar and UI through hot reloads.
const retained = import.meta.hot?.data.controls;
export const motion: { position: Vector3; yaw: number; facingYaw: number; pitch: number; firstPerson: boolean; cameraDistance: number; initialized: boolean; walking: boolean } = retained?.motion ?? { position: new Vector3(0, 0, 15), yaw: 0, facingYaw: 0, pitch: .12, firstPerson: false, cameraDistance: 5, initialized: false, walking: false };
export const touchInput: { x: number; z: number } = retained?.touchInput ?? { x: 0, z: 0 };
if (import.meta.hot) import.meta.hot.dispose(data => { data.controls = { motion, touchInput }; });
