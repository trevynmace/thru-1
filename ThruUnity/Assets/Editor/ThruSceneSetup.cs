using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using TMPro;

namespace Thru.Editor
{
    /// <summary>
    /// Editor tool to automatically set up the Thru game scene structure.
    /// </summary>
    public class ThruSceneSetup : EditorWindow
    {
        [MenuItem("Thru/Setup Scene")]
        public static void ShowWindow()
        {
            GetWindow<ThruSceneSetup>("Thru Scene Setup");
        }

        private void OnGUI()
        {
            GUILayout.Label("Thru Scene Setup", EditorStyles.boldLabel);
            EditorGUILayout.Space();

            EditorGUILayout.HelpBox(
                "This will create the complete game hierarchy in your current scene.\n" +
                "Make sure you have an empty scene or backup your current scene first.",
                MessageType.Info);

            EditorGUILayout.Space();

            if (GUILayout.Button("Create Full Scene Structure", GUILayout.Height(40)))
            {
                CreateFullSceneStructure();
            }

            EditorGUILayout.Space();
            GUILayout.Label("Individual Components", EditorStyles.boldLabel);

            if (GUILayout.Button("Create Managers"))
            {
                CreateManagers();
            }

            if (GUILayout.Button("Create Main Camera"))
            {
                CreateMainCamera();
            }

            if (GUILayout.Button("Create UI Canvas"))
            {
                CreateUICanvas();
            }

            if (GUILayout.Button("Create Event System"))
            {
                CreateEventSystem();
            }
        }

        private void CreateFullSceneStructure()
        {
            // Create managers
            CreateManagers();

            // Create camera
            CreateMainCamera();

            // Create event system
            CreateEventSystem();

            // Create UI canvas with all views
            CreateUICanvas();

            Debug.Log("Thru scene structure created successfully!");
            EditorUtility.DisplayDialog("Setup Complete",
                "Scene structure has been created.\n\n" +
                "Next steps:\n" +
                "1. Wire up view references in GameStateManager\n" +
                "2. Import your sprite assets\n" +
                "3. Create prefabs for characters and items",
                "OK");
        }

        private void CreateManagers()
        {
            // GameManager
            if (FindFirstObjectByType<GameManager>() == null)
            {
                var gameManager = new GameObject("GameManager");
                gameManager.AddComponent<GameManager>();
                Debug.Log("Created GameManager");
            }

            // InputManager
            if (FindFirstObjectByType<InputManager>() == null)
            {
                var inputManager = new GameObject("InputManager");
                inputManager.AddComponent<InputManager>();
                Debug.Log("Created InputManager");
            }

            // GameStateManager
            if (FindFirstObjectByType<GameStateManager>() == null)
            {
                var stateManager = new GameObject("GameStateManager");
                stateManager.AddComponent<GameStateManager>();
                Debug.Log("Created GameStateManager");
            }

            // InventorySystem
            if (FindFirstObjectByType<InventorySystem>() == null)
            {
                var inventorySystem = new GameObject("InventorySystem");
                inventorySystem.AddComponent<InventorySystem>();
                Debug.Log("Created InventorySystem");
            }
        }

        private void CreateMainCamera()
        {
            var existingCamera = Camera.main;
            if (existingCamera == null)
            {
                var cameraObj = new GameObject("Main Camera");
                var camera = cameraObj.AddComponent<Camera>();
                camera.orthographic = true;
                camera.orthographicSize = 5;
                camera.backgroundColor = Color.white;
                cameraObj.AddComponent<AudioListener>();
                cameraObj.tag = "MainCamera";
                existingCamera = camera;
            }

            // Add camera controller if not present
            if (existingCamera.GetComponent<CameraController>() == null)
            {
                existingCamera.gameObject.AddComponent<CameraController>();
            }

            Debug.Log("Main Camera configured");
        }

        private void CreateEventSystem()
        {
            if (FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
            {
                var eventSystem = new GameObject("EventSystem");
                eventSystem.AddComponent<UnityEngine.EventSystems.EventSystem>();
                eventSystem.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
                Debug.Log("Created EventSystem");
            }
        }

        private void CreateUICanvas()
        {
            // Main Canvas
            var canvasObj = new GameObject("UI Canvas");
            var canvas = canvasObj.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasObj.AddComponent<CanvasScaler>();
            canvasObj.AddComponent<GraphicRaycaster>();

            // Configure canvas scaler
            var scaler = canvasObj.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            // Create view containers
            CreateViewPanel(canvasObj.transform, "MainMenuView", typeof(MainMenuView));
            CreateViewPanel(canvasObj.transform, "MainSettingsView", null); // Placeholder
            CreateViewPanel(canvasObj.transform, "CharacterCreationView", null); // Placeholder

            // GameView with sub-views
            var gameView = CreateViewPanel(canvasObj.transform, "GameView", typeof(GameView));
            CreateViewPanel(gameView.transform, "PlayView", typeof(PlayGameView));
            CreateViewPanel(gameView.transform, "MapView", typeof(MapGameView));
            CreateViewPanel(gameView.transform, "InventoryView", typeof(InventoryGameView));

            // HUD
            var hud = CreateViewPanel(canvasObj.transform, "HUD", typeof(HUD));
            CreateStatusBar(hud.transform, "HealthBar", Color.green);
            CreateStatusBar(hud.transform, "StaminaBar", Color.yellow);

            Debug.Log("Created UI Canvas with views");
        }

        private GameObject CreateViewPanel(Transform parent, string name, System.Type componentType)
        {
            var panel = new GameObject(name);
            panel.transform.SetParent(parent, false);

            var rectTransform = panel.AddComponent<RectTransform>();
            rectTransform.anchorMin = Vector2.zero;
            rectTransform.anchorMax = Vector2.one;
            rectTransform.sizeDelta = Vector2.zero;
            rectTransform.anchoredPosition = Vector2.zero;

            panel.AddComponent<CanvasGroup>();

            if (componentType != null)
            {
                panel.AddComponent(componentType);
            }

            // Start hidden except MainMenuView
            if (name != "MainMenuView" && name != "HUD")
            {
                panel.SetActive(false);
            }

            return panel;
        }

        private void CreateStatusBar(Transform parent, string name, Color fillColor)
        {
            var barObj = new GameObject(name);
            barObj.transform.SetParent(parent, false);

            var rectTransform = barObj.AddComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(200, 20);

            var statusBar = barObj.AddComponent<StatusBar>();
            statusBar.fillColor = fillColor;
            statusBar.statName = name.Replace("Bar", "");

            // Background
            var bgObj = new GameObject("Background");
            bgObj.transform.SetParent(barObj.transform, false);
            var bgRect = bgObj.AddComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.sizeDelta = Vector2.zero;
            var bgImage = bgObj.AddComponent<Image>();
            bgImage.color = Color.gray;
            statusBar.backgroundImage = bgImage;

            // Fill
            var fillObj = new GameObject("Fill");
            fillObj.transform.SetParent(barObj.transform, false);
            var fillRect = fillObj.AddComponent<RectTransform>();
            fillRect.anchorMin = Vector2.zero;
            fillRect.anchorMax = Vector2.one;
            fillRect.sizeDelta = Vector2.zero;
            var fillImage = fillObj.AddComponent<Image>();
            fillImage.color = fillColor;
            fillImage.type = Image.Type.Filled;
            fillImage.fillMethod = Image.FillMethod.Horizontal;
            statusBar.fillImage = fillImage;
        }

        [MenuItem("Thru/Create Character Prefab")]
        public static void CreateCharacterPrefab()
        {
            var charObj = new GameObject("Character");
            charObj.AddComponent<CharacterModel>();

            // Create sprite layers
            string[] layers = { "Body", "Hair", "Eyes", "Arms", "Shirt", "Pants", "Shoes" };
            int sortOrder = 0;

            foreach (var layer in layers)
            {
                var layerObj = new GameObject(layer);
                layerObj.transform.SetParent(charObj.transform, false);
                var sprite = layerObj.AddComponent<CharacterModelSprite>();
                var renderer = layerObj.GetComponent<SpriteRenderer>();
                renderer.sortingOrder = sortOrder++;
            }

            // Save as prefab
            string path = "Assets/Prefabs/Character.prefab";
            EnsureDirectoryExists(path);
            PrefabUtility.SaveAsPrefabAsset(charObj, path);
            DestroyImmediate(charObj);

            Debug.Log($"Created Character prefab at {path}");
        }

        [MenuItem("Thru/Create Button Prefab")]
        public static void CreateButtonPrefab()
        {
            var buttonObj = new GameObject("ThruButton");

            var rectTransform = buttonObj.AddComponent<RectTransform>();
            rectTransform.sizeDelta = new Vector2(200, 50);

            var image = buttonObj.AddComponent<Image>();
            image.color = Color.white;

            buttonObj.AddComponent<ThruButton>();

            // Text child
            var textObj = new GameObject("Text");
            textObj.transform.SetParent(buttonObj.transform, false);
            var textRect = textObj.AddComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.sizeDelta = Vector2.zero;
            var tmp = textObj.AddComponent<TextMeshProUGUI>();
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.black;
            tmp.text = "Button";

            // Save as prefab
            string path = "Assets/Prefabs/ThruButton.prefab";
            EnsureDirectoryExists(path);
            PrefabUtility.SaveAsPrefabAsset(buttonObj, path);
            DestroyImmediate(buttonObj);

            Debug.Log($"Created Button prefab at {path}");
        }

        private static void EnsureDirectoryExists(string path)
        {
            string directory = System.IO.Path.GetDirectoryName(path);
            if (!System.IO.Directory.Exists(directory))
            {
                System.IO.Directory.CreateDirectory(directory);
            }
        }
    }
}
