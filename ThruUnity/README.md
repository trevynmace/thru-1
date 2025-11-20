# Thru - Unity Version

This is the Unity port of the Thru hiking game, converted from MonoGame.

## Quick Start

### 1. Open in Unity

1. Open Unity Hub
2. Click "Add" and select the `ThruUnity` folder
3. Open the project (Unity 2022.3+ recommended)

### 2. Initial Setup

Once the project opens:

1. Go to **Thru → Setup Scene** in the menu bar
2. Click **"Create Full Scene Structure"**
3. This creates all the managers, UI canvas, and views

### 3. Migrate Assets

1. Go to **Thru → Asset Migration Helper**
2. Set the MonoGame Content path to: `../Thru/Content`
3. Click **"Migrate Assets"**
4. Configure sprite import settings after migration

### 4. Wire Up References

In the Hierarchy, select **GameStateManager** and assign:
- Main Menu View
- Game View
- Settings View
- Character Creation View

## Project Structure

```
Assets/
├── Scripts/
│   ├── GameLogic/          # Game mechanics
│   │   ├── Characters/     # Character system
│   │   ├── Items/          # Inventory system
│   │   ├── TrailMaps/      # Map system
│   │   └── Encounter/      # Encounters
│   ├── GameUI/             # UI components
│   │   ├── Views/          # View implementations
│   │   ├── Models/         # UI models
│   │   └── Components/     # Buttons, etc.
│   ├── FileIO/             # JSON loading
│   └── Utility/            # Helpers
├── Editor/                 # Editor tools
├── Resources/              # Runtime-loaded assets
│   └── Data/               # JSON data files
├── Sprites/                # Image assets
├── Audio/                  # Sound files
├── Prefabs/                # Prefab templates
└── Fonts/                  # Font assets
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `GameManager.cs` | Main entry point |
| `GameStateManager.cs` | State machine |
| `InputManager.cs` | Input handling |
| `CharacterModel.cs` | Layered character sprites |
| `InventorySystem.cs` | Drag-and-drop inventory |
| `TrailMap.cs` | Map/trail management |
| `Encounter.cs` | Dice-roll encounters |

## API Translation Guide

| MonoGame | Unity |
|----------|-------|
| `Game.Update()` | `MonoBehaviour.Update()` |
| `SpriteBatch.Draw()` | `SpriteRenderer` |
| `GameTime.ElapsedGameTime` | `Time.deltaTime` |
| `Content.Load<T>()` | `Resources.Load<T>()` |
| `Keyboard.GetState()` | `Input.GetKey()` |
| `Mouse.GetState()` | `Input.mousePosition` |

## Next Steps

1. **Import remaining sprites** from MonoGame Content
2. **Create character prefabs** using the editor tool
3. **Test the inventory system** with sample items
4. **Set up the trail map** with location data
5. **Create encounters** using the JSON data format

## Dependencies

- TextMesh Pro (included)
- Newtonsoft JSON (included)
- Unity Input System (optional)

## Troubleshooting

### Scripts not compiling
- Make sure TextMesh Pro is imported (Window → TextMeshPro → Import TMP Essential Resources)

### Assets not loading
- Check that JSON files are in `Resources/Data/`
- Check that sprites are set to "Sprite (2D and UI)" type

### UI not showing
- Ensure EventSystem exists in scene
- Check Canvas render mode is "Screen Space - Overlay"

## Original MonoGame Project

The original MonoGame source is in `../Thru/`. Key files:
- `ThruGame.cs` - Main game class
- `GlobalState.cs` - State management
- `Content/` - All assets

---

Converted with Claude Code
