# Unity Project Structure for Malsy

## Recommended Folder Structure

```
MalsyUnity/
├── Assets/
│   ├── Scenes/
│   │   ├── 00_Login.unity
│   │   ├── 01_Dashboard.unity
│   │   ├── 02_ChemistryLab.unity
│   │   ├── 03_Games.unity
│   │   └── 04_Subjects.unity
│   ├── Scripts/
│   │   ├── Authentication/
│   │   │   ├── LoginManager.cs
│   │   │   └── SignupManager.cs
│   │   ├── Database/
│   │   │   └── FirebaseManager.cs
│   │   ├── Chemistry/
│   │   │   ├── ChemicalReaction.cs
│   │   │   ├── EquipmentManager.cs
│   │   │   └── LiquidSimulation.cs
│   │   ├── UI/
│   │   │   ├── DashboardUI.cs
│   │   │   └── GameUI.cs
│   │   └── Avatar/
│   │       └── AvatarController.cs
│   ├── Prefabs/
│   │   ├── Equipment/
│   │   │   ├── Beaker.prefab
│   │   │   ├── Flask.prefab
│   │   │   └── TestTube.prefab
│   │   └── UI/
│   │       └── Button.prefab
│   ├── Models/
│   │   ├── LabEquipment/
│   │   └── Avatar/
│   ├── Materials/
│   │   ├── Liquid.mat
│   │   └── Glass.mat
│   ├── Textures/
│   └── Audio/
└── ProjectSettings/
```

## Key Unity Components Needed

### 1. Scene Manager
- Handle scene transitions
- Save/load game state

### 2. Firebase Integration
- Authentication
- Database (Firestore)
- Real-time updates

### 3. Chemistry Lab System
- 3D equipment models
- Liquid physics
- Reaction system
- Particle effects

### 4. UI System
- Canvas for all screens
- Input fields
- Buttons and navigation

### 5. Avatar System
- Your Unity avatar
- Animation controller
- Speech bubble system

