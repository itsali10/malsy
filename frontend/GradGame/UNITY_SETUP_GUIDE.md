# Unity Setup Guide - Starting Your Malsy Project

## Step 1: Install Unity Hub

1. Go to https://unity.com/download
2. Download **Unity Hub** (not Unity Editor directly)
3. Install Unity Hub
4. Sign in with your Unity account

---

## Step 2: Install Unity Editor

1. Open **Unity Hub**
2. Click **"Installs"** tab (left sidebar)
3. Click **"Install Editor"**
4. Choose **Unity 2021.3 LTS** (Long Term Support) - Recommended
   - Why LTS? More stable, better for production
5. During installation, make sure to check:
   - ✅ **WebGL Build Support** (for web deployment)
   - ✅ **Windows Build Support** (if on Windows)
   - ✅ **Android Build Support** (if you want mobile later)
   - ✅ **iOS Build Support** (if you want iOS later)
6. Click **"Install"** and wait (this takes 10-30 minutes)

---

## Step 3: Create New Project

1. In Unity Hub, click **"Projects"** tab
2. Click **"New Project"**
3. Choose **Template: 3D (URP)** 
   - URP = Universal Render Pipeline (better graphics, good for web)
   - Alternative: 3D (Built-in) if you prefer
4. Set **Project Name:** `MalsyUnity`
5. Choose **Location:** `C:\Users\AM\OneDrive\Desktop\` (or wherever you want)
6. Click **"Create project"**
7. Wait for Unity to open (first time takes a few minutes)

---

## Step 4: Initial Project Setup

### A. Set Build Settings for WebGL

1. In Unity, go to **File > Build Settings**
2. Select **WebGL** platform
3. Click **"Switch Platform"** (wait for it to finish)
4. Close Build Settings

### B. Create Folder Structure

1. In **Project** window (bottom), right-click **Assets** folder
2. Create these folders:
   ```
   Assets/
   ├── Scenes/
   ├── Scripts/
   ├── Prefabs/
   ├── Models/
   ├── Materials/
   ├── Textures/
   ├── Audio/
   └── UI/
   ```

**How to create:**
- Right-click Assets → Create → Folder
- Name it "Scenes"
- Repeat for each folder

### C. Save Your First Scene

1. Go to **File > Save As**
2. Name it: `00_Login`
3. Save in: `Assets/Scenes/`
4. This will be your login screen

---

## Step 5: Install Essential Packages

### A. TextMeshPro (Usually Pre-installed)

1. If you see "Import TMP Essentials" popup → Click **"Import"**
2. If not, go to **Window > TextMeshPro > Import TMP Essential Resources**

### B. Firebase SDK (For Database)

1. Go to https://firebase.google.com/docs/unity/setup
2. Download **Firebase Unity SDK**
3. In Unity: **Assets > Import Package > Custom Package**
4. Select the Firebase SDK file
5. Import all (or select what you need)

---

## Step 6: Basic Setup Complete! ✅

Your Unity project is now ready!

---

## Next Steps (I Can Help With):

1. ✅ Create Login Scene UI
2. ✅ Set up Firebase Authentication
3. ✅ Create Dashboard Scene
4. ✅ Build Chemistry Lab
5. ✅ Integrate your Unity Avatar

---

## Quick Unity Basics

### Unity Interface:
- **Scene View:** Where you design your game
- **Game View:** What players see
- **Hierarchy:** List of objects in current scene
- **Inspector:** Properties of selected object
- **Project:** Your files and assets
- **Console:** Error messages and logs

### First Test:
1. In Hierarchy, right-click → **3D Object > Cube**
2. Press **Play** button (top center)
3. You should see a cube!
4. Press **Play** again to stop

---

## Common Issues & Solutions

### Issue: "WebGL not showing in Build Settings"
- **Solution:** Install WebGL module in Unity Hub > Installs > Add Modules

### Issue: "Project won't open"
- **Solution:** Make sure Unity version matches (2021.3 LTS)

### Issue: "Can't find TextMeshPro"
- **Solution:** Window > Package Manager > Search "TextMeshPro" > Install

---

## Ready to Start Building?

Once you have Unity open with your project, I can help you:
1. Create the login screen
2. Set up the database
3. Build the chemistry lab
4. Add your avatar

**Let me know when Unity is open and ready!** 🚀

