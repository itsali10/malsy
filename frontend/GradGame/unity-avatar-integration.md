# Unity Avatar Integration Guide

## Option 1: Unity WebGL Export (Recommended for Full Unity Features)

### Steps:
1. In Unity, go to **File > Build Settings**
2. Select **WebGL** platform
3. Click **Build** and save to a folder (e.g., `unity-avatar-build`)
4. Copy the entire build folder to your project

### Integration:
The avatar container will automatically load your Unity WebGL build.

## Option 2: GLTF/GLB 3D Model (Recommended for Lightweight)

### Steps:
1. Export your avatar from Unity as GLTF or GLB
2. Place the model file in a `models/` folder
3. The Three.js integration will load and display it

## Option 3: Image Sequence (For 2D Avatars)

### Steps:
1. Export animation frames from Unity as PNG images
2. Place in `avatar-frames/` folder
3. The system will animate through the frames

## Option 4: Video Export

### Steps:
1. Record your Unity avatar animation as MP4
2. Place in project root
3. The video player will display it

