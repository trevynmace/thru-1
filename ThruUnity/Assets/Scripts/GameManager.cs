using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Main game entry point. Replaces MonoGame's Game class (ThruGame).
    /// In Unity, most game loop functionality is handled by the engine,
    /// so this primarily handles initialization and global settings.
    ///
    /// Attach this to a GameObject in your main scene.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Prefabs")]
        [Tooltip("Prefab containing InputManager component")]
        public GameObject inputManagerPrefab;

        [Tooltip("Prefab containing GameStateManager component")]
        public GameObject gameStateManagerPrefab;

        [Header("Settings")]
        [Tooltip("Target screen width")]
        public int targetWidth = 1280;

        [Tooltip("Target screen height")]
        public int targetHeight = 720;

        [Tooltip("Background clear color")]
        public Color clearColor = Color.white;

        private void Awake()
        {
            // Singleton pattern
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            // Initialize core systems
            Initialize();
        }

        /// <summary>
        /// Initialize game systems (equivalent to MonoGame's Initialize + LoadContent)
        /// </summary>
        private void Initialize()
        {
            // Set up screen/camera
            SetupScreen();

            // Ensure InputManager exists
            EnsureManager<InputManager>(inputManagerPrefab, "InputManager");

            // Ensure GameStateManager exists
            EnsureManager<GameStateManager>(gameStateManagerPrefab, "GameStateManager");

            // Initialize audio (equivalent to MonoSoundManager.Init())
            InitializeAudio();

            Debug.Log("GameManager initialized successfully");
        }

        private void SetupScreen()
        {
            // Set resolution (optional - Unity typically handles this via Player Settings)
            // Screen.SetResolution(targetWidth, targetHeight, false);

            // Set camera background color
            if (Camera.main != null)
            {
                Camera.main.backgroundColor = clearColor;
            }

            // Cursor visibility (equivalent to IsMouseVisible = true)
            Cursor.visible = true;
        }

        /// <summary>
        /// Ensure a manager component exists, creating from prefab if needed
        /// </summary>
        private T EnsureManager<T>(GameObject prefab, string fallbackName) where T : MonoBehaviour
        {
            var existing = FindFirstObjectByType<T>();
            if (existing != null)
            {
                return existing;
            }

            GameObject managerObj;
            if (prefab != null)
            {
                managerObj = Instantiate(prefab);
            }
            else
            {
                managerObj = new GameObject(fallbackName);
                managerObj.AddComponent<T>();
            }

            return managerObj.GetComponent<T>();
        }

        private void InitializeAudio()
        {
            // Unity handles audio initialization automatically
            // You may want to set up an AudioManager here for pooling/management
            Debug.Log("Audio system initialized");
        }

        private void OnApplicationQuit()
        {
            // Cleanup (equivalent to UnloadContent)
            Debug.Log("GameManager shutting down");
        }

        /// <summary>
        /// Quit the application (called by UI or escape key)
        /// </summary>
        public void QuitGame()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }
    }
}
